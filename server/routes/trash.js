// Trash (soft delete) — list, restore, permanently delete, empty.
import path from 'node:path';
import { DATA_DIR, TRASH_DIR, TRASH_TTL_DAYS, TYPE_LABEL } from '../config.js';
import { readDB, mutateDB } from '../db.js';
import { safeRm, restoreFromTrash, moveRelPaths } from '../files.js';
import { BLOCK_TITLES } from '../schema.js';
import { restorePictures } from '../pictures.js';
import { createRouter } from '../http.js';
import { softDir } from './software.js';
import { inboxDir } from './inbox.js';
import { mockupDir, modelDir, hdriDir } from './mockups.js';
import { clientDir } from './clients.js';
import { noteDir } from './notes.js';
import { contentDir } from './content.js';
import { achievementDir } from './achievements.js';

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
            : t.kind === 'orphans' ? firstImage(t.data.rels)
              : t.kind === 'inbox' ? firstImage([t.data.file])
                : t.kind === 'mockup' ? t.data.thumb
                  : t.kind === 'client' ? t.data.logo
                    : t.kind === 'note' ? t.data.images?.[0]?.file
                      : t.kind === 'noteImage' ? t.data.image?.file
                        : t.kind === 'content' ? t.data.media?.find((m) => m.kind === 'image')?.file
                          : t.kind === 'contentMedia' ? (t.data.media?.kind === 'image' ? t.data.media.file : null)
                            : t.kind === 'achievement' ? (t.data.iconImage || t.data.sticker)
                              : t.kind === 'pictures' ? t.data.items?.[0]?.rel : null;
  return rel ? `/data/trash/${t.trashId}/${rel}` : null;
};

function describe(t) {
  switch (t.kind) {
    case 'plan': return { title: t.data.name || 'Untitled project', subtitle: 'Project' };
    case 'client': return { title: t.data.name || 'Client', subtitle: 'Client' };
    case 'note': return { title: t.data.title || 'Untitled note', subtitle: 'Note' };
    case 'noteImage': return { title: t.data.image?.name || 'Picture', subtitle: `Picture · ${t.data.noteTitle || 'Note'}` };
    case 'content': return { title: t.data.title || 'Untitled post', subtitle: 'Content' };
    case 'contentMedia': return { title: t.data.media?.name || 'Media', subtitle: `${t.data.media?.kind === 'video' ? 'Video' : 'Picture'} · ${t.data.contentTitle || 'Content'}` };
    case 'achievement': return { title: t.data.title || 'Achievement', subtitle: `Achievement · ${t.data.group || ''}` };
    case 'contentSnippet': return { title: t.data.name || String(t.data.text || '').slice(0, 80) || 'Snippet', subtitle: `Content library · ${{ hook: 'Hook', hashtags: 'Hashtags', cta: 'Call to action' }[t.data.kind] || 'Snippet'}` };
    case 'invoice': return { title: t.data.invoice?.number ? `Invoice ${t.data.invoice.number}` : (t.data.invoice?.name || 'Invoice'), subtitle: `Invoice · ${t.data.clientName || 'Client'}` };
    case 'gallery': return { title: t.data.name || 'Gallery', subtitle: `Gallery · ${TYPE_LABEL[t.data.type] || t.data.type}` };
    case 'software': return { title: t.data.name || 'Software', subtitle: 'Software' };
    case 'file': return { title: t.data.item?.title || t.data.item?.name || 'File', subtitle: 'File' };
    case 'block': return { title: t.data.block?.title || BLOCK_TITLES[t.data.block?.type] || 'Block', subtitle: `Block · ${t.data.planName || 'Project'}` };
    case 'mockup': return { title: t.data.name || 'Mockup', subtitle: 'Mockup' };
    case 'mockupModel': return { title: t.data.name || '3D model', subtitle: '3D model (mockups)' };
    case 'mockupHdri': return { title: t.data.name || 'HDRI', subtitle: 'HDRI (mockup light)' };
    case 'inbox': return { title: t.data.title || t.data.name || t.data.url || String(t.data.text || '').slice(0, 80) || 'Shared item', subtitle: 'Inbox' };
    case 'timeEntry': return { title: `${t.data.date} · ${t.data.start}–${t.data.end}${t.data.activity ? ` · ${t.data.activity}` : ''}`, subtitle: `Time entry${t.data.label ? ` · ${t.data.label}` : ''}` };
    case 'pictures': return { title: `${t.data.items?.length || 0} picture${t.data.items?.length === 1 ? '' : 's'} before they were made smaller`, subtitle: `Originals · ${fmtBytes(t.data.before || 0)} → ${fmtBytes(t.data.after || 0)}` };
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
  const restored = await mutateDB(async (db) => {
    const idx = db.trash.findIndex((t) => t.trashId === trashId);
    if (idx === -1) return null;
    const entry = db.trash[idx];
    const { data } = entry;
    if (entry.kind === 'pictures') { // pictures made smaller: the originals back, and their names
      await restorePictures(db, entry);
      rels = { base: DATA_DIR, list: [] };
    } else if (entry.kind === 'project') {
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
    } else if (entry.kind === 'mockup') {
      if (!Array.isArray(db.mockups)) db.mockups = [];
      db.mockups.push(data);
      move = { from, to: mockupDir(data.id) };
    } else if (entry.kind === 'mockupModel') {
      if (!Array.isArray(db.mockupModels)) db.mockupModels = [];
      db.mockupModels.push(data);
      move = { from, to: modelDir(data.id) };
    } else if (entry.kind === 'mockupHdri') {
      if (!Array.isArray(db.mockupHdris)) db.mockupHdris = [];
      db.mockupHdris.push(data);
      move = { from, to: hdriDir(data.id) };
    } else if (entry.kind === 'inbox') {
      if (!Array.isArray(db.inbox)) db.inbox = [];
      db.inbox.unshift(data);
      move = { from, to: inboxDir(data.id) };
    } else if (entry.kind === 'timeEntry') {
      if (!Array.isArray(db.timeEntries)) db.timeEntries = [];
      const { label: _label, ...e } = data;
      if (!db.timeEntries.some((x) => x.id === e.id)) db.timeEntries.push(e);
    } else if (entry.kind === 'client') {
      if (!Array.isArray(db.clients)) db.clients = [];
      if (db.clients.some((c) => c.name.trim().toLowerCase() === data.name.trim().toLowerCase() && c.id !== data.id)) { gone = 'name'; return null; }
      if (!db.clients.some((c) => c.id === data.id)) db.clients.push(data);
      // Its projects and time again — those that haven't been given to someone else meanwhile.
      for (const p of db.plans) if ((entry.planIds || []).includes(p.id) && !p.clientId) { p.clientId = data.id; p.client = data.name; }
      for (const e of db.timeEntries || []) {
        if (!(entry.entryIds || []).includes(e.id) || e.clientId || e.planId) continue;
        e.clientId = data.id;
        if (e.project === data.name) e.project = '';
      }
      move = { from, to: clientDir(data.id) };
    } else if (entry.kind === 'note') {
      if (!Array.isArray(db.notes)) db.notes = [];
      if (!db.notes.some((n) => n.id === data.id)) db.notes.push(data);
      move = { from, to: noteDir(data.id) };
    } else if (entry.kind === 'noteImage') {
      const n = (db.notes || []).find((x) => x.id === data.noteId);
      if (!n) { gone = true; return null; }
      if (!n.images.some((i) => i.id === data.image.id)) n.images.splice(Math.min(data.index ?? n.images.length, n.images.length), 0, data.image);
      rels = { base: noteDir(n.id), list: data.rels };
    } else if (entry.kind === 'content') {
      if (!Array.isArray(db.content)) db.content = [];
      if (!db.content.some((c) => c.id === data.id)) db.content.push(data);
      move = { from, to: contentDir(data.id) };
    } else if (entry.kind === 'contentMedia') {
      const c = (db.content || []).find((x) => x.id === data.contentId);
      if (!c) { gone = true; return null; }
      if (!c.media.some((m) => m.id === data.media.id)) c.media.splice(Math.min(data.index ?? c.media.length, c.media.length), 0, data.media);
      if (data.wasCover && !c.coverId) c.coverId = data.media.id;
      rels = { base: contentDir(c.id), list: data.rels };
    } else if (entry.kind === 'achievement') {
      if (!Array.isArray(db.achievements)) db.achievements = [];
      if (!db.achievements.some((a) => a.id === data.id)) db.achievements.push(data);
      move = { from, to: achievementDir(data.id) };
    } else if (entry.kind === 'contentSnippet') {
      if (!Array.isArray(db.contentLibrary)) db.contentLibrary = [];
      if (!db.contentLibrary.some((x) => x.id === data.id)) db.contentLibrary.push(data);
    } else if (entry.kind === 'invoice') {
      const c = (db.clients || []).find((x) => x.id === data.clientId);
      if (!c) { gone = true; return null; }
      if (!c.invoices.some((i) => i.id === data.invoice.id)) c.invoices.unshift(data.invoice);
      rels = { base: clientDir(c.id), list: data.rels };
    } else if (entry.kind === 'orphans') {
      rels = { base: DATA_DIR, list: data.rels };
    }
    db.trash.splice(idx, 1);
    return entry;
  });
  if (gone === 'name') return res.status(409).json({ error: 'name_taken', message: 'You have another client with that name now — rename it first.' });
  if (gone) return res.status(409).json({ error: 'target_gone', message: 'The project, block, client or note this item belonged to no longer exists.' });
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
