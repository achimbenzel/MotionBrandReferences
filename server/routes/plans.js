// Plans (Work mode) — a header + timeframe, plus a list of content blocks.
import fs from 'node:fs';
import path from 'node:path';
import { nanoid } from 'nanoid';
import { DATA_DIR, TRASH_DIR } from '../config.js';
import { readDB, mutateDB } from '../db.js';
import { moveInto, replaceImage, safeRm, moveToTrash, moveRelPaths, extOf } from '../files.js';
import { upload } from '../upload.js';
import { BLOCK_TYPES, BLOCK_TITLES, str } from '../schema.js';
import { createRouter } from '../http.js';

const router = createRouter();
export default router;

const planDir = (planId) => path.join(DATA_DIR, 'plan', planId);
const blockDir = (planId, blockId) => path.join(planDir(planId), 'blocks', blockId);
const findBlock = (plan, blockId) => (plan && Array.isArray(plan.blocks)) ? plan.blocks.find((b) => b.id === blockId) : null;

const PLAN_EDITABLE = ['name', 'start', 'end', 'milestones', 'bannerGradient', 'avatarEmoji'];

router.get('/api/plans', async (_req, res) => {
  const db = await readDB();
  const plans = [...db.plans].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  res.json({ plans });
});

router.get('/api/plans/:id', async (req, res) => {
  const db = await readDB();
  const plan = db.plans.find((p) => p.id === req.params.id);
  if (!plan) return res.status(404).json({ error: 'not_found' });
  res.json({ plan });
});

router.post('/api/plans', async (req, res) => {
  const plan = {
    id: nanoid(10),
    name: str(req.body.name || 'Untitled plan', 200).trim() || 'Untitled plan',
    start: '',
    end: '',
    banner: null,
    bannerGradient: null,
    avatar: null,
    avatarEmoji: null,
    milestones: [],
    blocks: [], // a new plan is empty — blocks are added by the user
    createdAt: Date.now(),
  };
  await mutateDB((db) => { db.plans.push(plan); });
  res.status(201).json({ plan });
});

router.patch('/api/plans/:id', async (req, res) => {
  const updated = await mutateDB((db) => {
    const plan = db.plans.find((p) => p.id === req.params.id);
    if (!plan) return null;
    for (const k of PLAN_EDITABLE) {
      if (!(k in req.body)) continue;
      if (k === 'milestones') { if (Array.isArray(req.body.milestones)) plan.milestones = req.body.milestones; }
      else plan[k] = req.body[k];
    }
    return plan;
  });
  if (!updated) return res.status(404).json({ error: 'not_found' });
  res.json({ plan: updated });
});

// Banner / avatar (Notion-style header images)
for (const kind of ['banner', 'avatar']) {
  router.post(`/api/plans/:id/${kind}`, upload.single(kind), async (req, res) => {
    const db = await readDB();
    const plan = db.plans.find((p) => p.id === req.params.id);
    if (!plan) return res.status(404).json({ error: 'not_found' });
    if (!req.file) return res.status(400).json({ error: 'file_required' });
    const stored = await replaceImage(planDir(plan.id), req.file.path, kind, req.file.originalname, plan[kind], '.png');
    const updated = await mutateDB((d) => {
      const p = d.plans.find((x) => x.id === plan.id);
      if (!p) return null;
      p[kind] = stored;
      if (kind === 'banner') p.bannerGradient = null;
      if (kind === 'avatar') p.avatarEmoji = null;
      return p;
    });
    if (!updated) return res.status(404).json({ error: 'not_found' });
    res.json({ plan: updated });
  });
  router.delete(`/api/plans/:id/${kind}`, async (req, res) => {
    let file = null;
    const updated = await mutateDB((db) => {
      const p = db.plans.find((x) => x.id === req.params.id);
      if (!p) return null;
      file = p[kind]; p[kind] = null;
      if (kind === 'banner') p.bannerGradient = null;
      if (kind === 'avatar') p.avatarEmoji = null;
      return p;
    });
    if (!updated) return res.status(404).json({ error: 'not_found' });
    if (file) await safeRm(path.join(planDir(req.params.id), path.basename(file)), { force: true }).catch(() => {});
    res.json({ plan: updated });
  });
}

// --- Content blocks ---
router.post('/api/plans/:id/blocks', async (req, res) => {
  const type = req.body.type;
  if (!BLOCK_TYPES.has(type)) return res.status(400).json({ error: 'invalid_block_type' });
  const base = { id: nanoid(8), type, title: BLOCK_TITLES[type] };
  const block = type === 'moodboard' ? { ...base, collapsed: false, images: [] }
    : type === 'text' ? { ...base, content: '' }
      : (type === 'todos' || type === 'links' || type === 'refs' || type === 'palette') ? { ...base, items: [] }
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
router.patch('/api/plans/:id/blocks/:blockId', async (req, res) => {
  const updated = await mutateDB((db) => {
    const p = db.plans.find((x) => x.id === req.params.id); if (!p) return null;
    const b = findBlock(p, req.params.blockId); if (!b) return null;
    for (const k of BLOCK_EDITABLE) {
      if (!(k in req.body)) continue;
      const v = req.body[k];
      if (k === 'title' || k === 'content') b[k] = str(v, k === 'content' ? 200000 : 400);
      else if (k === 'collapsed') b[k] = !!v;
      else if (Array.isArray(v)) b[k] = v; // items / columns / rows
    }
    return p;
  });
  if (!updated) return res.status(404).json({ error: 'not_found' });
  res.json({ plan: updated });
});

router.post('/api/plans/:id/blocks/:blockId/move', async (req, res) => {
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

// Every file a block owns, relative to its plan folder: its own blocks/<id>/
// folder, a legacy moodboard/<id>/ folder, and any files it references
// elsewhere (the very first moodboards stored images directly in moodboard/).
function blockPaths(block) {
  const refs = [
    ...(block.images || []).map((i) => i?.file),
    ...(block.files || []).flatMap((f) => [f?.file, f?.example]),
  ].filter((r) => typeof r === 'string' && r && !r.includes('..'));
  return [...new Set([`blocks/${block.id}`, `moodboard/${block.id}`, ...refs])];
}

// Delete a block → Trash (with its files), restorable in place.
router.delete('/api/plans/:id/blocks/:blockId', async (req, res) => {
  const trashId = nanoid(10);
  let entry = null;
  const updated = await mutateDB((db) => {
    const p = db.plans.find((x) => x.id === req.params.id); if (!p) return null;
    const i = p.blocks.findIndex((b) => b.id === req.params.blockId); if (i === -1) return null;
    const [block] = p.blocks.splice(i, 1);
    const rels = blockPaths(block).filter((r) => fs.existsSync(path.join(planDir(p.id), r)));
    entry = { trashId, kind: 'block', deletedAt: Date.now(), data: { planId: p.id, planName: p.name, index: i, block, rels } };
    db.trash.unshift(entry);
    return p;
  });
  if (!updated) return res.status(404).json({ error: 'not_found' });
  await moveRelPaths(planDir(req.params.id), path.join(TRASH_DIR, trashId), entry.data.rels);
  res.json({ plan: updated, trashId });
});

// Add files to a moodboard (images) or a files / pdf block.
router.post('/api/plans/:id/blocks/:blockId/files', upload.array('files', 50), async (req, res) => {
  const db = await readDB();
  const plan = db.plans.find((p) => p.id === req.params.id);
  const b0 = findBlock(plan, req.params.blockId);
  if (!plan || !b0 || (b0.type !== 'moodboard' && b0.type !== 'files' && b0.type !== 'pdf')) return res.status(404).json({ error: 'not_found' });
  const dir = blockDir(plan.id, b0.id);
  const added = [];
  for (const f of (req.files || [])) {
    const fid = nanoid(8);
    const stored = await moveInto(dir, f.path, `${fid}${extOf(f.originalname) || ''}`);
    added.push({ id: fid, file: `blocks/${b0.id}/${stored}`, name: f.originalname, size: f.size });
  }
  const updated = await mutateDB((d) => {
    const p = d.plans.find((x) => x.id === plan.id);
    const b = findBlock(p, b0.id);
    if (!b) return null;
    if (b.type === 'moodboard') b.images = [...(b.images || []), ...added.map((a) => ({ id: a.id, file: a.file }))];
    else b.files = [...(b.files || []), ...added];
    return p;
  });
  if (!updated) return res.status(404).json({ error: 'not_found' });
  res.status(201).json({ plan: updated });
});

// Add one file to a files block: the file itself, an optional example image
// (shown as a square preview before it) and an optional title.
router.post('/api/plans/:id/blocks/:blockId/file', upload.fields([{ name: 'file', maxCount: 1 }, { name: 'example', maxCount: 1 }]), async (req, res) => {
  const db = await readDB();
  const plan = db.plans.find((p) => p.id === req.params.id);
  const b0 = findBlock(plan, req.params.blockId);
  const file = req.files?.file?.[0];
  const example = req.files?.example?.[0];
  if (!plan || !b0 || b0.type !== 'files') return res.status(404).json({ error: 'not_found' });
  if (!file) return res.status(400).json({ error: 'file_required' });
  const dir = blockDir(plan.id, b0.id);
  const fid = nanoid(8);
  const storedFile = await moveInto(dir, file.path, `${fid}${extOf(file.originalname) || ''}`);
  let exampleRel = null;
  if (example) {
    const storedEx = await moveInto(dir, example.path, `${fid}_ex${extOf(example.originalname) || '.png'}`);
    exampleRel = `blocks/${b0.id}/${storedEx}`;
  }
  const item = { id: fid, file: `blocks/${b0.id}/${storedFile}`, name: file.originalname, size: file.size, title: str(req.body.title, 200).trim(), example: exampleRel };
  const updated = await mutateDB((d) => {
    const p = d.plans.find((x) => x.id === plan.id);
    const b = findBlock(p, b0.id);
    if (!b) return null;
    b.files = [...(b.files || []), item];
    return p;
  });
  if (!updated) return res.status(404).json({ error: 'not_found' });
  res.status(201).json({ plan: updated });
});

router.delete('/api/plans/:id/blocks/:blockId/files/:fileId', async (req, res) => {
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
    await moveRelPaths(planDir(planId), path.join(TRASH_DIR, trashId), rels);
    await mutateDB((db) => { db.trash.unshift({ trashId, kind: 'file', deletedAt: Date.now(), data: { planId, blockId: req.params.blockId, item: removed, rels } }); });
    return res.json({ plan: updated, trashId });
  }
  if (removed?.file) await safeRm(path.join(planDir(planId), removed.file), { force: true }).catch(() => {});
  res.json({ plan: updated });
});

router.delete('/api/plans/:id', async (req, res) => {
  const trashId = nanoid(10);
  let move = null;
  const ok = await mutateDB((db) => {
    const idx = db.plans.findIndex((p) => p.id === req.params.id);
    if (idx === -1) return false;
    const plan = db.plans[idx];
    db.plans.splice(idx, 1);
    db.trash.unshift({ trashId, kind: 'plan', deletedAt: Date.now(), data: plan });
    move = { from: planDir(plan.id), to: path.join(TRASH_DIR, trashId) };
    return true;
  });
  if (!ok) return res.status(404).json({ error: 'not_found' });
  if (move) await moveToTrash(move.from, move.to);
  res.json({ ok: true, trashId });
});
