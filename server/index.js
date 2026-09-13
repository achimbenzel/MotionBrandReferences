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
import { createZipToStream, validateLibraryZip, extractZip } from './zip.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const TMP_DIR = path.join(DATA_DIR, 'tmp');
const DB_PATH = path.join(DATA_DIR, 'db.json');
const DB_BAK = path.join(DATA_DIR, 'db.json.bak');   // mirror of the last good db.json
const BACKUP_DIR = path.join(DATA_DIR, 'backups');   // rotating db snapshots
const TRASH_DIR = path.join(DATA_DIR, 'trash');      // soft-deleted items
const DIST_DIR = path.join(ROOT, 'dist');
const PORT = process.env.API_PORT || 4300;
const IS_PROD = process.env.NODE_ENV === 'production';

const MAX_SNAPSHOTS = 10;                             // how many db snapshots to keep
const SNAPSHOT_INTERVAL_MS = 3 * 60 * 1000;          // at most one snapshot per 3 min
const TRASH_TTL_DAYS = 30;                           // auto-purge trashed items after this

const TYPES = new Set(['motion', 'color', 'branding', 'logo', 'businesscard', 'imagegallery', 'font', 'logonogo']);
const TYPE_LABEL = {
  motion: 'Motion Design', color: 'Colors', branding: 'Branding', logo: 'Logos',
  businesscard: 'Business Cards', imagegallery: 'Image Gallery', font: 'Fonts', logonogo: 'Logo No Go',
};
const DEFAULT_STORAGE_LIMIT = 80 * 1024 * 1024 * 1024; // 80 GB

// ---------------------------------------------------------------------------
// Storage helpers
// ---------------------------------------------------------------------------
function ensureDirs() {
  const typeDirs = [...TYPES].map((t) => path.join(DATA_DIR, t));
  for (const d of [DATA_DIR, TMP_DIR, BACKUP_DIR, TRASH_DIR, path.join(DATA_DIR, 'plan'), ...typeDirs]) {
    fs.mkdirSync(d, { recursive: true });
  }
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify({ projects: [], galleries: [], plans: [], settings: { storageLimitBytes: DEFAULT_STORAGE_LIMIT } }, null, 2));
  }
  // Sweep leftover atomic-write temp files from a previous crash.
  for (const f of fs.readdirSync(DATA_DIR).filter((n) => /^\.db-.*\.tmp$/.test(n))) {
    fs.rmSync(path.join(DATA_DIR, f), { force: true });
  }
  // Sweep leftover upload temp dirs (aborted uploads) from a previous crash —
  // nothing is in flight at startup, so data/tmp/ can be safely emptied.
  for (const f of fs.readdirSync(TMP_DIR)) {
    fs.rmSync(path.join(TMP_DIR, f), { recursive: true, force: true });
  }
}

// Serialize db writes so concurrent requests can't clobber each other.
let writeChain = Promise.resolve();

// Read + parse one db file (throws if missing or corrupt).
async function parseDBFile(p) {
  return JSON.parse(await fsp.readFile(p, 'utf8'));
}

// Load the database, tolerating a missing or corrupt db.json by falling back
// to the .bak mirror and then the newest snapshot. When a fallback is used the
// good copy is written back to db.json so the app self-heals.
async function loadDB() {
  const candidates = [DB_PATH, DB_BAK];
  try {
    const snaps = (await fsp.readdir(BACKUP_DIR).catch(() => []))
      .filter((f) => /^db-.*\.json$/.test(f)).sort();
    if (snaps.length) candidates.push(path.join(BACKUP_DIR, snaps[snaps.length - 1]));
  } catch { /* no snapshots */ }

  for (const p of candidates) {
    try {
      const db = await parseDBFile(p);
      if (p !== DB_PATH) {
        console.warn(`  db.json unreadable — recovered from ${path.basename(p)}`);
        await writeDBAtomic(db).catch(() => {});
      }
      return db;
    } catch { /* try the next candidate */ }
  }
  return null; // nothing readable — caller starts from a fresh, empty DB
}

async function readDB() {
  const db = (await loadDB()) || { projects: [], galleries: [], plans: [], settings: {} };
  // Normalize older databases so new fields always exist.
  if (!Array.isArray(db.projects)) db.projects = [];
  if (!Array.isArray(db.galleries)) db.galleries = [];
  if (!Array.isArray(db.plans)) db.plans = [];
  if (!Array.isArray(db.software)) db.software = [];
  if (!Array.isArray(db.trash)) db.trash = [];
  for (const plan of db.plans) normalizePlan(plan);
  for (const s of db.software) normalizeSoftware(s);
  if (!db.settings || typeof db.settings !== 'object') db.settings = {};
  if (db.settings.storageLimitBytes == null) db.settings.storageLimitBytes = DEFAULT_STORAGE_LIMIT;
  if (!('dashboardBanner' in db.settings)) db.settings.dashboardBanner = null;
  if (!('dashboardBannerGradient' in db.settings)) db.settings.dashboardBannerGradient = null;
  return db;
}

// Write db.json atomically: write a temp file, fsync it, then rename over the
// target (atomic on the same filesystem) so a crash/power-loss mid-write can
// never leave a truncated db.json. Mirror the last good version to .bak and
// keep rotating snapshots so you can go back.
let lastSnapshotAt = 0;
async function writeDBAtomic(db) {
  const json = JSON.stringify(db, null, 2);
  const tmp = path.join(DATA_DIR, `.db-${nanoid(8)}.tmp`);
  const fh = await fsp.open(tmp, 'w');
  try { await fh.writeFile(json); await fh.sync(); } finally { await fh.close(); }
  await fsp.rename(tmp, DB_PATH);                    // atomic replace
  await fsp.writeFile(DB_BAK, json).catch(() => {}); // mirror the last good version
  await snapshotDB(json).catch(() => {});
  invalidateStorage();
}

// Keep the newest MAX_SNAPSHOTS db versions under data/backups/, throttled so a
// burst of autosaves doesn't churn the disk while snapshots still span time.
async function snapshotDB(json) {
  const now = Date.now();
  if (now - lastSnapshotAt < SNAPSHOT_INTERVAL_MS) return;
  lastSnapshotAt = now;
  await fsp.mkdir(BACKUP_DIR, { recursive: true });
  const stamp = new Date(now).toISOString().replace(/[:.]/g, '-');
  await fsp.writeFile(path.join(BACKUP_DIR, `db-${stamp}.json`), json);
  const files = (await fsp.readdir(BACKUP_DIR).catch(() => []))
    .filter((f) => /^db-.*\.json$/.test(f)).sort();
  for (const f of files.slice(0, Math.max(0, files.length - MAX_SNAPSHOTS))) {
    await safeRm(path.join(BACKUP_DIR, f), { force: true }).catch(() => {});
  }
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

// Storage usage cache: folderSize walks the whole tree, so cache the result
// with a short TTL and invalidate it whenever files change (see moveInto,
// safeRm and writeDBAtomic). The TTL is just a backstop for out-of-band edits.
const STORAGE_TTL_MS = 60 * 1000;
let storageCache = { bytes: null, at: 0 };
function invalidateStorage() { storageCache = { bytes: null, at: 0 }; }
async function getUsedBytes() {
  const now = Date.now();
  if (storageCache.bytes != null && now - storageCache.at < STORAGE_TTL_MS) return storageCache.bytes;
  const bytes = await folderSize(DATA_DIR);
  storageCache = { bytes, at: now };
  return bytes;
}

// Path containment: refuse to rm/rename anything that resolves outside data/,
// as a defensive backstop against traversal via request-derived path segments.
function assertInside(target) {
  const resolved = path.resolve(target);
  const base = path.resolve(DATA_DIR);
  if (resolved !== base && !resolved.startsWith(base + path.sep)) {
    throw new Error(`refusing to touch a path outside data/: ${target}`);
  }
  return resolved;
}
function safeRm(target, opts) {
  assertInside(target);
  invalidateStorage();
  return fsp.rm(target, opts);
}

// --- Trash (soft delete): move a folder aside instead of removing it. ---
async function moveToTrash(from, to) {
  assertInside(from); assertInside(to);
  if (!fs.existsSync(from)) return; // nothing on disk (e.g. a gallery, or a fileless item)
  await fsp.mkdir(TRASH_DIR, { recursive: true });
  await fsp.rename(from, to).catch(async (err) => {
    if (err.code === 'EXDEV') { await fsp.cp(from, to, { recursive: true }); await fsp.rm(from, { recursive: true, force: true }); }
    else if (err.code !== 'ENOENT') throw err;
  });
  invalidateStorage();
}
async function restoreFromTrash(from, to) {
  assertInside(from); assertInside(to);
  if (!fs.existsSync(from)) return;
  await fsp.mkdir(path.dirname(to), { recursive: true });
  await safeRm(to, { recursive: true, force: true }).catch(() => {});
  await fsp.rename(from, to).catch(async (err) => {
    if (err.code === 'EXDEV') { await fsp.cp(from, to, { recursive: true }); await fsp.rm(from, { recursive: true, force: true }); }
    else throw err;
  });
  invalidateStorage();
}
// Move specific plan files (relative paths under data/plan/<planId>/) into a
// trash folder, preserving their relative layout so restore is a plain move back.
async function moveFilesToTrash(trashId, planId, rels) {
  for (const rel of rels) {
    if (!rel) continue;
    const from = path.join(DATA_DIR, 'plan', planId, rel);
    const to = path.join(TRASH_DIR, trashId, rel);
    assertInside(from); assertInside(to);
    if (!fs.existsSync(from)) continue;
    await fsp.mkdir(path.dirname(to), { recursive: true });
    await fsp.rename(from, to).catch(async (err) => {
      if (err.code === 'EXDEV') { await fsp.cp(from, to, { recursive: true }); await fsp.rm(from, { recursive: true, force: true }); }
      else if (err.code !== 'ENOENT') throw err;
    });
  }
  invalidateStorage();
}
async function restoreFilesFromTrash(trashId, planId, rels) {
  for (const rel of rels) {
    if (!rel) continue;
    const from = path.join(TRASH_DIR, trashId, rel);
    const to = path.join(DATA_DIR, 'plan', planId, rel);
    assertInside(from); assertInside(to);
    if (!fs.existsSync(from)) continue;
    await fsp.mkdir(path.dirname(to), { recursive: true });
    await fsp.rename(from, to).catch(async (err) => {
      if (err.code === 'EXDEV') { await fsp.cp(from, to, { recursive: true }); await fsp.rm(from, { recursive: true, force: true }); }
      else throw err;
    });
  }
  invalidateStorage();
}
async function purgeExpiredTrash() {
  const db = await readDB();
  const cutoff = Date.now() - TRASH_TTL_DAYS * 86400000;
  const expired = (db.trash || []).filter((t) => (t.deletedAt || 0) < cutoff);
  if (!expired.length) return;
  await mutateDB((d) => { d.trash = (d.trash || []).filter((t) => (t.deletedAt || 0) >= cutoff); });
  for (const t of expired) await safeRm(path.join(TRASH_DIR, t.trashId), { recursive: true, force: true }).catch(() => {});
}
const trashThumb = (t) => {
  const rel = t.kind === 'project' ? t.data.thumb
    : t.kind === 'plan' ? (t.data.avatar || t.data.banner)
      : t.kind === 'software' ? (t.data.avatar || t.data.banner)
        : t.kind === 'file' ? (t.data.item?.example) : null;
  return rel ? `/data/trash/${t.trashId}/${rel}` : null;
};
function mutateDB(mutator) {
  const run = async () => {
    const db = await readDB();
    const result = await mutator(db);
    await writeDBAtomic(db);
    return result;
  };
  // Run after the previous write settles — whether it resolved OR rejected — so
  // a single failed write can't poison the chain for every write after it.
  const result = writeChain.then(run, run);
  writeChain = result.catch(() => {}); // keep the internal chain always-resolved
  return result;                       // callers still see this write's real outcome
}

const sanitize = (name) => String(name || '').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
const extOf = (name) => {
  const e = path.extname(String(name || '')).toLowerCase();
  return e && e.length <= 6 ? e : '';
};

const BLOCK_TYPES = new Set(['moodboard', 'text', 'todos', 'files', 'pdf', 'links', 'refs', 'palette', 'heading', 'divider', 'table']);
const BLOCK_TITLES = {
  moodboard: 'Moodboard', text: 'Text', todos: 'To-dos', files: 'Files', pdf: 'PDF', links: 'Links',
  refs: 'References', palette: 'Palette', heading: 'Heading', divider: 'Divider', table: 'Table',
};

function normalizeBlock(b) {
  if (!b || typeof b !== 'object') return null;
  if (!BLOCK_TYPES.has(b.type)) return null;
  if (!b.id) b.id = nanoid(8);
  if (typeof b.title !== 'string') b.title = BLOCK_TITLES[b.type];
  if (b.type === 'moodboard') {
    if (typeof b.collapsed !== 'boolean') b.collapsed = false;
    if (!Array.isArray(b.images)) b.images = [];
  } else if (b.type === 'text') {
    if (typeof b.content !== 'string') b.content = '';
  } else if (b.type === 'todos') {
    if (!Array.isArray(b.items)) b.items = [];
  } else if (b.type === 'files' || b.type === 'pdf') {
    if (!Array.isArray(b.files)) b.files = [];
    delete b.cover; // legacy block-level cover — files now carry per-item example images
  } else if (b.type === 'links' || b.type === 'refs' || b.type === 'palette') {
    if (!Array.isArray(b.items)) b.items = [];
  } else if (b.type === 'heading') {
    if (typeof b.content !== 'string') b.content = '';
  } else if (b.type === 'table') {
    if (!Array.isArray(b.columns)) b.columns = [];
    if (!Array.isArray(b.rows)) b.rows = [];
  }
  return b;
}

// Bring a plan up to the current shape. Sections are now a `blocks` array;
// older plans (moodboards / info / todos fields) are migrated into blocks.
function normalizePlan(plan) {
  if (!plan) return plan;
  if (!Array.isArray(plan.blocks)) {
    const blocks = [];
    for (const mb of (Array.isArray(plan.moodboards) ? plan.moodboards : [])) {
      blocks.push({ id: mb.id || nanoid(8), type: 'moodboard', title: mb.name || 'Moodboard', collapsed: !!mb.collapsed, images: Array.isArray(mb.images) ? mb.images : [] });
    }
    if (typeof plan.info === 'string' && plan.info.trim()) blocks.push({ id: nanoid(8), type: 'text', title: 'Information', content: plan.info });
    if (Array.isArray(plan.todos) && plan.todos.length) blocks.push({ id: nanoid(8), type: 'todos', title: 'To-dos', items: plan.todos });
    plan.blocks = blocks;
  }
  plan.blocks = plan.blocks.map(normalizeBlock).filter(Boolean);
  delete plan.moodboard; delete plan.moodboards; delete plan.info; delete plan.todos;
  if (!Array.isArray(plan.milestones)) plan.milestones = [];
  if (!('banner' in plan)) plan.banner = null;
  if (!('bannerGradient' in plan)) plan.bannerGradient = null;
  if (!('avatar' in plan)) plan.avatar = null;
  if (!('avatarEmoji' in plan)) plan.avatarEmoji = null;
  return plan;
}

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
const uploadArchive = multer({ storage }); // library import: no per-file size cap

async function moveInto(dir, tmpPath, finalName) {
  await fsp.mkdir(dir, { recursive: true });
  const dest = path.join(dir, finalName);
  assertInside(dest);
  await fsp.rename(tmpPath, dest).catch(async (err) => {
    // rename across devices can fail — fall back to copy.
    if (err.code === 'EXDEV') {
      await fsp.copyFile(tmpPath, dest);
      await fsp.unlink(tmpPath);
    } else throw err;
  });
  invalidateStorage();
  return finalName;
}
async function cleanupTmp(req) {
  if (req.tmpDir) await safeRm(req.tmpDir, { recursive: true, force: true }).catch(() => {});
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------
ensureDirs();
const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

// Serve the content library. express.static supports HTTP range requests,
// which the video player needs for seeking. Caching is split by path: plan
// block files (moodboard/files/pdf) carry unique nanoid names and never change
// under a URL, so they get a long immutable cache; fixed-name, overwriteable
// files (banner/avatar/thumb, reused plugin images) plus everything else get a
// short cache — enough to skip per-navigation revalidation round-trips over a
// VPN, but short enough that a re-upload shows up quickly.
app.use('/data', express.static(DATA_DIR, {
  setHeaders: (res, filePath) => {
    if (/[\\/]blocks[\\/]/.test(filePath)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    else res.setHeader('Cache-Control', 'public, max-age=300');
  },
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

    if (type === 'logonogo') {
      // A "Logo No-Go": an image of a logo/symbol with a bad reputation, plus a
      // note (added later) on why to avoid resembling it. The image is the cover.
      const image = byField('image');
      if (image) project.image = await moveInto(dir, image.path, `image${extOf(image.originalname) || '.png'}`);
      project.thumb = project.image;
    }

    if (type === 'font') {
      // A font entry is a link to a website for free fonts, plus an optional
      // screenshot used as the cover (the full shot is kept, like a color's
      // example; a cropped thumb below overrides it on the card).
      project.url = (req.body.url || '').trim();
      const shot = byField('shot');
      if (shot) project.shot = await moveInto(dir, shot.path, `shot${extOf(shot.originalname) || '.png'}`);
      if (!project.thumb && project.shot) project.thumb = project.shot;
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
const EDITABLE = ['title', 'year', 'category', 'notes', 'tags', 'colors', 'bg', 'scale', 'variant', 'renditions', 'original', 'rendition', 'url'];
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
      await safeRm(path.join(DATA_DIR, 'motion', req.params.id, removedFile), { force: true }).catch(() => {});
    }
    res.json({ project: updated });
  } catch (err) {
    res.status(500).json({ error: 'delete_frame_failed', message: String(err.message || err) });
  }
});

// ---- Delete a whole project (soft delete → Trash) -------------------------
app.delete('/api/projects/:id', async (req, res) => {
  try {
    const trashId = nanoid(10);
    let move = null;
    const ok = await mutateDB((db) => {
      const idx = db.projects.findIndex((p) => p.id === req.params.id);
      if (idx === -1) return false;
      const project = db.projects[idx];
      // Remember gallery membership so restore can put it back.
      const galleryIds = db.galleries.filter((g) => (g.projectIds || []).includes(project.id)).map((g) => g.id);
      for (const g of db.galleries) if (g.projectIds) g.projectIds = g.projectIds.filter((pid) => pid !== project.id);
      db.projects.splice(idx, 1);
      db.trash.unshift({ trashId, kind: 'project', deletedAt: Date.now(), galleryIds, data: project });
      move = { from: path.join(DATA_DIR, project.type, project.id), to: path.join(TRASH_DIR, trashId) };
      return true;
    });
    if (!ok) return res.status(404).json({ error: 'not_found' });
    if (move) await moveToTrash(move.from, move.to);
    res.json({ ok: true, trashId });
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
  const trashId = nanoid(10);
  const ok = await mutateDB((db) => {
    const idx = db.galleries.findIndex((g) => g.id === req.params.id);
    if (idx === -1) return false;
    const gallery = db.galleries[idx];
    db.galleries.splice(idx, 1);
    db.trash.unshift({ trashId, kind: 'gallery', deletedAt: Date.now(), data: gallery });
    return true;
  });
  if (!ok) return res.status(404).json({ error: 'not_found' });
  res.json({ ok: true, trashId });
});

// ---------------------------------------------------------------------------
// Plans (Work mode) — a header + timeframe, plus a list of content blocks.
// ---------------------------------------------------------------------------
const PLAN_EDITABLE = ['name', 'start', 'end', 'milestones', 'bannerGradient', 'avatarEmoji'];

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
    start: '',
    end: '',
    banner: null,
    bannerGradient: null,
    avatar: null,
    avatarEmoji: null,
    milestones: [],
    blocks: [], // a new project is empty — blocks are added by the user
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

// Banner / avatar (Notion-style header images)
for (const kind of ['banner', 'avatar']) {
  app.post(`/api/plans/:id/${kind}`, upload.single(kind), async (req, res) => {
    try {
      const db = await readDB();
      const plan = db.plans.find((p) => p.id === req.params.id);
      if (!plan) { await cleanupTmp(req); return res.status(404).json({ error: 'not_found' }); }
      if (!req.file) return res.status(400).json({ error: 'file_required' });
      const dir = path.join(DATA_DIR, 'plan', plan.id);
      const stored = await moveInto(dir, req.file.path, `${kind}${extOf(req.file.originalname) || '.png'}`);
      const updated = await mutateDB((d) => { const p = d.plans.find((x) => x.id === plan.id); p[kind] = stored; if (kind === 'banner') p.bannerGradient = null; if (kind === 'avatar') p.avatarEmoji = null; return p; });
      await cleanupTmp(req);
      res.json({ plan: updated });
    } catch (err) { await cleanupTmp(req); res.status(500).json({ error: `${kind}_failed`, message: String(err.message || err) }); }
  });
  app.delete(`/api/plans/:id/${kind}`, async (req, res) => {
    let file = null;
    const updated = await mutateDB((db) => { const p = db.plans.find((x) => x.id === req.params.id); if (!p) return null; file = p[kind]; p[kind] = null; if (kind === 'banner') p.bannerGradient = null; if (kind === 'avatar') p.avatarEmoji = null; return p; });
    if (!updated) return res.status(404).json({ error: 'not_found' });
    if (file) await safeRm(path.join(DATA_DIR, 'plan', req.params.id, file), { force: true }).catch(() => {});
    res.json({ plan: updated });
  });
}

// --- Content blocks (moodboard / text / todos / files) ---
const findBlock = (plan, blockId) => (plan && Array.isArray(plan.blocks)) ? plan.blocks.find((b) => b.id === blockId) : null;
const blockDir = (planId, blockId) => path.join(DATA_DIR, 'plan', planId, 'blocks', blockId);

app.post('/api/plans/:id/blocks', async (req, res) => {
  const type = req.body.type;
  if (!BLOCK_TYPES.has(type)) return res.status(400).json({ error: 'invalid_block_type' });
  const base = { id: nanoid(8), type, title: BLOCK_TITLES[type] };
  const block = type === 'moodboard' ? { ...base, collapsed: false, images: [] }
    : type === 'text' ? { ...base, content: '' }
      : type === 'todos' ? { ...base, items: [] }
        : type === 'links' ? { ...base, items: [] }
          : type === 'refs' ? { ...base, items: [] }
            : type === 'palette' ? { ...base, items: [] }
              : type === 'heading' ? { ...base, title: '', content: '' }
                : type === 'divider' ? { ...base }
                  : type === 'table' ? { ...base, columns: [{ id: nanoid(6), name: '' }, { id: nanoid(6), name: '' }], rows: [] }
                    : { ...base, files: [] }; // files + pdf
  const updated = await mutateDB((db) => { const p = db.plans.find((x) => x.id === req.params.id); if (!p) return null; p.blocks.push(block); return p; });
  if (!updated) return res.status(404).json({ error: 'not_found' });
  res.status(201).json({ plan: updated, block });
});

// Update only the content/label fields — never the file arrays.
const BLOCK_EDITABLE = ['title', 'collapsed', 'content', 'items', 'columns', 'rows'];
app.patch('/api/plans/:id/blocks/:blockId', async (req, res) => {
  const updated = await mutateDB((db) => {
    const p = db.plans.find((x) => x.id === req.params.id); if (!p) return null;
    const b = findBlock(p, req.params.blockId); if (!b) return null;
    for (const k of BLOCK_EDITABLE) if (k in req.body) b[k] = req.body[k];
    return p;
  });
  if (!updated) return res.status(404).json({ error: 'not_found' });
  res.json({ plan: updated });
});

app.post('/api/plans/:id/blocks/:blockId/move', async (req, res) => {
  const dir = req.body.dir === 'up' ? -1 : 1;
  const updated = await mutateDB((db) => {
    const p = db.plans.find((x) => x.id === req.params.id); if (!p) return null;
    const i = p.blocks.findIndex((b) => b.id === req.params.blockId); if (i === -1) return null;
    const j = i + dir; if (j < 0 || j >= p.blocks.length) return p;
    [p.blocks[i], p.blocks[j]] = [p.blocks[j], p.blocks[i]];
    return p;
  });
  if (!updated) return res.status(404).json({ error: 'not_found' });
  res.json({ plan: updated });
});

app.delete('/api/plans/:id/blocks/:blockId', async (req, res) => {
  const updated = await mutateDB((db) => {
    const p = db.plans.find((x) => x.id === req.params.id); if (!p) return null;
    const i = p.blocks.findIndex((b) => b.id === req.params.blockId); if (i === -1) return null;
    p.blocks.splice(i, 1);
    return p;
  });
  if (!updated) return res.status(404).json({ error: 'not_found' });
  await safeRm(blockDir(req.params.id, req.params.blockId), { recursive: true, force: true }).catch(() => {});
  await safeRm(path.join(DATA_DIR, 'plan', req.params.id, 'moodboard', req.params.blockId), { recursive: true, force: true }).catch(() => {});
  res.json({ plan: updated });
});

// Add files to a moodboard (images) or a files block.
app.post('/api/plans/:id/blocks/:blockId/files', upload.array('files', 50), async (req, res) => {
  try {
    const db = await readDB();
    const plan = db.plans.find((p) => p.id === req.params.id);
    const b0 = findBlock(plan, req.params.blockId);
    if (!plan || !b0 || (b0.type !== 'moodboard' && b0.type !== 'files' && b0.type !== 'pdf')) { await cleanupTmp(req); return res.status(404).json({ error: 'not_found' }); }
    const dir = blockDir(plan.id, b0.id);
    const added = [];
    for (const f of (req.files || [])) {
      const fid = nanoid(8);
      const stored = await moveInto(dir, f.path, `${fid}${extOf(f.originalname) || ''}`);
      added.push({ id: fid, file: `blocks/${b0.id}/${stored}`, name: f.originalname, size: f.size });
    }
    const updated = await mutateDB((d) => {
      const b = findBlock(d.plans.find((x) => x.id === plan.id), b0.id);
      if (b.type === 'moodboard') b.images = [...(b.images || []), ...added.map((a) => ({ id: a.id, file: a.file }))];
      else b.files = [...(b.files || []), ...added];
      return d.plans.find((x) => x.id === plan.id);
    });
    await cleanupTmp(req);
    res.status(201).json({ plan: updated });
  } catch (err) { await cleanupTmp(req); res.status(500).json({ error: 'files_failed', message: String(err.message || err) }); }
});

// Add one file to a files block: the file itself, an optional example image
// (shown as a square preview before it) and an optional title.
app.post('/api/plans/:id/blocks/:blockId/file', upload.fields([{ name: 'file', maxCount: 1 }, { name: 'example', maxCount: 1 }]), async (req, res) => {
  try {
    const db = await readDB();
    const plan = db.plans.find((p) => p.id === req.params.id);
    const b0 = findBlock(plan, req.params.blockId);
    const file = req.files?.file?.[0];
    const example = req.files?.example?.[0];
    if (!plan || !b0 || b0.type !== 'files') { await cleanupTmp(req); return res.status(404).json({ error: 'not_found' }); }
    if (!file) { await cleanupTmp(req); return res.status(400).json({ error: 'file_required' }); }
    const dir = blockDir(plan.id, b0.id);
    const fid = nanoid(8);
    const storedFile = await moveInto(dir, file.path, `${fid}${extOf(file.originalname) || ''}`);
    let exampleRel = null;
    if (example) {
      const storedEx = await moveInto(dir, example.path, `${fid}_ex${extOf(example.originalname) || '.png'}`);
      exampleRel = `blocks/${b0.id}/${storedEx}`;
    }
    const item = { id: fid, file: `blocks/${b0.id}/${storedFile}`, name: file.originalname, size: file.size, title: String(req.body.title || '').trim(), example: exampleRel };
    const updated = await mutateDB((d) => { const b = findBlock(d.plans.find((x) => x.id === plan.id), b0.id); b.files = [...(b.files || []), item]; return d.plans.find((x) => x.id === plan.id); });
    await cleanupTmp(req);
    res.status(201).json({ plan: updated });
  } catch (err) { await cleanupTmp(req); res.status(500).json({ error: 'file_failed', message: String(err.message || err) }); }
});

app.delete('/api/plans/:id/blocks/:blockId/files/:fileId', async (req, res) => {
  const planId = req.params.id;
  let removed = null; let blockType = null;
  const updated = await mutateDB((db) => {
    const p = db.plans.find((x) => x.id === planId); if (!p) return null;
    const b = findBlock(p, req.params.blockId); if (!b) return null;
    const arr = b.type === 'moodboard' ? b.images : b.files; if (!Array.isArray(arr)) return null;
    const idx = arr.findIndex((f) => f.id === req.params.fileId); if (idx === -1) return null;
    removed = arr[idx]; blockType = b.type;
    arr.splice(idx, 1);
    return p;
  });
  if (!updated) return res.status(404).json({ error: 'not_found' });
  if (removed && (blockType === 'files' || blockType === 'pdf')) {
    // Soft delete → Trash (file + its example image), restorable later.
    const trashId = nanoid(10);
    const rels = [removed.file, removed.example].filter(Boolean);
    await moveFilesToTrash(trashId, planId, rels);
    await mutateDB((db) => { db.trash.unshift({ trashId, kind: 'file', deletedAt: Date.now(), data: { planId, blockId: req.params.blockId, item: removed, rels } }); });
    return res.json({ plan: updated, trashId });
  }
  if (removed?.file) await safeRm(path.join(DATA_DIR, 'plan', planId, removed.file), { force: true }).catch(() => {});
  res.json({ plan: updated });
});

app.delete('/api/plans/:id', async (req, res) => {
  const trashId = nanoid(10);
  let move = null;
  const ok = await mutateDB((db) => {
    const idx = db.plans.findIndex((p) => p.id === req.params.id);
    if (idx === -1) return false;
    const plan = db.plans[idx];
    db.plans.splice(idx, 1);
    db.trash.unshift({ trashId, kind: 'plan', deletedAt: Date.now(), data: plan });
    move = { from: path.join(DATA_DIR, 'plan', plan.id), to: path.join(TRASH_DIR, trashId) };
    return true;
  });
  if (!ok) return res.status(404).json({ error: 'not_found' });
  if (move) await moveToTrash(move.from, move.to);
  res.json({ ok: true, trashId });
});

// ---------------------------------------------------------------------------
// Global search across projects, plans and galleries.
// ---------------------------------------------------------------------------
function scoreMatch(terms, title, hay) {
  const t = title.toLowerCase();
  let score = 0;
  for (const term of terms) {
    if (!hay.includes(term)) return 0; // every term must appear somewhere (AND)
    score += t.includes(term) ? 10 : 1;
    if (t.startsWith(term)) score += 5;
  }
  return score;
}
app.get('/api/search', async (req, res) => {
  const q = String(req.query.q || '').trim().toLowerCase();
  if (!q) return res.json({ results: [] });
  const terms = q.split(/\s+/).filter(Boolean);
  const db = await readDB();
  const results = [];

  for (const p of db.projects) {
    const hay = [p.title, p.year, p.category, ...(p.tags || []), p.notes, p.url,
      ...(p.colors || []).flatMap((c) => [c.hex, c.name])].filter(Boolean).join(' ').toLowerCase();
    const score = scoreMatch(terms, p.title || '', hay);
    if (score > 0) results.push({
      kind: 'project', id: p.id, type: p.type, title: p.title || 'Untitled',
      subtitle: p.category || TYPE_LABEL[p.type] || p.type,
      thumb: p.thumb ? `/data/${p.type}/${p.id}/${p.thumb}` : null, score,
    });
  }
  for (const pl of db.plans) {
    const blockText = (pl.blocks || []).flatMap((b) => [
      b.title, b.content,
      ...(b.items || []).flatMap((t) => [t.text, t.title, t.url, t.name, t.hex]),
      ...(b.files || []).map((f) => f.name),
      ...(b.columns || []).map((c) => c.name),
      ...(b.rows || []).flatMap((r) => Object.values(r.cells || {})),
    ]);
    const hay = [pl.name, ...(pl.milestones || []).map((m) => m.title), ...blockText]
      .filter(Boolean).join(' ').toLowerCase();
    const score = scoreMatch(terms, pl.name || '', hay);
    if (score > 0) results.push({
      kind: 'plan', id: pl.id, title: pl.name || 'Untitled plan', subtitle: 'Plan',
      thumb: pl.avatar ? `/data/plan/${pl.id}/${pl.avatar}` : null, score,
    });
  }
  for (const g of db.galleries) {
    const hay = [g.name, TYPE_LABEL[g.type], g.type].filter(Boolean).join(' ').toLowerCase();
    const score = scoreMatch(terms, g.name || '', hay);
    if (score > 0) results.push({
      kind: 'gallery', id: g.id, type: g.type, title: g.name || 'Gallery',
      subtitle: `Gallery · ${TYPE_LABEL[g.type] || g.type}`, score,
    });
  }
  for (const s of (db.software || [])) {
    const hay = [s.name,
      ...(s.plugins || []).flatMap((p) => [p.name, p.category, p.version]),
      ...(s.expressionGroups || []).flatMap((g) => [g.name, ...(g.items || []).flatMap((e) => [e.title, ...(e.tags || [])])]),
      ...(s.tutorials || []).flatMap((t) => [t.title, t.channel])].filter(Boolean).join(' ').toLowerCase();
    const score = scoreMatch(terms, s.name || '', hay);
    if (score > 0) results.push({ kind: 'software', id: s.id, title: s.name || 'Software', subtitle: 'Software', score });
  }
  results.sort((a, b) => b.score - a.score || (a.title || '').localeCompare(b.title || ''));
  res.json({ results: results.slice(0, 40) });
});

// ---------------------------------------------------------------------------
// Trash (soft delete) — list, restore, permanently delete, empty.
// ---------------------------------------------------------------------------
app.get('/api/trash', async (_req, res) => {
  await purgeExpiredTrash().catch(() => {});
  const db = await readDB();
  const items = (db.trash || []).map((t) => ({
    trashId: t.trashId, kind: t.kind, deletedAt: t.deletedAt,
    title: t.kind === 'plan' ? (t.data.name || 'Untitled plan')
      : t.kind === 'gallery' ? (t.data.name || 'Gallery')
        : t.kind === 'software' ? (t.data.name || 'Software')
          : t.kind === 'file' ? (t.data.item?.title || t.data.item?.name || 'File')
            : (t.data.title || 'Untitled'),
    subtitle: t.kind === 'project' ? (TYPE_LABEL[t.data.type] || t.data.type)
      : t.kind === 'gallery' ? `Gallery · ${TYPE_LABEL[t.data.type] || t.data.type}`
        : t.kind === 'software' ? 'Software'
          : t.kind === 'file' ? 'File' : 'Plan',
    thumb: trashThumb(t),
  }));
  res.json({ items, ttlDays: TRASH_TTL_DAYS });
});

app.post('/api/trash/:trashId/restore', async (req, res) => {
  try {
    let move = null; let fileRestore = null; let gone = false;
    const restored = await mutateDB((db) => {
      const idx = (db.trash || []).findIndex((t) => t.trashId === req.params.trashId);
      if (idx === -1) return null;
      const entry = db.trash[idx];
      if (entry.kind === 'project') {
        db.projects.push(entry.data);
        for (const gid of entry.galleryIds || []) {
          const g = db.galleries.find((x) => x.id === gid);
          if (g) { g.projectIds = g.projectIds || []; if (!g.projectIds.includes(entry.data.id)) g.projectIds.push(entry.data.id); }
        }
        move = { from: path.join(TRASH_DIR, entry.trashId), to: path.join(DATA_DIR, entry.data.type, entry.data.id) };
      } else if (entry.kind === 'plan') {
        db.plans.push(entry.data);
        move = { from: path.join(TRASH_DIR, entry.trashId), to: path.join(DATA_DIR, 'plan', entry.data.id) };
      } else if (entry.kind === 'gallery') {
        db.galleries.push(entry.data);
      } else if (entry.kind === 'software') {
        if (!Array.isArray(db.software)) db.software = [];
        db.software.push(entry.data);
        move = { from: path.join(TRASH_DIR, entry.trashId), to: softDir(entry.data.id) };
      } else if (entry.kind === 'file') {
        const p = db.plans.find((x) => x.id === entry.data.planId);
        const b = p && p.blocks && p.blocks.find((x) => x.id === entry.data.blockId);
        if (!b || (b.type !== 'files' && b.type !== 'pdf')) { gone = true; return null; } // its plan/block is gone — leave it in Trash
        b.files = [...(b.files || []), entry.data.item];
        fileRestore = entry.data;
      }
      db.trash.splice(idx, 1);
      return entry;
    });
    if (gone) return res.status(409).json({ error: 'target_gone', message: 'The files block this file belonged to no longer exists.' });
    if (!restored) return res.status(404).json({ error: 'not_found' });
    if (move) await restoreFromTrash(move.from, move.to);
    if (fileRestore) await restoreFilesFromTrash(req.params.trashId, fileRestore.planId, fileRestore.rels);
    res.json({ ok: true, kind: restored.kind, id: restored.data?.id, type: restored.data?.type });
  } catch (err) {
    res.status(500).json({ error: 'restore_failed', message: String(err.message || err) });
  }
});

app.delete('/api/trash/:trashId', async (req, res) => {
  let dir = null;
  const ok = await mutateDB((db) => {
    const idx = (db.trash || []).findIndex((t) => t.trashId === req.params.trashId);
    if (idx === -1) return false;
    dir = path.join(TRASH_DIR, req.params.trashId);
    db.trash.splice(idx, 1);
    return true;
  });
  if (!ok) return res.status(404).json({ error: 'not_found' });
  if (dir) await safeRm(dir, { recursive: true, force: true }).catch(() => {});
  res.json({ ok: true });
});

app.delete('/api/trash', async (_req, res) => {
  const ids = await mutateDB((db) => { const list = (db.trash || []).map((t) => t.trashId); db.trash = []; return list; });
  for (const tid of ids) await safeRm(path.join(TRASH_DIR, tid), { recursive: true, force: true }).catch(() => {});
  res.json({ ok: true, removed: ids.length });
});

// ---------------------------------------------------------------------------
// To-Do board (a single global Kanban planner: columns → cards → tags).
// ---------------------------------------------------------------------------
const TAG_KEYS = new Set(['red', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'gray']);
const str = (v, max = 2000) => String(v == null ? '' : v).slice(0, max);
function normalizeBoard(board) {
  const columns = Array.isArray(board?.columns) ? board.columns : [];
  return {
    columns: columns.slice(0, 40).map((c) => ({
      id: c?.id || nanoid(8),
      name: str(c?.name, 120),
      cards: (Array.isArray(c?.cards) ? c.cards : []).slice(0, 500).map((card) => ({
        id: card?.id || nanoid(8),
        title: str(card?.title, 4000),
        notes: str(card?.notes, 8000),
        color: TAG_KEYS.has(card?.color) ? card.color : null,
        urgent: !!card?.urgent,
        tags: (Array.isArray(card?.tags) ? card.tags : []).slice(0, 20).map((t) => ({
          id: t?.id || nanoid(6),
          label: str(t?.label, 60),
          color: TAG_KEYS.has(t?.color) ? t.color : 'gray',
        })),
      })),
    })),
  };
}
const DEFAULT_BOARD = () => ({
  columns: [
    { id: nanoid(8), name: 'To do', cards: [] },
    { id: nanoid(8), name: 'In progress', cards: [] },
    { id: nanoid(8), name: 'Done', cards: [] },
  ],
});

app.get('/api/board', async (_req, res) => {
  const db = await readDB();
  if (!db.board || !Array.isArray(db.board.columns) || !db.board.columns.length) {
    const board = DEFAULT_BOARD();
    await mutateDB((d) => { d.board = board; return d; });
    return res.json({ board });
  }
  res.json({ board: normalizeBoard(db.board) });
});

app.put('/api/board', async (req, res) => {
  if (!Array.isArray(req.body?.columns)) return res.status(400).json({ error: 'columns_required' });
  const board = normalizeBoard({ columns: req.body.columns });
  await mutateDB((d) => { d.board = board; return d; });
  res.json({ board });
});

// ---------------------------------------------------------------------------
// Software — a topic per app (After Effects, …) with a plugin database,
// your own scripts (files), expressions and tutorial links.
// ---------------------------------------------------------------------------
const CURRENCIES = new Set(['EUR', 'USD', 'GBP', 'CHF', 'JPY', 'CAD', 'AUD']);
const softDir = (id) => path.join(DATA_DIR, 'software', id);
function normalizePlugin(p) {
  return {
    id: p?.id || nanoid(8),
    name: str(p?.name, 160), category: str(p?.category, 80),
    url: str(p?.url, 500), account: str(p?.account, 200), key: str(p?.key, 400),
    price: str(p?.price, 40), currency: CURRENCIES.has(p?.currency) ? p.currency : 'EUR',
    version: str(p?.version, 60), purchasedAt: str(p?.purchasedAt, 20), notes: str(p?.notes, 4000),
    file: p?.file ? str(p.file, 300) : null, fileName: p?.fileName ? str(p.fileName, 200) : null,
    size: Number.isFinite(p?.size) ? p.size : 0,
    image: p?.image ? str(p.image, 300) : null, imageName: p?.imageName ? str(p.imageName, 200) : null,
  };
}
const normTags = (t) => (Array.isArray(t) ? t : []).slice(0, 24).map((x) => str(x, 40)).filter(Boolean);
const normalizeExpr = (e) => ({ id: e?.id || nanoid(8), title: str(e?.title, 200), code: str(e?.code, 20000), notes: str(e?.notes, 4000), color: TAG_KEYS.has(e?.color) ? e.color : null, tags: normTags(e?.tags) });
const normalizeExprGroup = (g) => ({
  id: g?.id || nanoid(8), name: str(g?.name, 160), collapsed: !!g?.collapsed,
  image: g?.image ? str(g.image, 300) : null, imageName: g?.imageName ? str(g.imageName, 200) : null,
  items: (Array.isArray(g?.items) ? g.items : []).slice(0, 500).map(normalizeExpr),
});
const normalizeTut = (t) => ({ id: t?.id || nanoid(8), title: str(t?.title, 200), url: str(t?.url, 500), channel: str(t?.channel, 120), tags: normTags(t?.tags) });
function normalizeSoftware(s) {
  if (!s || typeof s !== 'object') return s;
  if (!s.id) s.id = nanoid(10);
  s.name = str(s.name, 120) || 'Untitled software';
  // Banner + avatar (like plans). `icon` is the legacy emoji → avatarEmoji.
  if (typeof s.avatarEmoji !== 'string') s.avatarEmoji = typeof s.icon === 'string' ? s.icon : '';
  delete s.icon;
  if (!('banner' in s)) s.banner = null;
  s.bannerGradient = s.bannerGradient != null ? str(s.bannerGradient, 40) : null;
  if (!('avatar' in s)) s.avatar = null;
  if (!Number.isFinite(s.createdAt)) s.createdAt = Date.now();
  // Legacy `scripts` fold into `plugins` (one combined list now).
  let plugins = Array.isArray(s.plugins) ? s.plugins : [];
  if (Array.isArray(s.scripts) && s.scripts.length) {
    plugins = [...plugins, ...s.scripts.map((sc) => ({ id: sc?.id || nanoid(8), name: sc?.name || sc?.fileName || 'Script', category: 'Script', notes: sc?.notes || '', file: sc?.file || null, fileName: sc?.fileName || null, size: sc?.size || 0 }))];
  }
  delete s.scripts;
  s.plugins = plugins.map(normalizePlugin);
  // Legacy flat `expressions` fold into a single default group.
  if (!Array.isArray(s.expressionGroups)) {
    const flat = Array.isArray(s.expressions) ? s.expressions : [];
    s.expressionGroups = flat.length ? [{ id: nanoid(8), name: '', image: null, imageName: null, items: flat }] : [];
  }
  delete s.expressions;
  s.expressionGroups = s.expressionGroups.map(normalizeExprGroup);
  s.tutorials = (Array.isArray(s.tutorials) ? s.tutorials : []).map(normalizeTut);
  return s;
}
const findSoft = (db, id) => (db.software || []).find((x) => x.id === id);

app.get('/api/software', async (_req, res) => {
  const db = await readDB();
  res.json({ software: (db.software || []).map(normalizeSoftware) });
});
app.get('/api/software/:id', async (req, res) => {
  const db = await readDB();
  const s = findSoft(db, req.params.id);
  if (!s) return res.status(404).json({ error: 'not_found' });
  res.json({ software: normalizeSoftware(s) });
});
app.post('/api/software', async (req, res) => {
  const s = { id: nanoid(10), name: str(req.body?.name, 120) || 'Untitled software', avatarEmoji: str(req.body?.avatarEmoji ?? req.body?.icon, 40), banner: null, bannerGradient: null, avatar: null, createdAt: Date.now(), plugins: [], expressionGroups: [], tutorials: [] };
  await mutateDB((db) => { if (!Array.isArray(db.software)) db.software = []; db.software.push(s); return db; });
  res.status(201).json({ software: s });
});

// Wholesale edit of the JSON parts. File fields (plugin installer/image, group
// image) are server-authoritative and preserved by id — only the upload/delete
// endpoints below change them, so a text edit can never clobber a file.
app.patch('/api/software/:id', async (req, res) => {
  const removedFiles = [];
  const updated = await mutateDB((db) => {
    const s = findSoft(db, req.params.id); if (!s) return null;
    if ('name' in req.body) s.name = str(req.body.name, 120);
    if ('avatarEmoji' in req.body) s.avatarEmoji = str(req.body.avatarEmoji, 40);
    if ('bannerGradient' in req.body) s.bannerGradient = req.body.bannerGradient == null ? null : str(req.body.bannerGradient, 40);
    if (Array.isArray(req.body.plugins)) {
      const oldById = new Map((s.plugins || []).map((p) => [p.id, p]));
      const next = req.body.plugins.map((p) => {
        const old = oldById.get(p?.id); const n = normalizePlugin(p);
        n.file = old?.file ?? null; n.fileName = old?.fileName ?? null; n.size = old?.size ?? 0;
        n.image = old?.image ?? null; n.imageName = old?.imageName ?? null; return n;
      });
      const keep = new Set(next.map((p) => p.id));
      for (const p of (s.plugins || [])) if (!keep.has(p.id)) { if (p.file) removedFiles.push(p.file); if (p.image) removedFiles.push(p.image); }
      s.plugins = next;
    }
    if (Array.isArray(req.body.expressionGroups)) {
      const oldById = new Map((s.expressionGroups || []).map((g) => [g.id, g]));
      const next = req.body.expressionGroups.map((g) => { const old = oldById.get(g?.id); const n = normalizeExprGroup(g); n.image = old?.image ?? null; n.imageName = old?.imageName ?? null; return n; });
      const keep = new Set(next.map((g) => g.id));
      for (const g of (s.expressionGroups || [])) if (!keep.has(g.id) && g.image) removedFiles.push(g.image);
      s.expressionGroups = next;
    }
    if (Array.isArray(req.body.tutorials)) s.tutorials = req.body.tutorials.map(normalizeTut);
    return s;
  });
  if (!updated) return res.status(404).json({ error: 'not_found' });
  for (const f of removedFiles) await safeRm(path.join(softDir(req.params.id), path.basename(f)), { force: true }).catch(() => {});
  res.json({ software: updated });
});

app.delete('/api/software/:id', async (req, res) => {
  const trashId = nanoid(10);
  let move = null;
  const ok = await mutateDB((db) => {
    const i = (db.software || []).findIndex((x) => x.id === req.params.id); if (i === -1) return null;
    const s = db.software[i];
    db.trash.unshift({ trashId, kind: 'software', deletedAt: Date.now(), data: s });
    db.software.splice(i, 1);
    move = { from: softDir(s.id), to: path.join(TRASH_DIR, trashId) };
    return true;
  });
  if (!ok) return res.status(404).json({ error: 'not_found' });
  if (move) await moveToTrash(move.from, move.to);
  res.json({ ok: true, trashId });
});

// Software banner / avatar images (like plans).
const softImage = (kind) => async (req, res) => {
  try {
    const db = await readDB();
    const s = findSoft(db, req.params.id);
    if (!s) { await cleanupTmp(req); return res.status(404).json({ error: 'not_found' }); }
    if (!req.file) return res.status(400).json({ error: 'file_required' });
    if (s[kind]) await safeRm(path.join(softDir(s.id), path.basename(s[kind])), { force: true }).catch(() => {});
    const stored = await moveInto(softDir(s.id), req.file.path, `${kind}${extOf(req.file.originalname) || '.png'}`);
    const updated = await mutateDB((d) => { const ss = findSoft(d, s.id); ss[kind] = stored; if (kind === 'banner') ss.bannerGradient = null; return ss; });
    await cleanupTmp(req);
    res.json({ software: updated });
  } catch (e) { await cleanupTmp(req); res.status(500).json({ error: 'image_failed', message: String(e.message || e) }); }
};
const softImageDelete = (kind) => async (req, res) => {
  let removed = null;
  const updated = await mutateDB((db) => { const s = findSoft(db, req.params.id); if (!s) return null; removed = s[kind]; s[kind] = null; return s; });
  if (!updated) return res.status(404).json({ error: 'not_found' });
  if (removed) await safeRm(path.join(softDir(req.params.id), path.basename(removed)), { force: true }).catch(() => {});
  res.json({ software: updated });
};
app.post('/api/software/:id/banner', upload.single('banner'), softImage('banner'));
app.delete('/api/software/:id/banner', softImageDelete('banner'));
app.post('/api/software/:id/avatar', upload.single('avatar'), softImage('avatar'));
app.delete('/api/software/:id/avatar', softImageDelete('avatar'));

// Plugin installer file + preview image (one each per plugin).
const pluginFileEndpoint = (field, kind, prefix) => async (req, res) => {
  try {
    const db = await readDB();
    const s = findSoft(db, req.params.id);
    const p = s && (s.plugins || []).find((x) => x.id === req.params.pluginId);
    if (!s || !p) { await cleanupTmp(req); return res.status(404).json({ error: 'not_found' }); }
    if (!req.file) return res.status(400).json({ error: 'file_required' });
    if (p[kind]) await safeRm(path.join(softDir(s.id), path.basename(p[kind])), { force: true }).catch(() => {});
    const stored = await moveInto(softDir(s.id), req.file.path, `${prefix}${p.id}${extOf(req.file.originalname) || ''}`);
    const size = req.file.size;
    const updated = await mutateDB((d) => {
      const pp = findSoft(d, s.id).plugins.find((x) => x.id === p.id);
      if (kind === 'file') { pp.file = stored; pp.fileName = req.file.originalname; pp.size = size; }
      else { pp.image = stored; pp.imageName = req.file.originalname; }
      return findSoft(d, s.id);
    });
    await cleanupTmp(req);
    res.json({ software: updated });
  } catch (e) { await cleanupTmp(req); res.status(500).json({ error: `${kind}_failed`, message: String(e.message || e) }); }
};
const pluginFileDelete = (kind) => async (req, res) => {
  let removed = null;
  const updated = await mutateDB((db) => {
    const s = findSoft(db, req.params.id); if (!s) return null;
    const p = (s.plugins || []).find((x) => x.id === req.params.pluginId); if (!p) return null;
    removed = p[kind];
    if (kind === 'file') { p.file = null; p.fileName = null; p.size = 0; } else { p.image = null; p.imageName = null; }
    return s;
  });
  if (!updated) return res.status(404).json({ error: 'not_found' });
  if (removed) await safeRm(path.join(softDir(req.params.id), path.basename(removed)), { force: true }).catch(() => {});
  res.json({ software: updated });
};
app.post('/api/software/:id/plugins/:pluginId/file', upload.single('file'), pluginFileEndpoint('file', 'file', ''));
app.delete('/api/software/:id/plugins/:pluginId/file', pluginFileDelete('file'));
app.post('/api/software/:id/plugins/:pluginId/image', upload.single('image'), pluginFileEndpoint('image', 'image', 'img_'));
app.delete('/api/software/:id/plugins/:pluginId/image', pluginFileDelete('image'));

// Expression-group preview image.
app.post('/api/software/:id/groups/:groupId/image', upload.single('image'), async (req, res) => {
  try {
    const db = await readDB();
    const s = findSoft(db, req.params.id);
    const g = s && (s.expressionGroups || []).find((x) => x.id === req.params.groupId);
    if (!s || !g) { await cleanupTmp(req); return res.status(404).json({ error: 'not_found' }); }
    if (!req.file) return res.status(400).json({ error: 'file_required' });
    if (g.image) await safeRm(path.join(softDir(s.id), path.basename(g.image)), { force: true }).catch(() => {});
    const stored = await moveInto(softDir(s.id), req.file.path, `grp_${g.id}${extOf(req.file.originalname) || ''}`);
    const updated = await mutateDB((d) => { const gg = findSoft(d, s.id).expressionGroups.find((x) => x.id === g.id); gg.image = stored; gg.imageName = req.file.originalname; return findSoft(d, s.id); });
    await cleanupTmp(req);
    res.json({ software: updated });
  } catch (e) { await cleanupTmp(req); res.status(500).json({ error: 'image_failed', message: String(e.message || e) }); }
});
app.delete('/api/software/:id/groups/:groupId/image', async (req, res) => {
  let removed = null;
  const updated = await mutateDB((db) => {
    const s = findSoft(db, req.params.id); if (!s) return null;
    const g = (s.expressionGroups || []).find((x) => x.id === req.params.groupId); if (!g) return null;
    removed = g.image; g.image = null; g.imageName = null; return s;
  });
  if (!updated) return res.status(404).json({ error: 'not_found' });
  if (removed) await safeRm(path.join(softDir(req.params.id), path.basename(removed)), { force: true }).catch(() => {});
  res.json({ software: updated });
});

// ---------------------------------------------------------------------------
// Storage usage + editable limit.
// ---------------------------------------------------------------------------
app.get('/api/storage', async (_req, res) => {
  const db = await readDB();
  const usedBytes = await getUsedBytes();
  res.json({ usedBytes, limitBytes: db.settings.storageLimitBytes });
});

app.patch('/api/storage', async (req, res) => {
  const limitBytes = Number(req.body.limitBytes);
  if (!Number.isFinite(limitBytes) || limitBytes <= 0) return res.status(400).json({ error: 'invalid_limit' });
  const settings = await mutateDB((db) => { db.settings.storageLimitBytes = Math.round(limitBytes); return db.settings; });
  res.json({ limitBytes: settings.storageLimitBytes });
});

// ---------------------------------------------------------------------------
// App settings (dashboard banner, …).
// ---------------------------------------------------------------------------
const dashboardDir = () => path.join(DATA_DIR, 'dashboard');
app.get('/api/settings', async (_req, res) => {
  const db = await readDB();
  res.json({ settings: db.settings });
});
app.patch('/api/settings', async (req, res) => {
  const settings = await mutateDB((db) => {
    if ('dashboardBannerGradient' in req.body) db.settings.dashboardBannerGradient = req.body.dashboardBannerGradient == null ? null : str(req.body.dashboardBannerGradient, 40);
    return db.settings;
  });
  res.json({ settings });
});
app.post('/api/settings/dashboard-banner', upload.single('banner'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'file_required' });
    const db = await readDB();
    if (db.settings.dashboardBanner) await safeRm(path.join(dashboardDir(), path.basename(db.settings.dashboardBanner)), { force: true }).catch(() => {});
    const stored = await moveInto(dashboardDir(), req.file.path, `banner${extOf(req.file.originalname) || '.png'}`);
    const settings = await mutateDB((d) => { d.settings.dashboardBanner = stored; d.settings.dashboardBannerGradient = null; return d.settings; });
    await cleanupTmp(req);
    res.json({ settings });
  } catch (err) { await cleanupTmp(req); res.status(500).json({ error: 'banner_failed', message: String(err.message || err) }); }
});
app.delete('/api/settings/dashboard-banner', async (_req, res) => {
  let file = null;
  const settings = await mutateDB((db) => { file = db.settings.dashboardBanner; db.settings.dashboardBanner = null; return db.settings; });
  if (file) await safeRm(path.join(dashboardDir(), path.basename(file)), { force: true }).catch(() => {});
  res.json({ settings });
});

// ---------------------------------------------------------------------------
// Export / import the whole library as a single .zip (STORE + ZIP64).
// ---------------------------------------------------------------------------
// Skip working/backup files so the archive holds just the library itself.
const EXPORT_SKIP = (rel) =>
  rel === 'db.json.bak'
  || rel.startsWith('backups/') || rel === 'backups'
  || rel.startsWith('tmp/') || rel === 'tmp'
  || rel.startsWith('trash/') || rel === 'trash'
  || /^\.db-.*\.tmp$/.test(rel);

app.get('/api/export', async (_req, res) => {
  const stamp = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="design-reference-${stamp}.zip"`);
  try {
    await createZipToStream(DATA_DIR, res, { skip: EXPORT_SKIP });
    res.end();
  } catch (err) {
    console.error('export failed', err);
    if (!res.headersSent) res.status(500).json({ error: 'export_failed', message: String(err.message || err) });
    else res.destroy(err);
  }
});

// Replace the live library with the freshly-extracted staging dir, preserving
// backups/ and tmp/ (which holds the staging dir itself).
async function swapLibrary(stage) {
  const preserve = new Set(['backups', 'tmp']);
  for (const name of await fsp.readdir(DATA_DIR)) {
    if (preserve.has(name)) continue;
    await safeRm(path.join(DATA_DIR, name), { recursive: true, force: true });
  }
  for (const name of await fsp.readdir(stage)) {
    const src = path.join(stage, name);
    if (preserve.has(name)) { await safeRm(src, { recursive: true, force: true }); continue; }
    await fsp.rename(src, path.join(DATA_DIR, name));
  }
  invalidateStorage();
}

app.post('/api/import', uploadArchive.single('archive'), async (req, res) => {
  if (!req.file) { await cleanupTmp(req); return res.status(400).json({ error: 'archive_required' }); }
  try {
    // 1) Validate the archive completely before touching the current library.
    await validateLibraryZip(req.file.path);
    // 2) Auto-backup the current library as a safety net (kept in backups/).
    await fsp.mkdir(BACKUP_DIR, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backup = path.join(BACKUP_DIR, `pre-import-${stamp}.zip`);
    const ws = fs.createWriteStream(backup);
    await createZipToStream(DATA_DIR, ws, { skip: EXPORT_SKIP });
    await new Promise((resolve, reject) => ws.end((err) => (err ? reject(err) : resolve())));
    // 3) Extract into staging (verifies CRCs) — still non-destructive.
    const stage = path.join(req.tmpDir, 'stage');
    await fsp.mkdir(stage, { recursive: true });
    await extractZip(req.file.path, stage);
    // 4) Let pending writes finish, then swap the new library into place.
    await writeChain.catch(() => {});
    await swapLibrary(stage);
    await cleanupTmp(req);
    res.json({ ok: true, backup: path.basename(backup) });
  } catch (err) {
    await cleanupTmp(req);
    console.error('import failed', err);
    res.status(400).json({ error: 'import_failed', message: String(err.message || err) });
  }
});

// ---------------------------------------------------------------------------
// In production (npm start) serve the built frontend from the same origin.
// ---------------------------------------------------------------------------
if (IS_PROD && fs.existsSync(DIST_DIR)) {
  // Vite emits content-hashed files under /assets (index-<hash>.js …) — those
  // can be cached forever; index.html and other root files must stay fresh so a
  // redeploy is picked up.
  app.use(express.static(DIST_DIR, {
    setHeaders: (res, filePath) => {
      if (/[\\/]assets[\\/]/.test(filePath)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      else res.setHeader('Cache-Control', 'no-cache');
    },
  }));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/data')) return next();
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(DIST_DIR, 'index.html'));
  });
}

function parseJSON(value, fallback) {
  if (value == null) return fallback;
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

purgeExpiredTrash().catch(() => {}); // clear items older than the TTL on boot

const server = app.listen(PORT, () => {
  console.log(`\n  Design Reference API  →  http://localhost:${PORT}`);
  console.log(`  Library folder        →  ${DATA_DIR}`);
  if (IS_PROD) console.log(`  Serving built app     →  http://localhost:${PORT}\n`);
  else console.log(`  Frontend (dev)        →  http://localhost:4200\n`);
});

// Graceful shutdown: stop taking new requests, let in-flight writes finish, and
// only then exit — so a restart/deploy can't interrupt a db write.
let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n  ${signal} received — finishing pending writes…`);
  const hardExit = setTimeout(() => process.exit(0), 5000);
  hardExit.unref();
  await new Promise((resolve) => server.close(resolve));
  // Drain the write chain until it stops growing.
  let prev;
  do { prev = writeChain; await prev.catch(() => {}); } while (writeChain !== prev);
  clearTimeout(hardExit);
  process.exit(0);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
