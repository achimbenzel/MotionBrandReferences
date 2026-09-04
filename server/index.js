/**
 * Design Reference — local backend API.
 *
 * Responsibilities:
 *   - Persist project metadata in data/db.json (human-readable JSON).
 *   - Store all uploaded binaries (videos, images, PDFs, generated frames)
 *     under data/<type>/<id>/ so the library survives app updates.
 *   - Serve those files back (with HTTP range support for video seeking).
 *
 * The `data/` directory is the single source of truth and is git-ignored.
 * Nothing in `src/` or the build output ever writes here at build time.
 */
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { nanoid } from 'nanoid';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const TMP_DIR = path.join(DATA_DIR, 'tmp');
const DB_PATH = path.join(DATA_DIR, 'db.json');
const DIST_DIR = path.join(ROOT, 'dist');
const PORT = process.env.API_PORT || 4300;
const IS_PROD = process.env.NODE_ENV === 'production';

const TYPES = new Set(['motion', 'color', 'branding']);

// ---------------------------------------------------------------------------
// Storage helpers
// ---------------------------------------------------------------------------
function ensureDirs() {
  for (const d of [DATA_DIR, TMP_DIR, path.join(DATA_DIR, 'motion'), path.join(DATA_DIR, 'color'), path.join(DATA_DIR, 'branding')]) {
    fs.mkdirSync(d, { recursive: true });
  }
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify({ projects: [] }, null, 2));
  }
}

// Serialize db writes so concurrent requests can't clobber each other.
let writeChain = Promise.resolve();
async function readDB() {
  const raw = await fsp.readFile(DB_PATH, 'utf8');
  return JSON.parse(raw);
}
function mutateDB(mutator) {
  writeChain = writeChain.then(async () => {
    const db = await readDB();
    const result = await mutator(db);
    await fsp.writeFile(DB_PATH, JSON.stringify(db, null, 2));
    return result;
  });
  return writeChain;
}

const sanitize = (name) => String(name || '').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
const extOf = (name) => {
  const e = path.extname(String(name || '')).toLowerCase();
  return e && e.length <= 6 ? e : '';
};

// ---------------------------------------------------------------------------
// Upload middleware — files land in a per-request tmp folder, then the route
// handler moves them into their final home once the project id is known.
// ---------------------------------------------------------------------------
const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    if (!req.tmpDir) {
      req.tmpDir = path.join(TMP_DIR, nanoid());
      fs.mkdirSync(req.tmpDir, { recursive: true });
    }
    cb(null, req.tmpDir);
  },
  filename: (_req, file, cb) => cb(null, `${nanoid(8)}__${sanitize(file.originalname)}`),
});
const upload = multer({ storage, limits: { fileSize: 1024 * 1024 * 1024 } }); // 1 GB/file

async function moveInto(dir, tmpPath, finalName) {
  await fsp.mkdir(dir, { recursive: true });
  const dest = path.join(dir, finalName);
  await fsp.rename(tmpPath, dest).catch(async (err) => {
    // rename across devices can fail — fall back to copy.
    if (err.code === 'EXDEV') {
      await fsp.copyFile(tmpPath, dest);
      await fsp.unlink(tmpPath);
    } else throw err;
  });
  return finalName;
}
async function cleanupTmp(req) {
  if (req.tmpDir) await fsp.rm(req.tmpDir, { recursive: true, force: true }).catch(() => {});
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------
ensureDirs();
const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

// Serve the content library. express.static supports HTTP range requests,
// which the video player needs for seeking.
app.use('/data', express.static(DATA_DIR, {
  setHeaders: (res) => res.setHeader('Cache-Control', 'no-cache'),
}));

// ---- Read -----------------------------------------------------------------
app.get('/api/projects', async (req, res) => {
  const db = await readDB();
  let projects = db.projects;
  if (req.query.type && TYPES.has(req.query.type)) {
    projects = projects.filter((p) => p.type === req.query.type);
  }
  projects = [...projects].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  res.json({ projects });
});

app.get('/api/projects/:id', async (req, res) => {
  const db = await readDB();
  const project = db.projects.find((p) => p.id === req.params.id);
  if (!project) return res.status(404).json({ error: 'not_found' });
  res.json({ project });
});

// ---- Create ---------------------------------------------------------------
app.post('/api/projects', upload.any(), async (req, res) => {
  try {
    const type = req.body.type;
    if (!TYPES.has(type)) {
      await cleanupTmp(req);
      return res.status(400).json({ error: 'invalid_type' });
    }
    const id = nanoid(10);
    const dir = path.join(DATA_DIR, type, id);
    const files = req.files || [];
    const byField = (name) => files.find((f) => f.fieldname === name);
    const now = Date.now();

    const project = {
      id,
      type,
      title: (req.body.title || 'Untitled').trim(),
      year: (req.body.year || '').trim(),
      category: (req.body.category || '').trim(),
      tags: parseJSON(req.body.tags, []),
      notes: (req.body.notes || '').trim(),
      createdAt: now,
    };

    if (type === 'motion') {
      const video = byField('video');
      const thumb = byField('thumb');
      if (!video) { await cleanupTmp(req); return res.status(400).json({ error: 'video_required' }); }
      project.video = await moveInto(dir, video.path, `video${extOf(video.originalname) || '.mp4'}`);
      if (thumb) project.thumb = await moveInto(dir, thumb.path, 'thumb.webp');
      project.duration = Number(req.body.duration) || 0;
      project.frames = [];
    }

    if (type === 'color') {
      const example = byField('example');
      if (example) project.example = await moveInto(dir, example.path, `example${extOf(example.originalname) || '.png'}`);
      project.colors = parseJSON(req.body.colors, []).map((c) => ({ id: nanoid(6), ...c }));
      if (!project.thumb && project.example) project.thumb = project.example;
    }

    if (type === 'branding') {
      project.assets = [];
      for (const f of files) {
        if (f.fieldname !== 'files') continue;
        const ext = extOf(f.originalname);
        const kind = ext === '.pdf' ? 'pdf' : 'image';
        const assetId = nanoid(6);
        const stored = await moveInto(dir, f.path, `${assetId}${ext || (kind === 'pdf' ? '.pdf' : '.png')}`);
        project.assets.push({ id: assetId, kind, file: stored, name: f.originalname });
      }
      // First image asset (if any) becomes the card thumbnail.
      const firstImage = project.assets.find((a) => a.kind === 'image');
      if (firstImage) project.thumb = firstImage.file;
    }

    await mutateDB((db) => { db.projects.push(project); });
    await cleanupTmp(req);
    res.status(201).json({ project });
  } catch (err) {
    await cleanupTmp(req);
    console.error('create failed', err);
    res.status(500).json({ error: 'create_failed', message: String(err.message || err) });
  }
});

// ---- Update (notes / tags / colors / meta) --------------------------------
const EDITABLE = ['title', 'year', 'category', 'notes', 'tags', 'colors'];
app.patch('/api/projects/:id', async (req, res) => {
  try {
    const updated = await mutateDB((db) => {
      const project = db.projects.find((p) => p.id === req.params.id);
      if (!project) return null;
      for (const key of EDITABLE) {
        if (key in req.body) {
          if (key === 'colors' && Array.isArray(req.body.colors)) {
            project.colors = req.body.colors.map((c) => ({ id: c.id || nanoid(6), ...c }));
          } else {
            project[key] = req.body[key];
          }
        }
      }
      return project;
    });
    if (!updated) return res.status(404).json({ error: 'not_found' });
    res.json({ project: updated });
  } catch (err) {
    res.status(500).json({ error: 'update_failed', message: String(err.message || err) });
  }
});

// ---- Add a frame (webp) to a motion project -------------------------------
app.post('/api/projects/:id/frames', upload.single('frame'), async (req, res) => {
  try {
    const db = await readDB();
    const project = db.projects.find((p) => p.id === req.params.id);
    if (!project || project.type !== 'motion') { await cleanupTmp(req); return res.status(404).json({ error: 'not_found' }); }
    if (!req.file) return res.status(400).json({ error: 'frame_required' });

    const dir = path.join(DATA_DIR, 'motion', project.id, 'frames');
    const frameId = nanoid(8);
    const stored = await moveInto(dir, req.file.path, `${frameId}.webp`);
    const frame = {
      id: frameId,
      file: `frames/${stored}`,
      t: Number(req.body.t) || 0,
      createdAt: Date.now(),
    };
    const updated = await mutateDB((d) => {
      const p = d.projects.find((x) => x.id === project.id);
      p.frames = p.frames || [];
      p.frames.push(frame);
      return p;
    });
    await cleanupTmp(req);
    res.status(201).json({ frame, project: updated });
  } catch (err) {
    await cleanupTmp(req);
    res.status(500).json({ error: 'frame_failed', message: String(err.message || err) });
  }
});

// ---- Delete a frame -------------------------------------------------------
app.delete('/api/projects/:id/frames/:frameId', async (req, res) => {
  try {
    let removedFile = null;
    const updated = await mutateDB((db) => {
      const project = db.projects.find((p) => p.id === req.params.id);
      if (!project || !project.frames) return null;
      const idx = project.frames.findIndex((f) => f.id === req.params.frameId);
      if (idx === -1) return null;
      removedFile = project.frames[idx].file;
      project.frames.splice(idx, 1);
      return project;
    });
    if (!updated) return res.status(404).json({ error: 'not_found' });
    if (removedFile) {
      // removedFile is stored relative to the project dir (e.g. "frames/x.webp").
      await fsp.rm(path.join(DATA_DIR, 'motion', req.params.id, removedFile), { force: true }).catch(() => {});
    }
    res.json({ project: updated });
  } catch (err) {
    res.status(500).json({ error: 'delete_frame_failed', message: String(err.message || err) });
  }
});

// ---- Delete a whole project ----------------------------------------------
app.delete('/api/projects/:id', async (req, res) => {
  try {
    let type = null;
    const ok = await mutateDB((db) => {
      const idx = db.projects.findIndex((p) => p.id === req.params.id);
      if (idx === -1) return false;
      type = db.projects[idx].type;
      db.projects.splice(idx, 1);
      return true;
    });
    if (!ok) return res.status(404).json({ error: 'not_found' });
    await fsp.rm(path.join(DATA_DIR, type, req.params.id), { recursive: true, force: true }).catch(() => {});
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'delete_failed', message: String(err.message || err) });
  }
});

// ---------------------------------------------------------------------------
// In production (npm start) serve the built frontend from the same origin.
// ---------------------------------------------------------------------------
if (IS_PROD && fs.existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/data')) return next();
    res.sendFile(path.join(DIST_DIR, 'index.html'));
  });
}

function parseJSON(value, fallback) {
  if (value == null) return fallback;
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

app.listen(PORT, () => {
  console.log(`\n  Design Reference API  →  http://localhost:${PORT}`);
  console.log(`  Library folder        →  ${DATA_DIR}`);
  if (IS_PROD) console.log(`  Serving built app     →  http://localhost:${PORT}\n`);
  else console.log(`  Frontend (dev)        →  http://localhost:4200\n`);
});
