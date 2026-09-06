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

const TYPES = new Set(['motion', 'color', 'branding', 'logo', 'businesscard', 'imagegallery']);
const DEFAULT_STORAGE_LIMIT = 80 * 1024 * 1024 * 1024; // 80 GB

// ---------------------------------------------------------------------------
// Storage helpers
// ---------------------------------------------------------------------------
function ensureDirs() {
  const typeDirs = [...TYPES].map((t) => path.join(DATA_DIR, t));
  for (const d of [DATA_DIR, TMP_DIR, path.join(DATA_DIR, 'plan'), ...typeDirs]) {
    fs.mkdirSync(d, { recursive: true });
  }
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify({ projects: [], galleries: [], plans: [], settings: { storageLimitBytes: DEFAULT_STORAGE_LIMIT } }, null, 2));
  }
}

// Serialize db writes so concurrent requests can't clobber each other.
let writeChain = Promise.resolve();
async function readDB() {
  const raw = await fsp.readFile(DB_PATH, 'utf8');
  const db = JSON.parse(raw);
  // Normalize older databases so new fields always exist.
  if (!Array.isArray(db.projects)) db.projects = [];
  if (!Array.isArray(db.galleries)) db.galleries = [];
  if (!Array.isArray(db.plans)) db.plans = [];
  if (!db.settings || typeof db.settings !== 'object') db.settings = {};
  if (db.settings.storageLimitBytes == null) db.settings.storageLimitBytes = DEFAULT_STORAGE_LIMIT;
  return db;
}

// Recursively sum the size of every file under a directory.
async function folderSize(dir) {
  let total = 0;
  const entries = await fsp.readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) total += await folderSize(p);
    else { const st = await fsp.stat(p).catch(() => null); if (st) total += st.size; }
  }
  return total;
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
      if (!video) { await cleanupTmp(req); return res.status(400).json({ error: 'video_required' }); }
      project.video = await moveInto(dir, video.path, `video${extOf(video.originalname) || '.mp4'}`);
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
      // First image asset (if any) becomes the default card thumbnail.
      const firstImage = project.assets.find((a) => a.kind === 'image');
      if (firstImage) project.thumb = firstImage.file;
    }

    if (type === 'logo') {
      // A logo is one image (SVG or PNG). Each "rendition" is a pair of a logo
      // colour (a hex to recolour the silhouette via CSS mask, or 'original' to
      // keep the image) and a background colour, so e.g. white-on-black and
      // black-on-white are both switchable. scale is a display setting.
      const image = byField('image');
      if (image) project.image = await moveInto(dir, image.path, `logo${extOf(image.originalname) || '.png'}`);
      const sc = Number(req.body.scale);
      project.scale = Number.isFinite(sc) ? Math.min(1, Math.max(0.2, sc)) : 0.7;
      const DEF = [{ color: '#111114', bg: '#FFFFFF' }, { color: '#FFFFFF', bg: '#111114' }, { color: 'original', bg: '#FFFFFF' }];
      project.renditions = parseJSON(req.body.renditions, DEF);
      project.rendition = parseJSON(req.body.rendition, project.renditions[0] || DEF[0]);
      project.thumb = project.image; // gallery preview uses the raw image
    }

    if (type === 'imagegallery') {
      // One image per project, shown name-less in a masonry ("Alle") view.
      const image = byField('image');
      if (image) project.image = await moveInto(dir, image.path, `image${extOf(image.originalname) || '.png'}`);
      project.thumb = project.image;
    }

    if (type === 'businesscard') {
      project.size = req.body.size === '89x51' ? '89x51' : '85x55';
      const front = byField('front');
      const back = byField('back');
      if (front) project.front = await moveInto(dir, front.path, `front${extOf(front.originalname) || '.webp'}`);
      if (back) project.back = await moveInto(dir, back.path, `back${extOf(back.originalname) || '.webp'}`);
      if (project.front) project.thumb = project.front;
    }

    // A custom cropped cover (any type) overrides the type default.
    const thumb = byField('thumb');
    if (thumb) {
      project.thumb = await moveInto(dir, thumb.path, 'thumb.webp');
      const meta = parseJSON(req.body.thumbMeta, null);
      if (meta) project.thumbMeta = meta;
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
const EDITABLE = ['title', 'year', 'category', 'notes', 'tags', 'colors', 'bg', 'scale', 'variant', 'renditions', 'original', 'rendition'];
app.patch('/api/projects/:id', async (req, res) => {
  try {
    const updated = await mutateDB((db) => {
      const project = db.projects.find((p) => p.id === req.params.id);
      if (!project) return null;
      for (const key of EDITABLE) {
        if (key in req.body) {
          if (key === 'colors' && Array.isArray(req.body.colors)) {
            project.colors = req.body.colors.map((c) => ({ id: c.id || nanoid(6), ...c }));
          } else if (key === 'scale') {
            const s = Number(req.body.scale);
            if (Number.isFinite(s)) project.scale = Math.min(1, Math.max(0.2, s));
          } else if (key === 'variant') {
            if (req.body.variant === 'light' || req.body.variant === 'dark') project.variant = req.body.variant;
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

// ---- Set / replace the cover thumbnail (cropped WebP) ---------------------
app.post('/api/projects/:id/thumb', upload.single('thumb'), async (req, res) => {
  try {
    const db = await readDB();
    const project = db.projects.find((p) => p.id === req.params.id);
    if (!project) { await cleanupTmp(req); return res.status(404).json({ error: 'not_found' }); }
    if (!req.file) return res.status(400).json({ error: 'thumb_required' });

    const dir = path.join(DATA_DIR, project.type, project.id);
    // Always store the custom cover under a stable name so it overwrites cleanly.
    await moveInto(dir, req.file.path, 'thumb.webp');
    const meta = parseJSON(req.body.thumbMeta, null);
    const updated = await mutateDB((d) => {
      const p = d.projects.find((x) => x.id === project.id);
      p.thumb = 'thumb.webp';
      if (meta) p.thumbMeta = meta; else delete p.thumbMeta;
      return p;
    });
    await cleanupTmp(req);
    res.json({ project: updated });
  } catch (err) {
    await cleanupTmp(req);
    res.status(500).json({ error: 'thumb_failed', message: String(err.message || err) });
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
      // Drop the project from any gallery it belonged to.
      for (const g of db.galleries) {
        if (g.projectIds) g.projectIds = g.projectIds.filter((pid) => pid !== req.params.id);
      }
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
// Galleries — named collections of projects, scoped to a type.
// ---------------------------------------------------------------------------
app.get('/api/galleries', async (req, res) => {
  const db = await readDB();
  let galleries = db.galleries;
  if (req.query.type && TYPES.has(req.query.type)) galleries = galleries.filter((g) => g.type === req.query.type);
  galleries = [...galleries].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  res.json({ galleries });
});

app.get('/api/galleries/:id', async (req, res) => {
  const db = await readDB();
  const gallery = db.galleries.find((g) => g.id === req.params.id);
  if (!gallery) return res.status(404).json({ error: 'not_found' });
  res.json({ gallery });
});

app.post('/api/galleries', async (req, res) => {
  const type = req.body.type;
  if (!TYPES.has(type)) return res.status(400).json({ error: 'invalid_type' });
  const gallery = {
    id: nanoid(10),
    type,
    name: (req.body.name || 'New Gallery').trim(),
    projectIds: Array.isArray(req.body.projectIds) ? req.body.projectIds : [],
    createdAt: Date.now(),
  };
  await mutateDB((db) => { db.galleries.push(gallery); });
  res.status(201).json({ gallery });
});

app.patch('/api/galleries/:id', async (req, res) => {
  const updated = await mutateDB((db) => {
    const g = db.galleries.find((x) => x.id === req.params.id);
    if (!g) return null;
    if (typeof req.body.name === 'string') g.name = req.body.name.trim() || g.name;
    if (Array.isArray(req.body.projectIds)) g.projectIds = req.body.projectIds;
    return g;
  });
  if (!updated) return res.status(404).json({ error: 'not_found' });
  res.json({ gallery: updated });
});

app.delete('/api/galleries/:id', async (req, res) => {
  const ok = await mutateDB((db) => {
    const idx = db.galleries.findIndex((g) => g.id === req.params.id);
    if (idx === -1) return false;
    db.galleries.splice(idx, 1);
    return true;
  });
  if (!ok) return res.status(404).json({ error: 'not_found' });
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Plans (Plan mode) — a plan has a moodboard, text info and a timeframe.
// ---------------------------------------------------------------------------
const PLAN_EDITABLE = ['name', 'info', 'start', 'end'];

app.get('/api/plans', async (_req, res) => {
  const db = await readDB();
  const plans = [...db.plans].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  res.json({ plans });
});

app.get('/api/plans/:id', async (req, res) => {
  const db = await readDB();
  const plan = db.plans.find((p) => p.id === req.params.id);
  if (!plan) return res.status(404).json({ error: 'not_found' });
  res.json({ plan });
});

app.post('/api/plans', async (req, res) => {
  const plan = {
    id: nanoid(10),
    name: (req.body.name || 'Untitled plan').trim(),
    info: '',
    start: '',
    end: '',
    moodboard: [],
    createdAt: Date.now(),
  };
  await mutateDB((db) => { db.plans.push(plan); });
  res.status(201).json({ plan });
});

app.patch('/api/plans/:id', async (req, res) => {
  const updated = await mutateDB((db) => {
    const plan = db.plans.find((p) => p.id === req.params.id);
    if (!plan) return null;
    for (const k of PLAN_EDITABLE) if (k in req.body) plan[k] = req.body[k];
    return plan;
  });
  if (!updated) return res.status(404).json({ error: 'not_found' });
  res.json({ plan: updated });
});

app.post('/api/plans/:id/moodboard', upload.array('images', 50), async (req, res) => {
  try {
    const db = await readDB();
    const plan = db.plans.find((p) => p.id === req.params.id);
    if (!plan) { await cleanupTmp(req); return res.status(404).json({ error: 'not_found' }); }
    const dir = path.join(DATA_DIR, 'plan', plan.id, 'moodboard');
    const added = [];
    for (const f of (req.files || [])) {
      const imgId = nanoid(8);
      const stored = await moveInto(dir, f.path, `${imgId}${extOf(f.originalname) || '.png'}`);
      added.push({ id: imgId, file: `moodboard/${stored}` });
    }
    const updated = await mutateDB((d) => {
      const p = d.plans.find((x) => x.id === plan.id);
      p.moodboard = [...(p.moodboard || []), ...added];
      return p;
    });
    await cleanupTmp(req);
    res.status(201).json({ plan: updated });
  } catch (err) {
    await cleanupTmp(req);
    res.status(500).json({ error: 'moodboard_failed', message: String(err.message || err) });
  }
});

app.delete('/api/plans/:id/moodboard/:imgId', async (req, res) => {
  let removedFile = null;
  const updated = await mutateDB((db) => {
    const plan = db.plans.find((p) => p.id === req.params.id);
    if (!plan || !plan.moodboard) return null;
    const idx = plan.moodboard.findIndex((m) => m.id === req.params.imgId);
    if (idx === -1) return null;
    removedFile = plan.moodboard[idx].file;
    plan.moodboard.splice(idx, 1);
    return plan;
  });
  if (!updated) return res.status(404).json({ error: 'not_found' });
  if (removedFile) await fsp.rm(path.join(DATA_DIR, 'plan', req.params.id, removedFile), { force: true }).catch(() => {});
  res.json({ plan: updated });
});

app.delete('/api/plans/:id', async (req, res) => {
  const ok = await mutateDB((db) => {
    const idx = db.plans.findIndex((p) => p.id === req.params.id);
    if (idx === -1) return false;
    db.plans.splice(idx, 1);
    return true;
  });
  if (!ok) return res.status(404).json({ error: 'not_found' });
  await fsp.rm(path.join(DATA_DIR, 'plan', req.params.id), { recursive: true, force: true }).catch(() => {});
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Storage usage + editable limit.
// ---------------------------------------------------------------------------
app.get('/api/storage', async (_req, res) => {
  const db = await readDB();
  const usedBytes = await folderSize(DATA_DIR);
  res.json({ usedBytes, limitBytes: db.settings.storageLimitBytes });
});

app.patch('/api/storage', async (req, res) => {
  const limitBytes = Number(req.body.limitBytes);
  if (!Number.isFinite(limitBytes) || limitBytes <= 0) return res.status(400).json({ error: 'invalid_limit' });
  const settings = await mutateDB((db) => { db.settings.storageLimitBytes = Math.round(limitBytes); return db.settings; });
  res.json({ limitBytes: settings.storageLimitBytes });
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
