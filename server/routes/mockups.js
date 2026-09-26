// Mockups — saved 3D device scenes (iPhone, iPad, MacBook, browser window or
// an imported model) with a picture or video on the screen, and the 3D models
// the user imported (GLB / glTF / USDZ).
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { nanoid } from 'nanoid';
import { DATA_DIR, TRASH_DIR } from '../config.js';
import { readDB, mutateDB } from '../db.js';
import { moveInto, replaceImage, safeRm, moveToTrash, extOf, sniffImageExt } from '../files.js';
import { upload } from '../upload.js';
import { str, normalizeMockup, normalizeMockupModel, normalizeMockupHdri } from '../schema.js';
import { createRouter } from '../http.js';

const router = createRouter();
export default router;

export const mockupDir = (id) => path.join(DATA_DIR, 'mockup', id);
export const modelDir = (id) => path.join(DATA_DIR, 'mockup-model', id);
export const hdriDir = (id) => path.join(DATA_DIR, 'mockup-hdri', id);
const HDRI_EXT = { '.hdr': 'hdr', '.exr': 'exr', '.jpg': 'jpg', '.jpeg': 'jpg', '.png': 'png', '.webp': 'webp', '.avif': 'avif' };
const IMAGE_EXT = /\.(png|jpe?g|gif|webp|avif|svg)$/i;
const VIDEO_EXT = /\.(mp4|m4v|mov|webm|ogv)$/i;
const MODEL_EXT = { '.glb': 'glb', '.gltf': 'gltf', '.usdz': 'usdz' };
const kindOf = (name, mime = '') => (VIDEO_EXT.test(name) || mime.startsWith('video/') ? 'video'
  : IMAGE_EXT.test(name) || mime.startsWith('image/') ? 'image' : null);

router.get('/api/mockups', async (_req, res) => {
  const db = await readDB();
  const mockups = db.mockups.map(normalizeMockup).sort((a, b) => (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt));
  res.json({ mockups, models: db.mockupModels.map(normalizeMockupModel), hdris: db.mockupHdris.map(normalizeMockupHdri) });
});

router.get('/api/mockups/:id', async (req, res) => {
  const db = await readDB();
  const m = db.mockups.find((x) => x.id === req.params.id);
  if (!m) return res.status(404).json({ error: 'not_found' });
  res.json({ mockup: normalizeMockup(m) });
});

// Screen content is server-owned: whatever a client sends for it is ignored.
const withoutContent = (body) => ({
  ...body, content: null, items: Array.isArray(body?.items) ? body.items.map((it) => ({ ...it, content: null })) : body?.items,
  d2: body?.d2 && typeof body.d2 === 'object' ? { ...body.d2, slots: {} } : body?.d2,
});

router.post('/api/mockups', async (req, res) => {
  const now = Date.now();
  const m = normalizeMockup({ ...withoutContent(req.body), id: nanoid(10), thumb: null, createdAt: now, updatedAt: now });
  await mutateDB((db) => { db.mockups.push(m); });
  res.status(201).json({ mockup: m });
});

// Settings only — the screen content and the thumbnail are changed by their own
// endpoints. `items` replaces the scene's devices (each keeps its content by
// id; a new one can share another's with `contentFrom`); the single-device
// fields at the top change the first device.
const SCENE_FIELDS = ['name', 'camera', 'frame', 'background', 'shadow', 'light', 'animation'];
const DEVICE_FIELDS = ['device', 'modelId', 'color', 'landscape', 'lying', 'lid', 'url', 'fit', 'adjust', 'logo', 'hidden', 'size', 'x', 'z', 'rotY',
  'hingeAngle', 'keys', 'videoStart', 'sound', 'volume'];
router.patch('/api/mockups/:id', async (req, res) => {
  const body = req.body || {};
  const updated = await mutateDB((db) => {
    const i = db.mockups.findIndex((x) => x.id === req.params.id);
    if (i === -1) return null;
    const cur = normalizeMockup(db.mockups[i]);
    const next = { ...cur };
    for (const k of SCENE_FIELDS) if (k in body) next[k] = body[k];
    const contentOf = new Map(cur.items.map((it) => [it.id, it.content]));
    if (Array.isArray(body.items) && body.items.length) {
      next.items = body.items.map((it) => ({
        ...it, content: contentOf.get(it?.id) ?? (it?.contentFrom ? contentOf.get(it.contentFrom) ?? null : null),
      }));
    } else if (DEVICE_FIELDS.some((k) => k in body)) {
      const first = { ...cur.items[0] };
      for (const k of DEVICE_FIELDS) if (k in body) first[k] = body[k];
      next.items = [first, ...cur.items.slice(1)];
    }
    // A 2D mockup's texts and look; its pictures (slots) only change through the content routes.
    if (body.d2 && typeof body.d2 === 'object' && cur.kind === '2d') {
      next.d2 = { ...cur.d2, ...body.d2, slots: cur.d2?.slots || {} };
      // …except their size / position on the picture.
      for (const [k, v] of Object.entries(body.d2.slots || {})) {
        if (next.d2.slots[k] && v && typeof v === 'object') {
          next.d2.slots = { ...next.d2.slots, [k]: { ...next.d2.slots[k], ...(v.adjust ? { adjust: v.adjust } : {}), ...(v.fit ? { fit: v.fit } : {}) } };
        }
      }
    }
    db.mockups[i] = { ...normalizeMockup(next), thumb: cur.thumb, updatedAt: Date.now() };
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

// ---- The picture / video on a device's screen (or in a 2D mockup's slot) --------
// ?item=<device id> picks the device (default: the first one); a 2D mockup
// takes ?slot=<name> (avatar, banner, media-0 …). A replaced file is removed
// once nothing in the scene shows it any more.
const SLOT = /^[a-z][a-z0-9-]{0,30}$/;
const filesIn = (scene) => [...scene.items.map((x) => x.content?.file), ...Object.values(scene.d2?.slots || {}).map((x) => x?.file)].filter(Boolean);
async function setContent(id, { item: itemId, slot }, write) {
  const db = await readDB();
  const m = db.mockups.find((x) => x.id === id);
  if (!m) return null;
  const scene = normalizeMockup(m);
  if (slot && (scene.kind !== '2d' || !SLOT.test(slot))) return null;
  const target = slot ? null : itemId ? scene.items.find((it) => it.id === itemId) : scene.items[0];
  if (!slot && !target) return null;
  const content = await write(mockupDir(id));
  let old = null;
  const updated = await mutateDB((d) => {
    const i = d.mockups.findIndex((y) => y.id === id);
    if (i === -1) return null;
    const cur = normalizeMockup(d.mockups[i]);
    if (slot) {
      old = cur.d2.slots[slot]?.file || null;
      const slots = { ...cur.d2.slots };
      if (content) slots[slot] = { ...content, adjust: { scale: 1, x: 0, y: 0 } }; else delete slots[slot];
      cur.d2 = { ...cur.d2, slots };
    } else {
      const it = cur.items.find((x) => x.id === target.id);
      if (!it) return null;
      old = it.content?.file || null;
      it.content = content;
    }
    if (filesIn(cur).includes(old)) old = null;
    d.mockups[i] = { ...normalizeMockup(cur), thumb: cur.thumb, updatedAt: Date.now() };
    return d.mockups[i];
  });
  if (old && old !== content?.file) await safeRm(path.join(mockupDir(id), path.basename(old)), { force: true }).catch(() => {});
  return updated;
}
const itemOf = (req) => ({
  item: typeof req.query.item === 'string' ? req.query.item.slice(0, 40) : null,
  slot: typeof req.query.slot === 'string' ? req.query.slot.slice(0, 40) : null,
});

router.post('/api/mockups/:id/content', upload.single('file'), async (req, res) => {
  const f = req.file;
  const kind = f && kindOf(f.originalname, f.mimetype);
  if (!kind) return res.status(400).json({ error: 'unsupported', message: 'Choose an image or a video.' });
  const m = await setContent(req.params.id, itemOf(req), async (dir) => ({
    file: await moveInto(dir, f.path, `content-${nanoid(6)}${extOf(f.originalname) || (kind === 'video' ? '.mp4' : '.png')}`),
    kind, name: str(f.originalname, 200),
  }));
  if (!m) return res.status(404).json({ error: 'not_found' });
  res.json({ mockup: normalizeMockup(m) });
});

router.delete('/api/mockups/:id/content', async (req, res) => {
  const m = await setContent(req.params.id, itemOf(req), async () => null);
  if (!m) return res.status(404).json({ error: 'not_found' });
  res.json({ mockup: normalizeMockup(m) });
});

// Something from the library onto the screen — named by id, never by path:
// { kind: 'plan', planId, blockId, itemId } images / videos / storyboard frames of a plan,
// { kind: 'plan', planId, itemId: '@avatar' | '@banner' } its profile picture / banner,
// { kind: 'project', projectId, itemId? } a project's video / image, or one of its frames, moments or assets,
// { kind: 'inbox', itemId } a shared file.
function findSource(db, s) {
  if (s?.kind === 'plan') {
    const plan = db.plans.find((p) => p.id === s.planId);
    // The plan's own profile picture / banner (no block).
    if (plan && (s.itemId === '@avatar' || s.itemId === '@banner')) {
      const rel = s.itemId === '@avatar' ? plan.avatar : plan.banner;
      return rel ? { abs: path.join(DATA_DIR, 'plan', plan.id, rel), name: `${plan.name || 'Plan'} · ${s.itemId === '@avatar' ? 'profile picture' : 'banner'}` } : null;
    }
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
  const there = src && !src.abs.includes('..') && fs.existsSync(src.abs);
  // A file without a telling extension (e.g. an older plan profile picture, `.img`) is sniffed.
  let ext = there ? extOf(src.abs) : '';
  if (there && !kindOf(src.abs)) ext = await sniffImageExt(src.abs);
  const kind = there && kindOf(`x${ext}`);
  if (!kind) {
    return res.status(400).json({ error: 'not_found', message: 'That picture or video is no longer there.' });
  }
  const m = await setContent(req.params.id, itemOf(req), async (dir) => {
    const file = `content-${nanoid(6)}${ext}`;
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
    for (const k of ['name', 'screenMesh', 'screenTurn', 'screenFlip', 'hinge']) if (k in req.body) next[k] = req.body[k];
    db.mockupModels[i] = { ...normalizeMockupModel(next), file: cur.file, format: cur.format, size: cur.size };
    return db.mockupModels[i];
  });
  if (!updated) return res.status(404).json({ error: 'not_found' });
  res.json({ model: updated });
});

// ---- Your own HDRIs (the light and reflections of a real place) --------------------
// .hdr / .exr (true HDR) or an equirectangular .jpg / .png / .webp; a small
// preview (made in the browser) comes separately.
router.post('/api/mockup-hdris', upload.single('hdri'), async (req, res) => {
  const f = req.file;
  const format = f && HDRI_EXT[extOf(f.originalname).toLowerCase()];
  if (!format) {
    if (f) await safeRm(f.path, { force: true }).catch(() => {});
    return res.status(400).json({ error: 'unsupported', message: 'Choose an .hdr or .exr file, or a panorama (.jpg / .png / .webp, 2:1).' });
  }
  const id = nanoid(10);
  const file = await moveInto(hdriDir(id), f.path, `env.${format}`);
  const hdri = normalizeMockupHdri({
    id, file, format, size: f.size, createdAt: Date.now(),
    name: str(req.body?.name, 120).trim() || path.basename(f.originalname, path.extname(f.originalname)),
  });
  await mutateDB((db) => { db.mockupHdris.push(hdri); });
  res.status(201).json({ hdri });
});

router.post('/api/mockup-hdris/:id/thumb', upload.single('thumb'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'thumb_required' });
  const db = await readDB();
  const h = db.mockupHdris.find((x) => x.id === req.params.id);
  if (!h) { await safeRm(req.file.path, { force: true }).catch(() => {}); return res.status(404).json({ error: 'not_found' }); }
  const stored = await replaceImage(hdriDir(h.id), req.file.path, 'thumb', req.file.originalname, h.thumb, '.webp');
  const updated = await mutateDB((d) => { const x = d.mockupHdris.find((y) => y.id === h.id); if (x) x.thumb = stored; return x; });
  res.json({ hdri: normalizeMockupHdri(updated) });
});

router.patch('/api/mockup-hdris/:id', async (req, res) => {
  const updated = await mutateDB((db) => {
    const x = db.mockupHdris.find((y) => y.id === req.params.id);
    if (!x) return null;
    if ('name' in (req.body || {})) x.name = str(req.body.name, 120).trim() || x.name;
    return x;
  });
  if (!updated) return res.status(404).json({ error: 'not_found' });
  res.json({ hdri: normalizeMockupHdri(updated) });
});

router.delete('/api/mockup-hdris/:id', async (req, res) => {
  const trashId = nanoid(10);
  const h = await mutateDB((db) => {
    const i = db.mockupHdris.findIndex((x) => x.id === req.params.id);
    if (i === -1) return null;
    const [gone] = db.mockupHdris.splice(i, 1);
    db.trash.unshift({ trashId, kind: 'mockupHdri', deletedAt: Date.now(), data: gone });
    return gone;
  });
  if (!h) return res.status(404).json({ error: 'not_found' });
  await moveToTrash(hdriDir(h.id), path.join(TRASH_DIR, trashId));
  res.json({ ok: true, trashId });
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
