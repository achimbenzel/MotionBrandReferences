// Reference-library projects (all eight section types) and their files.
import path from 'node:path';
import { nanoid } from 'nanoid';
import { DATA_DIR, TRASH_DIR, TYPES } from '../config.js';
import { readDB, mutateDB } from '../db.js';
import { moveInto, replaceImage, safeRm, moveToTrash, extOf } from '../files.js';
import { upload, parseJSON } from '../upload.js';
import { str, normalizeSegments } from '../schema.js';
import { createRouter, HttpError } from '../http.js';

const router = createRouter();
export default router;

// ---- Read -----------------------------------------------------------------
router.get('/api/projects', async (req, res) => {
  const db = await readDB();
  let projects = db.projects;
  if (req.query.type && TYPES.has(req.query.type)) {
    projects = projects.filter((p) => p.type === req.query.type);
  }
  projects = [...projects].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  res.json({ projects });
});

router.get('/api/projects/:id', async (req, res) => {
  const db = await readDB();
  const project = db.projects.find((p) => p.id === req.params.id);
  if (!project) return res.status(404).json({ error: 'not_found' });
  res.json({ project });
});

// ---- Create ---------------------------------------------------------------
router.post('/api/projects', upload.any(), async (req, res) => {
  const type = req.body.type;
  if (!TYPES.has(type)) return res.status(400).json({ error: 'invalid_type' });
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

  try {
    if (type === 'motion') {
      const video = byField('video');
      if (!video) return res.status(400).json({ error: 'video_required', message: 'Please choose a video.' });
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

    if (type === 'imagegallery' || type === 'logonogo') {
      // Image Gallery: one image per project, shown name-less in a masonry view.
      // Logo No Go: an image of a logo/symbol with a bad reputation, plus a note
      // (added later) on why to avoid resembling it. The image is the cover.
      const image = byField('image');
      if (image) project.image = await moveInto(dir, image.path, `image${extOf(image.originalname) || '.png'}`);
      project.thumb = project.image;
    }

    if (type === 'font') {
      // A link to a website for free fonts, plus an optional screenshot used as
      // the cover (the full shot is kept; a cropped thumb below overrides it).
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
  } catch (err) {
    // Don't leave a half-created project folder behind.
    await safeRm(dir, { recursive: true, force: true }).catch(() => {});
    throw err;
  }
  res.status(201).json({ project });
});

// ---- Update (notes / tags / colors / meta) --------------------------------
const EDITABLE = ['title', 'year', 'category', 'notes', 'tags', 'colors', 'bg', 'scale', 'variant', 'renditions', 'original', 'rendition', 'url', 'segments'];
router.patch('/api/projects/:id', async (req, res) => {
  const updated = await mutateDB((db) => {
    const project = db.projects.find((p) => p.id === req.params.id);
    if (!project) return null;
    for (const key of EDITABLE) {
      if (!(key in req.body)) continue;
      if (key === 'colors' && Array.isArray(req.body.colors)) {
        project.colors = req.body.colors.map((c) => ({ id: c.id || nanoid(6), ...c }));
      } else if (key === 'scale') {
        const s = Number(req.body.scale);
        if (Number.isFinite(s)) project.scale = Math.min(1, Math.max(0.2, s));
      } else if (key === 'variant') {
        if (req.body.variant === 'light' || req.body.variant === 'dark') project.variant = req.body.variant;
      } else if (key === 'segments') {
        // Labeled video sections (Hook / Problem / Reveal …). Each carries a
        // start time and a section type; the first is pinned to 0.
        project.segments = normalizeSegments(req.body.segments);
      } else if (key === 'tags') {
        if (Array.isArray(req.body.tags)) project.tags = req.body.tags.map((t) => str(t, 80)).filter(Boolean);
      } else if (['title', 'year', 'category', 'notes', 'url'].includes(key)) {
        project[key] = str(req.body[key], key === 'notes' ? 100000 : 2000);
      } else {
        project[key] = req.body[key];
      }
    }
    return project;
  });
  if (!updated) return res.status(404).json({ error: 'not_found' });
  res.json({ project: updated });
});

// Load a project for an upload route, or answer 404.
async function findProject(id, type) {
  const db = await readDB();
  const project = db.projects.find((p) => p.id === id);
  if (!project || (type && project.type !== type)) throw new HttpError(404, 'not_found');
  return project;
}

// ---- Set / replace the cover thumbnail (cropped WebP) ---------------------
router.post('/api/projects/:id/thumb', upload.single('thumb'), async (req, res) => {
  const project = await findProject(req.params.id);
  if (!req.file) return res.status(400).json({ error: 'thumb_required' });
  const dir = path.join(DATA_DIR, project.type, project.id);
  // Store the cover under a unique name (and drop the old file) so its URL
  // changes on every re-crop — no stale cached cover in the grid.
  const stored = await replaceImage(dir, req.file.path, 'thumb', req.file.originalname, project.thumb, '.webp');
  const meta = parseJSON(req.body.thumbMeta, null);
  const updated = await mutateDB((d) => {
    const p = d.projects.find((x) => x.id === project.id);
    if (!p) return null;
    p.thumb = stored;
    if (meta) p.thumbMeta = meta; else delete p.thumbMeta;
    return p;
  });
  if (!updated) return res.status(404).json({ error: 'not_found' });
  res.json({ project: updated });
});

// ---- Add a frame (webp) to a motion project -------------------------------
router.post('/api/projects/:id/frames', upload.single('frame'), async (req, res) => {
  const project = await findProject(req.params.id, 'motion');
  if (!req.file) return res.status(400).json({ error: 'frame_required' });
  const dir = path.join(DATA_DIR, 'motion', project.id, 'frames');
  const frameId = nanoid(8);
  const stored = await moveInto(dir, req.file.path, `${frameId}.webp`);
  const frame = { id: frameId, file: `frames/${stored}`, t: Number(req.body.t) || 0, createdAt: Date.now() };
  const updated = await mutateDB((d) => {
    const p = d.projects.find((x) => x.id === project.id);
    if (!p) return null;
    p.frames = p.frames || [];
    p.frames.push(frame);
    return p;
  });
  if (!updated) return res.status(404).json({ error: 'not_found' });
  res.status(201).json({ frame, project: updated });
});

// ---- Add many frames at once (the "a frame for each second" capture) -------
// The client seeks + captures each frame, then uploads them together so the
// whole batch is one round trip and one DB write. `times` is a JSON array of
// timestamps parallel to the uploaded `frames`.
router.post('/api/projects/:id/frames/batch', upload.array('frames', 1200), async (req, res) => {
  const project = await findProject(req.params.id, 'motion');
  const files = req.files || [];
  if (!files.length) return res.status(400).json({ error: 'frames_required' });
  const times = parseJSON(req.body.times, []);
  const dir = path.join(DATA_DIR, 'motion', project.id, 'frames');
  const added = [];
  for (let i = 0; i < files.length; i += 1) {
    const frameId = nanoid(8);
    const stored = await moveInto(dir, files[i].path, `${frameId}.webp`);
    added.push({ id: frameId, file: `frames/${stored}`, t: Number(times[i]) || 0, createdAt: Date.now() });
  }
  const updated = await mutateDB((d) => {
    const p = d.projects.find((x) => x.id === project.id);
    if (!p) return null;
    p.frames = p.frames || [];
    p.frames.push(...added);
    return p;
  });
  if (!updated) return res.status(404).json({ error: 'not_found' });
  res.status(201).json({ frames: added, project: updated });
});

// ---- Delete a frame -------------------------------------------------------
router.delete('/api/projects/:id/frames/:frameId', async (req, res) => {
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
});

// ---- Delete a whole project (soft delete → Trash) -------------------------
router.delete('/api/projects/:id', async (req, res) => {
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
});

// ---------------------------------------------------------------------------
// Galleries — named collections of projects, scoped to a type.
// ---------------------------------------------------------------------------
const idList = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []);

router.get('/api/galleries', async (req, res) => {
  const db = await readDB();
  let galleries = db.galleries;
  if (req.query.type && TYPES.has(req.query.type)) galleries = galleries.filter((g) => g.type === req.query.type);
  galleries = [...galleries].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  res.json({ galleries });
});

router.get('/api/galleries/:id', async (req, res) => {
  const db = await readDB();
  const gallery = db.galleries.find((g) => g.id === req.params.id);
  if (!gallery) return res.status(404).json({ error: 'not_found' });
  res.json({ gallery });
});

router.post('/api/galleries', async (req, res) => {
  const type = req.body.type;
  if (!TYPES.has(type)) return res.status(400).json({ error: 'invalid_type' });
  const gallery = {
    id: nanoid(10),
    type,
    name: str(req.body.name || 'New Gallery', 200).trim() || 'New Gallery',
    projectIds: idList(req.body.projectIds),
    createdAt: Date.now(),
  };
  await mutateDB((db) => { db.galleries.push(gallery); });
  res.status(201).json({ gallery });
});

router.patch('/api/galleries/:id', async (req, res) => {
  const updated = await mutateDB((db) => {
    const g = db.galleries.find((x) => x.id === req.params.id);
    if (!g) return null;
    if (typeof req.body.name === 'string') g.name = str(req.body.name, 200).trim() || g.name;
    if (Array.isArray(req.body.projectIds)) g.projectIds = idList(req.body.projectIds);
    return g;
  });
  if (!updated) return res.status(404).json({ error: 'not_found' });
  res.json({ gallery: updated });
});

router.delete('/api/galleries/:id', async (req, res) => {
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
