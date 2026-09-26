// Inbox — whatever you share from your phone (share sheet, iOS Shortcut) or
// drop in here waits to be sorted into the library or a plan.
import fs from 'node:fs';
import path from 'node:path';
import { nanoid } from 'nanoid';
import { DATA_DIR, TRASH_DIR } from '../config.js';
import { readDB, mutateDB } from '../db.js';
import { moveInto, moveFile, safeRm, moveToTrash, extOf } from '../files.js';
import { upload } from '../upload.js';
import { str, BLOCK_TITLES } from '../schema.js';
import { createRouter } from '../http.js';
import { parseVideoLink } from '../videoLinks.js';

const router = createRouter();
export default router;

export const inboxDir = (id) => path.join(DATA_DIR, 'inbox', id);
const URL_IN_TEXT = /\bhttps?:\/\/[^\s<>"']+/i;
const IMAGE_EXT = /\.(png|jpe?g|gif|webp|avif|svg|heic|heif)$/i;
const PDF_EXT = /\.pdf$/i;

const httpUrl = (raw) => {
  try { const u = new URL(String(raw || '').trim()); return /^https?:$/.test(u.protocol) ? u.href : ''; } catch { return ''; }
};

// One shared thing → inbox items: one per file, or one link / note.
// Android puts a shared page's address into `text`, so a link is also
// looked for there.
async function addShared(req, via) {
  const files = (req.files || []).slice(0, 50);
  const title = str(req.body.title, 300).trim();
  let text = str(req.body.text, 20000).trim();
  let url = httpUrl(req.body.url);
  if (!url) {
    const m = text.match(URL_IN_TEXT);
    if (m) {
      url = httpUrl(m[0].replace(/[).,;:!?'"]+$/, ''));
      if (url) text = text.replace(m[0], ' ').replace(/[ \t]{2,}/g, ' ').trim();
    }
  }
  const now = Date.now();
  const items = [];
  for (const [i, f] of files.entries()) {
    const id = nanoid(10);
    const stored = await moveInto(inboxDir(id), f.path, `${nanoid(8)}${extOf(f.originalname) || ''}`);
    items.push({
      id, kind: 'file', via, createdAt: now + i, file: stored, name: str(f.originalname, 200), size: f.size,
      mime: str(f.mimetype, 100), title, text, url,
    });
  }
  if (!files.length && url) {
    const video = parseVideoLink(url);
    items.push({ id: nanoid(10), kind: 'link', via, createdAt: now, url, title, text, provider: video?.provider || null });
  } else if (!files.length && (text || title)) {
    items.push({ id: nanoid(10), kind: 'text', via, createdAt: now, title, text });
  }
  if (items.length) await mutateDB((db) => { db.inbox.unshift(...items); }); // newest first, a share's files in order
  return items;
}

router.get('/api/inbox', async (_req, res) => {
  const db = await readDB();
  res.json({ items: db.inbox });
});

router.post('/api/inbox', upload.array('files', 50), async (req, res) => {
  const via = req.body.via === 'shortcut' ? 'shortcut' : 'app';
  const items = await addShared(req, via);
  if (!items.length) return res.status(400).json({ error: 'empty', message: 'Nothing to add — share a file, a link or some text.' });
  res.status(201).json({ items });
});

// The PWA share target ("Share → Confinium"): the phone opens this as a page
// (a form POST, see csrfGuard), so it answers with a redirect to the Inbox.
router.post('/api/inbox/share', upload.array('files', 50), async (req, res) => {
  let n = 0;
  try { n = (await addShared(req, 'share')).length; } catch (err) {
    console.error('  share to inbox failed:', err);
    return res.redirect(303, '/inbox?shared=error');
  }
  res.redirect(303, `/inbox?shared=${n}`);
});

// Delete: to the Trash — or for good with ?used=1 (it now lives elsewhere).
router.delete('/api/inbox/:id', async (req, res) => {
  const used = req.query.used === '1';
  const trashId = nanoid(10);
  const item = await mutateDB((db) => {
    const i = db.inbox.findIndex((x) => x.id === req.params.id);
    if (i === -1) return null;
    const [it] = db.inbox.splice(i, 1);
    if (!used) db.trash.unshift({ trashId, kind: 'inbox', deletedAt: Date.now(), data: it });
    return it;
  });
  if (!item) return res.status(404).json({ error: 'not_found' });
  if (used) await safeRm(inboxDir(item.id), { recursive: true, force: true }).catch(() => {});
  else await moveToTrash(inboxDir(item.id), path.join(TRASH_DIR, trashId));
  res.json({ ok: true, trashId: used ? null : trashId });
});

// Put an item into a plan: images → its first moodboard, PDFs → a PDF block,
// other files → a files block, links → a links block, notes → a text block
// (each made when the plan has none). The item leaves the Inbox.
router.post('/api/inbox/:id/to-plan', async (req, res) => {
  const db = await readDB();
  const item = db.inbox.find((x) => x.id === req.params.id);
  const plan = db.plans.find((p) => p.id === req.body.planId);
  if (!item || !plan) return res.status(404).json({ error: 'not_found' });
  const isFile = item.kind === 'file';
  const type = !isFile ? (item.kind === 'link' ? 'links' : 'text')
    : IMAGE_EXT.test(item.file) ? 'moodboard'
      : PDF_EXT.test(item.file) && plan.blocks.some((b) => b.type === 'pdf') ? 'pdf' : 'files';
  const existing = plan.blocks.find((b) => b.type === type);
  const blockId = existing?.id || nanoid(8);
  const fid = nanoid(8);
  let rel = null;
  const from = isFile ? path.join(inboxDir(item.id), item.file) : null;
  if (isFile && !fs.existsSync(from)) return res.status(410).json({ error: 'file_missing', message: 'The shared file is no longer on disk.' });
  if (isFile) {
    const name = `${fid}${extOf(item.file) || ''}`;
    await moveFile(from, path.join(DATA_DIR, 'plan', plan.id, 'blocks', blockId, name));
    rel = `blocks/${blockId}/${name}`;
  }
  const updated = await mutateDB((d) => {
    const p = d.plans.find((x) => x.id === plan.id);
    const i = d.inbox.findIndex((x) => x.id === item.id);
    if (!p || i === -1) return null;
    let b = p.blocks.find((x) => x.id === blockId);
    if (!b) {
      b = { id: blockId, type, title: BLOCK_TITLES[type] };
      if (type === 'moodboard') Object.assign(b, { collapsed: false, images: [] });
      else if (type === 'links') b.items = [];
      else if (type === 'text') b.content = '';
      else b.files = [];
      p.blocks.push(b);
    }
    if (type === 'moodboard') b.images = [...(b.images || []), { id: fid, file: rel }];
    else if (type === 'files') b.files = [...(b.files || []), { id: fid, file: rel, name: item.name, size: item.size, title: item.title || '', example: null }];
    else if (type === 'pdf') b.files = [...(b.files || []), { id: fid, file: rel, name: item.name, size: item.size }];
    else if (type === 'links') b.items = [...(b.items || []), { id: fid, url: item.url, title: item.title || '' }];
    else {
      const note = [item.title, item.text].filter(Boolean).join('\n');
      b.content = [b.content, note].filter(Boolean).join('\n\n');
    }
    d.inbox.splice(i, 1);
    return p;
  });
  if (!updated) {
    // The plan or the item went away meanwhile: put the file back.
    if (isFile) await moveFile(path.join(DATA_DIR, 'plan', plan.id, rel), from, { ignoreMissing: true }).catch(() => {});
    return res.status(404).json({ error: 'not_found' });
  }
  await safeRm(inboxDir(item.id), { recursive: true, force: true }).catch(() => {});
  res.json({ plan: updated, blockId, blockType: type });
});
