// Software — a topic per app (After Effects, …) with a plugin database, your
// own scripts (files), expressions and tutorial links.
import path from 'node:path';
import { nanoid } from 'nanoid';
import { DATA_DIR, TRASH_DIR } from '../config.js';
import { readDB, mutateDB } from '../db.js';
import { replaceImage, safeRm, moveToTrash } from '../files.js';
import { upload } from '../upload.js';
import { str, normalizeSoftware, normalizePlugin, normalizeExprGroup, normalizeTut } from '../schema.js';
import { createRouter, HttpError } from '../http.js';

const router = createRouter();
export default router;

export const softDir = (id) => path.join(DATA_DIR, 'software', id);
const findSoft = (db, id) => (db.software || []).find((x) => x.id === id);
const rmSoftFile = (id, f) => safeRm(path.join(softDir(id), path.basename(f)), { force: true }).catch(() => {});

router.get('/api/software', async (_req, res) => {
  const db = await readDB();
  res.json({ software: (db.software || []).map(normalizeSoftware) });
});
router.get('/api/software/:id', async (req, res) => {
  const db = await readDB();
  const s = findSoft(db, req.params.id);
  if (!s) return res.status(404).json({ error: 'not_found' });
  res.json({ software: normalizeSoftware(s) });
});
router.post('/api/software', async (req, res) => {
  const s = { id: nanoid(10), name: str(req.body?.name, 120) || 'Untitled software', avatarEmoji: str(req.body?.avatarEmoji ?? req.body?.icon, 40), banner: null, bannerGradient: null, avatar: null, createdAt: Date.now(), plugins: [], expressionGroups: [], tutorials: [] };
  await mutateDB((db) => { db.software.push(s); });
  res.status(201).json({ software: s });
});

// Wholesale edit of the JSON parts. File fields (plugin installer/image, group
// image) are server-authoritative and preserved by id — only the upload/delete
// endpoints below change them, so a text edit can never clobber a file.
router.patch('/api/software/:id', async (req, res) => {
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
  for (const f of removedFiles) await rmSoftFile(req.params.id, f);
  res.json({ software: updated });
});

router.delete('/api/software/:id', async (req, res) => {
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

async function loadSoft(id) {
  const s = findSoft(await readDB(), id);
  if (!s) throw new HttpError(404, 'not_found');
  return s;
}

// Software banner / avatar images (like plans).
for (const kind of ['banner', 'avatar']) {
  router.post(`/api/software/:id/${kind}`, upload.single(kind), async (req, res) => {
    const s = await loadSoft(req.params.id);
    if (!req.file) return res.status(400).json({ error: 'file_required' });
    const stored = await replaceImage(softDir(s.id), req.file.path, kind, req.file.originalname, s[kind], '.png');
    const updated = await mutateDB((d) => {
      const ss = findSoft(d, s.id); if (!ss) return null;
      ss[kind] = stored; if (kind === 'banner') ss.bannerGradient = null; return ss;
    });
    if (!updated) return res.status(404).json({ error: 'not_found' });
    res.json({ software: updated });
  });
  router.delete(`/api/software/:id/${kind}`, async (req, res) => {
    let removed = null;
    const updated = await mutateDB((db) => { const s = findSoft(db, req.params.id); if (!s) return null; removed = s[kind]; s[kind] = null; return s; });
    if (!updated) return res.status(404).json({ error: 'not_found' });
    if (removed) await rmSoftFile(req.params.id, removed);
    res.json({ software: updated });
  });
}

// Plugin installer file + preview image (one each per plugin).
for (const [kind, prefix] of [['file', ''], ['image', 'img_']]) {
  router.post(`/api/software/:id/plugins/:pluginId/${kind}`, upload.single(kind), async (req, res) => {
    const s = await loadSoft(req.params.id);
    const p = (s.plugins || []).find((x) => x.id === req.params.pluginId);
    if (!p) return res.status(404).json({ error: 'not_found' });
    if (!req.file) return res.status(400).json({ error: 'file_required' });
    const stored = await replaceImage(softDir(s.id), req.file.path, `${prefix}${p.id}`, req.file.originalname, p[kind], '');
    const { size, originalname } = req.file;
    const updated = await mutateDB((d) => {
      const ss = findSoft(d, s.id);
      const pp = ss?.plugins.find((x) => x.id === p.id); if (!pp) return null;
      if (kind === 'file') { pp.file = stored; pp.fileName = originalname; pp.size = size; }
      else { pp.image = stored; pp.imageName = originalname; }
      return ss;
    });
    if (!updated) return res.status(404).json({ error: 'not_found' });
    res.json({ software: updated });
  });
  router.delete(`/api/software/:id/plugins/:pluginId/${kind}`, async (req, res) => {
    let removed = null;
    const updated = await mutateDB((db) => {
      const s = findSoft(db, req.params.id); if (!s) return null;
      const p = (s.plugins || []).find((x) => x.id === req.params.pluginId); if (!p) return null;
      removed = p[kind];
      if (kind === 'file') { p.file = null; p.fileName = null; p.size = 0; } else { p.image = null; p.imageName = null; }
      return s;
    });
    if (!updated) return res.status(404).json({ error: 'not_found' });
    if (removed) await rmSoftFile(req.params.id, removed);
    res.json({ software: updated });
  });
}

// Expression-group preview image.
router.post('/api/software/:id/groups/:groupId/image', upload.single('image'), async (req, res) => {
  const s = await loadSoft(req.params.id);
  const g = (s.expressionGroups || []).find((x) => x.id === req.params.groupId);
  if (!g) return res.status(404).json({ error: 'not_found' });
  if (!req.file) return res.status(400).json({ error: 'file_required' });
  const stored = await replaceImage(softDir(s.id), req.file.path, `grp_${g.id}`, req.file.originalname, g.image, '');
  const { originalname } = req.file;
  const updated = await mutateDB((d) => {
    const ss = findSoft(d, s.id);
    const gg = ss?.expressionGroups.find((x) => x.id === g.id); if (!gg) return null;
    gg.image = stored; gg.imageName = originalname; return ss;
  });
  if (!updated) return res.status(404).json({ error: 'not_found' });
  res.json({ software: updated });
});
router.delete('/api/software/:id/groups/:groupId/image', async (req, res) => {
  let removed = null;
  const updated = await mutateDB((db) => {
    const s = findSoft(db, req.params.id); if (!s) return null;
    const g = (s.expressionGroups || []).find((x) => x.id === req.params.groupId); if (!g) return null;
    removed = g.image; g.image = null; g.imageName = null; return s;
  });
  if (!updated) return res.status(404).json({ error: 'not_found' });
  if (removed) await rmSoftFile(req.params.id, removed);
  res.json({ software: updated });
});
