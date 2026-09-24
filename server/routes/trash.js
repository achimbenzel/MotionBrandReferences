// Trash (soft delete) — list, restore, permanently delete, empty.
import path from 'node:path';
import { DATA_DIR, TRASH_DIR, TRASH_TTL_DAYS, TYPE_LABEL } from '../config.js';
import { readDB, mutateDB } from '../db.js';
import { safeRm, restoreFromTrash, moveRelPaths } from '../files.js';
import { BLOCK_TITLES } from '../schema.js';
import { createRouter } from '../http.js';
import { softDir } from './software.js';

const router = createRouter();
export default router;

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|avif|svg)$/i;
const fmtBytes = (n) => {
  const u = ['B', 'KB', 'MB', 'GB']; let v = n || 0; let i = 0;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i += 1; }
  return `${v.toFixed(v < 10 && i > 0 ? 1 : 0)} ${u[i]}`;
};

export async function purgeExpiredTrash() {
  const cutoff = Date.now() - TRASH_TTL_DAYS * 86400000;
  const isExpired = (t) => (t.deletedAt || 0) < cutoff;
  if (!(await readDB()).trash.some(isExpired)) return; // nothing to do — don't rewrite db.json
  const expired = await mutateDB((d) => {
    const gone = d.trash.filter(isExpired);
    d.trash = d.trash.filter((t) => !isExpired(t));
    return gone;
  });
  for (const t of expired) await safeRm(path.join(TRASH_DIR, t.trashId), { recursive: true, force: true }).catch(() => {});
}

const trashThumb = (t) => {
  const firstImage = (rels) => (rels || []).find((r) => IMAGE_EXT.test(r)) || null;
  const rel = t.kind === 'project' ? t.data.thumb
    : t.kind === 'plan' ? (t.data.avatar || t.data.banner)
      : t.kind === 'software' ? (t.data.avatar || t.data.banner)
        : t.kind === 'file' ? (t.data.item?.example)
          : t.kind === 'block' ? ((t.data.block?.images || [])[0]?.file || (t.data.block?.files || []).find((f) => f.example)?.example || null)
            : t.kind === 'orphans' ? firstImage(t.data.rels) : null;
  return rel ? `/data/trash/${t.trashId}/${rel}` : null;
};

function describe(t) {
  switch (t.kind) {
    case 'plan': return { title: t.data.name || 'Untitled plan', subtitle: 'Plan' };
    case 'gallery': return { title: t.data.name || 'Gallery', subtitle: `Gallery · ${TYPE_LABEL[t.data.type] || t.data.type}` };
    case 'software': return { title: t.data.name || 'Software', subtitle: 'Software' };
    case 'file': return { title: t.data.item?.title || t.data.item?.name || 'File', subtitle: 'File' };
    case 'block': return { title: t.data.block?.title || BLOCK_TITLES[t.data.block?.type] || 'Block', subtitle: `Block · ${t.data.planName || 'Plan'}` };
    case 'orphans': return { title: `${t.data.count} unused file${t.data.count === 1 ? '' : 's'}`, subtitle: `Cleanup · ${fmtBytes(t.data.bytes)}` };
    default: return { title: t.data.title || 'Untitled', subtitle: TYPE_LABEL[t.data.type] || t.data.type };
  }
}

router.get('/api/trash', async (_req, res) => {
  await purgeExpiredTrash().catch(() => {});
  const db = await readDB();
  const items = db.trash.map((t) => ({ trashId: t.trashId, kind: t.kind, deletedAt: t.deletedAt, ...describe(t), thumb: trashThumb(t) }));
  res.json({ items, ttlDays: TRASH_TTL_DAYS });
});

router.post('/api/trash/:trashId/restore', async (req, res) => {
  const trashId = req.params.trashId;
  const from = path.join(TRASH_DIR, trashId);
  let move = null; let rels = null; let gone = false;
  const restored = await mutateDB((db) => {
    const idx = db.trash.findIndex((t) => t.trashId === trashId);
    if (idx === -1) return null;
    const entry = db.trash[idx];
    const { data } = entry;
    if (entry.kind === 'project') {
      db.projects.push(data);
      for (const gid of entry.galleryIds || []) {
        const g = db.galleries.find((x) => x.id === gid);
        if (g) { g.projectIds = g.projectIds || []; if (!g.projectIds.includes(data.id)) g.projectIds.push(data.id); }
      }
      move = { from, to: path.join(DATA_DIR, data.type, data.id) };
    } else if (entry.kind === 'plan') {
      db.plans.push(data);
      move = { from, to: path.join(DATA_DIR, 'plan', data.id) };
    } else if (entry.kind === 'gallery') {
      db.galleries.push(data);
    } else if (entry.kind === 'software') {
      db.software.push(data);
      move = { from, to: softDir(data.id) };
    } else if (entry.kind === 'file') {
      const p = db.plans.find((x) => x.id === data.planId);
      const b = p?.blocks?.find((x) => x.id === data.blockId);
      if (!b || (b.type !== 'files' && b.type !== 'pdf')) { gone = true; return null; } // its plan/block is gone — leave it in Trash
      b.files = [...(b.files || []), data.item];
      rels = { base: path.join(DATA_DIR, 'plan', data.planId), list: data.rels };
    } else if (entry.kind === 'block') {
      const p = db.plans.find((x) => x.id === data.planId);
      if (!p) { gone = true; return null; }
      if (!p.blocks.some((b) => b.id === data.block.id)) p.blocks.splice(Math.min(data.index ?? p.blocks.length, p.blocks.length), 0, data.block);
      rels = { base: path.join(DATA_DIR, 'plan', data.planId), list: data.rels };
    } else if (entry.kind === 'orphans') {
      rels = { base: DATA_DIR, list: data.rels };
    }
    db.trash.splice(idx, 1);
    return entry;
  });
  if (gone) return res.status(409).json({ error: 'target_gone', message: 'The plan or block this item belonged to no longer exists.' });
  if (!restored) return res.status(404).json({ error: 'not_found' });
  if (move) await restoreFromTrash(move.from, move.to);
  if (rels) {
    await moveRelPaths(from, rels.base, rels.list || []);
    await safeRm(from, { recursive: true, force: true }).catch(() => {});
  }
  res.json({ ok: true, kind: restored.kind, id: restored.data?.id || restored.data?.planId, type: restored.data?.type });
});

router.delete('/api/trash/:trashId', async (req, res) => {
  const ok = await mutateDB((db) => {
    const idx = db.trash.findIndex((t) => t.trashId === req.params.trashId);
    if (idx === -1) return false;
    db.trash.splice(idx, 1);
    return true;
  });
  if (!ok) return res.status(404).json({ error: 'not_found' });
  await safeRm(path.join(TRASH_DIR, req.params.trashId), { recursive: true, force: true }).catch(() => {});
  res.json({ ok: true });
});

router.delete('/api/trash', async (_req, res) => {
  const ids = await mutateDB((db) => { const list = db.trash.map((t) => t.trashId); db.trash = []; return list; });
  for (const tid of ids) await safeRm(path.join(TRASH_DIR, tid), { recursive: true, force: true }).catch(() => {});
  res.json({ ok: true, removed: ids.length });
});
