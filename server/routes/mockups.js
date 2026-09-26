// Mockups — saved 3D device scenes (iPhone, iPad, MacBook, browser window or
// an imported model) with a picture or video on the screen, and the 3D models
// the user imported (GLB / glTF / USDZ).
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { nanoid } from 'nanoid';
import { DATA_DIR, TRASH_DIR } from '../config.js';
import { readDB, mutateDB } from '../db.js';
import { moveInto, replaceImage, safeRm, moveToTrash, extOf } from '../files.js';
import { upload } from '../upload.js';
import { str, normalizeMockup, normalizeMockupModel } from '../schema.js';
import { createRouter } from '../http.js';

const router = createRouter();
export default router;

export const mockupDir = (id) => path.join(DATA_DIR, 'mockup', id);
export const modelDir = (id) => path.join(DATA_DIR, 'mockup-model', id);
const IMAGE_EXT = /\.(png|jpe?g|gif|webp|avif|svg)$/i;
const VIDEO_EXT = /\.(mp4|m4v|mov|webm|ogv)$/i;
const MODEL_EXT = { '.glb': 'glb', '.gltf': 'gltf', '.usdz': 'usdz' };
const kindOf = (name, mime = '') => (VIDEO_EXT.test(name) || mime.startsWith('video/') ? 'video'
  : IMAGE_EXT.test(name) || mime.startsWith('image/') ? 'image' : null);

router.get('/api/mockups', async (_req, res) => {
  const db = await readDB();
  const mockups = db.mockups.map(normalizeMockup).sort((a, b) => (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt));
  res.json({ mockups, models: db.mockupModels.map(normalizeMockupModel) });
});

router.get('/api/mockups/:id', async (req, res) => {
  const db = await readDB();
  const m = db.mockups.find((x) => x.id === req.params.id);
  if (!m) return res.status(404).json({ error: 'not_found' });
  res.json({ mockup: normalizeMockup(m) });
});

router.post('/api/mockups', async (req, res) => {
  const now = Date.now();
  const m = normalizeMockup({ ...req.body, id: nanoid(10), content: null, thumb: null, createdAt: now, updatedAt: now });
  await mutateDB((db) => { db.mockups.push(m); });
  res.status(201).json({ mockup: m });
});

// Settings only — the screen content and the thumbnail are changed by their own endpoints.
const EDITABLE = ['name', 'device', 'modelId', 'color', 'landscape', 'lying', 'lid', 'browserDark', 'url', 'fit', 'camera', 'frame', 'background', 'shadow'];
router.patch('/api/mockups/:id', async (req, res) => {
  const updated = await mutateDB((db) => {
    const i = db.mockups.findIndex((x) => x.id === req.params.id);
    if (i === -1) return null;
    const cur = db.mockups[i];
    const next = { ...cur };
    for (const k of EDITABLE) if (k in req.body) next[k] = req.body[k];
    db.mockups[i] = { ...normalizeMockup(next), content: cur.content || null, thumb: cur.thumb || null, updatedAt: Date.now() };
    return db.mockups[i];
  });
  if (!updated) return res.status(404).json({ error: 'not_found' });
  res.json({ mockup: normalizeMockup(updated) });
});

router.post('/api/mockups/:id/duplicate', async (req, res) => {
  const db = await readDB();
  const src = db.mockups.find((x) => x.id === req.params.id);
  if (!src) return res.status(404).json({ error: 'not_found' });
  const id = nanoid(10);
  if (fs.existsSync(mockupDir(src.id))) await fsp.cp(mockupDir(src.id), mockupDir(id), { recursive: true });
  const now = Date.now();
  const copy = { ...normalizeMockup(src), id, name: `${src.name || 'Mockup'} copy`, createdAt: now, updatedAt: now };
  await mutateDB((d) => { d.mockups.push(copy); });
  res.status(201).json({ mockup: copy });
});

router.delete('/api/mockups/:id', async (req, res) => {
  const trashId = nanoid(10);
  const m = await mutateDB((db) => {
    const i = db.mockups.findIndex((x) => x.id === req.params.id);
    if (i === -1) return null;
    const [gone] = db.mockups.splice(i, 1);
    db.trash.unshift({ trashId, kind: 'mockup', deletedAt: Date.now(), data: gone });
    return gone;
  });
  if (!m) return res.status(404).json({ error: 'not_found' });
  await moveToTrash(mockupDir(m.id), path.join(TRASH_DIR, trashId));
  res.json({ ok: true, trashId });
});

// ---- The picture / video on the screen -----------------------------------------
async function setContent(id, write) {
  const db = await readDB();
  const m = db.mockups.find((x) => x.id === id);
  if (!m) return null;
  const content = await write(mockupDir(id));
  const old = m.content?.file;
  const updated = await mutateDB((d) => {
    const x = d.mockups.find((y) => y.id === id);
    if (!x) return null;
    x.content = content; x.updatedAt = Date.now();
    return x;
  });
  if (old && old !== content?.file) await safeRm(path.join(mockupDir(id), path.basename(old)), { force: true }).catch(() => {});
  return updated;
}

router.post('/api/mockups/:id/content', upload.single('file'), async (req, res) => {
  const f = req.file;
  const kind = f && kindOf(f.originalname, f.mimetype);
  if (!kind) return res.status(400).json({ error: 'unsupported', message: 'Choose an image or a video.' });
  const m = await setContent(req.params.id, async (dir) => ({
    file: await moveInto(dir, f.path, `content-${nanoid(6)}${extOf(f.originalname) || (kind === 'video' ? '.mp4' : '.png')}`),
    kind, name: str(f.originalname, 200),
  }));
  if (!m) return res.status(404).json({ error: 'not_found' });
  res.json({ mockup: normalizeMockup(m) });
});

router.delete('/api/mockups/:id/content', async (req, res) => {
  const m = await setContent(req.params.id, async () => null);
  if (!m) return res.status(404).json({ error: 'not_found' });
  res.json({ mockup: normalizeMockup(m) });
});

// Something from the library onto the screen — named by id, never by path:
// { kind: 'plan', planId, blockId, itemId } images / videos / storyboard frames of a plan,
// { kind: 'project', projectId, itemId? } a project's video / image, or one of its frames, moments or assets,
// { kind: 'inbox', itemId } a shared file.
function findSource(db, s) {
  if (s?.kind === 'plan') {
    const plan = db.plans.find((p) => p.id === s.planId);
    const b = plan?.blocks?.find((x) => x.id === s.blockId);
    if (!b) return null;
    const hit = (b.images || []).find((x) => x.id === s.itemId) || (b.files || []).find((x) => x.id === s.itemId)
      || (b.versions || []).find((x) => x.id === s.itemId);
    const shot = (b.shots || []).find((x) => x.id === s.itemId);
    const rel = hit?.file || shot?.image;
    const label = hit?.title || hit?.name || hit?.label || (shot ? `${b.title || 'Storyboard'} · shot ${b.shots.indexOf(shot) + 1}` : `${plan.name || 'Plan'} · ${b.title || 'Moodboard'}`);
    return rel ? { abs: path.join(DATA_DIR, 'plan', plan.id, rel), name: label } : null;
  }
  if (s?.kind === 'project') {
    const p = db.projects.find((x) => x.id === s.projectId);
    if (!p) return null;
    let rel = null;
    if (s.itemId) {
      rel = (p.frames || []).find((f) => f.id === s.itemId)?.file
        || (p.markers || []).find((f) => f.id === s.itemId)?.thumb
        || (p.assets || []).find((a) => a.id === s.itemId && a.kind === 'image')?.file;
    } else rel = p.video || p.image || p.thumb;
    return rel ? { abs: path.join(DATA_DIR, p.type, p.id, rel), name: p.title || path.basename(rel) } : null;
  }
  if (s?.kind === 'inbox') {
    const it = db.inbox.find((x) => x.id === s.itemId);
    return it?.file ? { abs: path.join(DATA_DIR, 'inbox', it.id, it.file), name: it.name || it.file } : null;
  }
  return null;
}
router.post('/api/mockups/:id/content/import', async (req, res) => {
  const db = await readDB();
  const src = findSource(db, req.body?.source);
  const kind = src && kindOf(src.abs);
  if (!src || !kind || src.abs.includes('..') || !fs.existsSync(src.abs)) {
    return res.status(400).json({ error: 'not_found', message: 'That picture or video is no longer there.' });
  }
  const m = await setContent(req.params.id, async (dir) => {
    const file = `content-${nanoid(6)}${extOf(src.abs)}`;
    await fsp.mkdir(dir, { recursive: true });
    await fsp.copyFile(src.abs, path.join(dir, file));
    return { file, kind, name: str(src.name, 200) };
  });
  if (!m) return res.status(404).json({ error: 'not_found' });
  res.json({ mockup: normalizeMockup(m) });
});

// A small render of the scene for the list (made in the browser).
router.post('/api/mockups/:id/thumb', upload.single('thumb'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'thumb_required' });
  const db = await readDB();
  const m = db.mockups.find((x) => x.id === req.params.id);
  if (!m) return res.status(404).json({ error: 'not_found' });
  const stored = await replaceImage(mockupDir(m.id), req.file.path, 'thumb', req.file.originalname, m.thumb, '.webp');
  const updated = await mutateDB((d) => { const x = d.mockups.find((y) => y.id === m.id); if (x) x.thumb = stored; return x; });
  res.json({ mockup: normalizeMockup(updated) });
});

// ---- Imported 3D models ------------------------------------------------------------
router.post('/api/mockup-models', upload.single('model'), async (req, res) => {
  const f = req.file;
  const format = f && MODEL_EXT[extOf(f.originalname).toLowerCase()];
  if (!format) return res.status(400).json({ error: 'unsupported', message: 'Choose a .glb, .gltf (single file) or .usdz model.' });
  const id = nanoid(10);
  const file = await moveInto(modelDir(id), f.path, `model.${format}`);
  const model = normalizeMockupModel({
    id, file, format, size: f.size, createdAt: Date.now(),
    name: str(req.body?.name, 120).trim() || path.basename(f.originalname, path.extname(f.originalname)),
  });
  await mutateDB((db) => { db.mockupModels.push(model); });
  res.status(201).json({ model });
});

router.patch('/api/mockup-models/:id', async (req, res) => {
  const updated = await mutateDB((db) => {
    const i = db.mockupModels.findIndex((x) => x.id === req.params.id);
    if (i === -1) return null;
    const cur = db.mockupModels[i];
    const next = { ...cur };
    for (const k of ['name', 'screenMesh', 'screenTurn', 'screenFlip']) if (k in req.body) next[k] = req.body[k];
    db.mockupModels[i] = { ...normalizeMockupModel(next), file: cur.file, format: cur.format, size: cur.size };
    return db.mockupModels[i];
  });
  if (!updated) return res.status(404).json({ error: 'not_found' });
  res.json({ model: updated });
});

router.delete('/api/mockup-models/:id', async (req, res) => {
  const trashId = nanoid(10);
  const m = await mutateDB((db) => {
    const i = db.mockupModels.findIndex((x) => x.id === req.params.id);
    if (i === -1) return null;
    const [gone] = db.mockupModels.splice(i, 1);
    db.trash.unshift({ trashId, kind: 'mockupModel', deletedAt: Date.now(), data: gone });
    return gone;
  });
  if (!m) return res.status(404).json({ error: 'not_found' });
  await moveToTrash(modelDir(m.id), path.join(TRASH_DIR, trashId));
  res.json({ ok: true, trashId });
});
