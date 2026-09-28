// Notes (Work mode) — general notes: a title, text and pictures.
import fsp from 'node:fs/promises';
import path from 'node:path';
import { nanoid } from 'nanoid';
import { DATA_DIR, TRASH_DIR } from '../config.js';
import { readDB, mutateDB } from '../db.js';
import { moveInto, safeRm, moveToTrash, moveRelPaths, sanitize, extOf, sniffImageExt } from '../files.js';
import { upload } from '../upload.js';
import { normalizeNote, normalizeNoteImage, str, TAG_KEYS } from '../schema.js';
import { createRouter, HttpError } from '../http.js';
import { sourceAsUpload, IMAGE_EXT } from '../sources.js';

const router = createRouter();
export default router;

export const noteDir = (id) => path.join(DATA_DIR, 'note', id);
// Pinned first, then the one changed last.
const ordered = (list) => [...list].sort((a, b) => Number(b.pinned) - Number(a.pinned) || (b.updatedAt || 0) - (a.updatedAt || 0));

router.get('/api/notes', async (_req, res) => {
  const db = await readDB();
  res.json({ notes: ordered(db.notes) });
});

router.get('/api/notes/:id', async (req, res) => {
  const db = await readDB();
  const note = db.notes.find((n) => n.id === req.params.id);
  if (!note) return res.status(404).json({ error: 'not_found' });
  res.json({ note });
});

router.post('/api/notes', async (req, res) => {
  const note = await mutateDB((db) => {
    const n = normalizeNote({ id: nanoid(10), title: req.body.title, body: req.body.body, color: req.body.color, createdAt: Date.now(), updatedAt: Date.now() });
    db.notes.push(n);
    return n;
  });
  res.status(201).json({ note });
});

// Title, text, colour, pinned — only what the body brings.
router.patch('/api/notes/:id', async (req, res) => {
  const note = await mutateDB((db) => {
    const n = db.notes.find((x) => x.id === req.params.id);
    if (!n) return null;
    if ('title' in req.body) n.title = str(req.body.title, 300);
    if ('body' in req.body) n.body = str(req.body.body, 200000);
    if ('color' in req.body) n.color = TAG_KEYS.has(req.body.color) ? req.body.color : null;
    if ('pinned' in req.body) n.pinned = !!req.body.pinned;
    if ('order' in req.body && Array.isArray(req.body.order)) { // the pictures in a new order (ids)
      const rank = new Map(req.body.order.map((id, i) => [id, i]));
      n.images = [...n.images].sort((a, b) => (rank.get(a.id) ?? 1e9) - (rank.get(b.id) ?? 1e9));
    }
    n.updatedAt = Date.now();
    return n;
  });
  if (!note) return res.status(404).json({ error: 'not_found' });
  res.json({ note });
});

// Pictures: uploads (several at once) or one that's already in the app ({ source }).
router.post('/api/notes/:id/images', upload.array('images', 50), async (req, res) => {
  if (!req.files?.length && await sourceAsUpload(req)) req.files = [req.file];
  const files = (req.files || []).filter((f) => IMAGE_EXT.test(f.originalname) || (f.mimetype || '').startsWith('image/'));
  if (!files.length) throw new HttpError(400, 'file_required', 'Pick a picture (PNG, JPG, GIF, WebP, AVIF or SVG).');
  const db = await readDB();
  const note = db.notes.find((n) => n.id === req.params.id);
  if (!note) return res.status(404).json({ error: 'not_found' });
  const dir = path.join(noteDir(note.id), 'images');
  await fsp.mkdir(dir, { recursive: true });
  const added = [];
  for (const f of files) {
    const ext = extOf(f.originalname) || await sniffImageExt(f.path).catch(() => '') || '.png';
    const base = sanitize(path.basename(f.originalname, path.extname(f.originalname))).slice(0, 60) || 'image';
    const stored = await moveInto(dir, f.path, `${nanoid(6)}-${base}${ext}`);
    added.push(normalizeNoteImage({ id: nanoid(8), file: `images/${stored}`, name: str(f.originalname, 200) }));
  }
  const updated = await mutateDB((d) => {
    const n = d.notes.find((x) => x.id === note.id);
    if (!n) return null;
    n.images = [...n.images, ...added];
    n.updatedAt = Date.now();
    return n;
  });
  if (!updated) {
    for (const a of added) await safeRm(path.join(noteDir(note.id), a.file), { force: true }).catch(() => {});
    return res.status(404).json({ error: 'not_found' });
  }
  res.status(201).json({ note: updated, images: added });
});

// A picture → Trash (with its file), restorable.
router.delete('/api/notes/:id/images/:imageId', async (req, res) => {
  const trashId = nanoid(10);
  let rel = null;
  const note = await mutateDB((db) => {
    const n = db.notes.find((x) => x.id === req.params.id);
    const i = n ? n.images.findIndex((x) => x.id === req.params.imageId) : -1;
    if (i === -1) return null;
    const [image] = n.images.splice(i, 1);
    rel = image.file;
    n.updatedAt = Date.now();
    db.trash.unshift({ trashId, kind: 'noteImage', deletedAt: Date.now(), data: { noteId: n.id, noteTitle: n.title, image, index: i, rels: [rel] } });
    return n;
  });
  if (!note) return res.status(404).json({ error: 'not_found' });
  await moveRelPaths(noteDir(req.params.id), path.join(TRASH_DIR, trashId), [rel]).catch(() => {});
  res.json({ note, trashId });
});

const isEmpty = (n) => !n.title.trim() && !n.body.trim() && !n.images.length;

// A note → Trash (with its pictures). ?ifEmpty=1: only an empty note, and
// without the Trash (a "New note" left without writing anything).
router.delete('/api/notes/:id', async (req, res) => {
  const trashId = nanoid(10);
  const onlyEmpty = req.query.ifEmpty === '1';
  const out = await mutateDB((db) => {
    const i = db.notes.findIndex((n) => n.id === req.params.id);
    if (i === -1) return { status: 404 };
    if (onlyEmpty && !isEmpty(db.notes[i])) return { kept: true };
    const [note] = db.notes.splice(i, 1);
    if (!onlyEmpty) db.trash.unshift({ trashId, kind: 'note', deletedAt: Date.now(), data: note });
    return { removed: true };
  });
  if (out.status === 404) return res.status(404).json({ error: 'not_found' });
  if (out.kept) return res.json({ ok: true, removed: false });
  if (onlyEmpty) {
    await safeRm(noteDir(req.params.id), { recursive: true, force: true }).catch(() => {});
    return res.json({ ok: true, removed: true });
  }
  await moveToTrash(noteDir(req.params.id), path.join(TRASH_DIR, trashId));
  res.json({ ok: true, trashId });
});
