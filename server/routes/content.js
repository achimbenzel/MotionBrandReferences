// Content (Work mode) — posts planned for social media: Instagram, TikTok /
// Reels, X (and YouTube, LinkedIn), from the idea to the posted one.
import fsp from 'node:fs/promises';
import path from 'node:path';
import { nanoid } from 'nanoid';
import { DATA_DIR, TMP_DIR, TRASH_DIR } from '../config.js';
import { readDB, mutateDB } from '../db.js';
import { moveInto, safeRm, moveToTrash, moveRelPaths, sanitize, extOf, sniffImageExt } from '../files.js';
import { upload } from '../upload.js';
import {
  normalizeContent, normalizeContentMedia, str, isDay, isTimeOfDay, TAG_KEYS,
  CONTENT_PLATFORMS, CONTENT_FORMATS, CONTENT_STATUSES, CONTENT_METRICS,
} from '../schema.js';
import { createRouter, HttpError } from '../http.js';
import { resolveSource, IMAGE_EXT, VIDEO_EXT } from '../sources.js';

const router = createRouter();
export default router;

export const contentDir = (id) => path.join(DATA_DIR, 'content', id);
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

router.get('/api/content', async (_req, res) => {
  const db = await readDB();
  res.json({ items: [...db.content].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)) });
});

router.get('/api/content/:id', async (req, res) => {
  const db = await readDB();
  const item = db.content.find((c) => c.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'not_found' });
  res.json({ item });
});

router.post('/api/content', async (req, res) => {
  const b = req.body || {};
  const item = await mutateDB((db) => {
    const now = Date.now();
    const c = normalizeContent({
      id: nanoid(10), title: b.title, platforms: b.platforms, format: b.format, status: b.status, date: b.date, time: b.time,
      hook: b.hook, caption: b.caption, hashtags: b.hashtags, script: b.script, planId: b.planId, createdAt: now, updatedAt: now,
    });
    if (c.status === 'posted') { c.postedAt = now; if (!c.date || c.date > today()) c.date = today(); }
    db.content.push(c);
    return c;
  });
  res.status(201).json({ item });
});

// Only what the body brings. Marked "posted": when (and on which day, if none was set).
router.patch('/api/content/:id', async (req, res) => {
  const b = req.body || {};
  const item = await mutateDB((db) => {
    const c = db.content.find((x) => x.id === req.params.id);
    if (!c) return null;
    const text = { title: 300, hook: 1000, caption: 20000, hashtags: 4000, script: 100000, link: 2000 };
    for (const [k, max] of Object.entries(text)) if (k in b) c[k] = str(b[k], max);
    if ('platforms' in b && Array.isArray(b.platforms)) c.platforms = [...new Set(b.platforms)].filter((p) => CONTENT_PLATFORMS.includes(p));
    if ('format' in b && CONTENT_FORMATS.includes(b.format)) c.format = b.format;
    if ('date' in b) c.date = isDay(b.date) ? b.date : '';
    if ('time' in b) c.time = isTimeOfDay(b.time) ? b.time : '';
    if ('color' in b) c.color = TAG_KEYS.has(b.color) ? b.color : null;
    if ('planId' in b) c.planId = typeof b.planId === 'string' && db.plans.some((p) => p.id === b.planId) ? b.planId : null;
    if ('metrics' in b && b.metrics && typeof b.metrics === 'object') {
      c.metrics = normalizeContent({ metrics: { ...c.metrics, ...Object.fromEntries(Object.entries(b.metrics).filter(([k]) => CONTENT_METRICS.includes(k))) } }).metrics;
    }
    if ('status' in b && CONTENT_STATUSES.includes(b.status) && b.status !== c.status) {
      c.status = b.status;
      // Out now: on the day it went out (planned for later → it's today).
      if (b.status === 'posted') { c.postedAt = c.postedAt || Date.now(); if (!c.date || c.date > today()) c.date = today(); }
      else c.postedAt = 0;
    }
    if ('order' in b && Array.isArray(b.order)) { // pictures / videos in a new order (ids)
      const rank = new Map(b.order.map((id, i) => [id, i]));
      c.media = [...c.media].sort((x, y) => (rank.get(x.id) ?? 1e9) - (rank.get(y.id) ?? 1e9));
    }
    c.updatedAt = Date.now();
    return c;
  });
  if (!item) return res.status(404).json({ error: 'not_found' });
  res.json({ item });
});

// Pictures / videos: uploads (several at once) or one that's already in the app ({ source }).
router.post('/api/content/:id/media', upload.array('media', 50), async (req, res) => {
  let files = req.files || [];
  if (!files.length && req.body?.source && typeof req.body.source === 'object') {
    const src = await resolveSource(await readDB(), req.body.source);
    if (!src) throw new HttpError(400, 'not_found', 'That picture or video is no longer there.');
    if (!req.tmpDir) { // cleaned up with the request, like an upload
      req.tmpDir = path.join(TMP_DIR, nanoid());
      await fsp.mkdir(req.tmpDir, { recursive: true });
    }
    const tmp = path.join(req.tmpDir, `${nanoid(8)}${src.ext}`);
    await fsp.copyFile(src.abs, tmp);
    files = [{ path: tmp, originalname: `${String(src.name || 'media').replace(/[^\w\- .]+/g, '').trim().slice(0, 80) || 'media'}${src.ext}`, mimetype: '' }];
  }
  const kindOf = (f) => (VIDEO_EXT.test(f.originalname) || (f.mimetype || '').startsWith('video/') ? 'video'
    : IMAGE_EXT.test(f.originalname) || (f.mimetype || '').startsWith('image/') ? 'image' : null);
  files = files.filter(kindOf);
  if (!files.length) throw new HttpError(400, 'file_required', 'Pick a picture or a video.');
  const db = await readDB();
  const item = db.content.find((c) => c.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'not_found' });
  const dir = path.join(contentDir(item.id), 'media');
  await fsp.mkdir(dir, { recursive: true });
  const added = [];
  for (const f of files) {
    const kind = kindOf(f);
    const ext = extOf(f.originalname) || (kind === 'image' ? await sniffImageExt(f.path).catch(() => '') : '') || (kind === 'video' ? '.mp4' : '.png');
    const base = sanitize(path.basename(f.originalname, path.extname(f.originalname))).slice(0, 60) || kind;
    const stored = await moveInto(dir, f.path, `${nanoid(6)}-${base}${ext}`);
    added.push(normalizeContentMedia({ id: nanoid(8), file: `media/${stored}`, name: str(f.originalname, 200), kind }));
  }
  const updated = await mutateDB((d) => {
    const c = d.content.find((x) => x.id === item.id);
    if (!c) return null;
    c.media = [...c.media, ...added];
    c.updatedAt = Date.now();
    return c;
  });
  if (!updated) {
    for (const a of added) await safeRm(path.join(contentDir(item.id), a.file), { force: true }).catch(() => {});
    return res.status(404).json({ error: 'not_found' });
  }
  res.status(201).json({ item: updated, media: added });
});

// A picture / video → Trash (with its file), restorable in the same place.
router.delete('/api/content/:id/media/:mediaId', async (req, res) => {
  const trashId = nanoid(10);
  let rel = null;
  const item = await mutateDB((db) => {
    const c = db.content.find((x) => x.id === req.params.id);
    const i = c ? c.media.findIndex((m) => m.id === req.params.mediaId) : -1;
    if (i === -1) return null;
    const [media] = c.media.splice(i, 1);
    rel = media.file;
    c.updatedAt = Date.now();
    db.trash.unshift({ trashId, kind: 'contentMedia', deletedAt: Date.now(), data: { contentId: c.id, contentTitle: c.title, media, index: i, rels: [rel] } });
    return c;
  });
  if (!item) return res.status(404).json({ error: 'not_found' });
  await moveRelPaths(contentDir(req.params.id), path.join(TRASH_DIR, trashId), [rel]).catch(() => {});
  res.json({ item, trashId });
});

// A copy to plan the same idea again (another platform, a part two) — without the numbers.
router.post('/api/content/:id/duplicate', async (req, res) => {
  const id = nanoid(10);
  const db = await readDB();
  const src = db.content.find((c) => c.id === req.params.id);
  if (!src) return res.status(404).json({ error: 'not_found' });
  const from = contentDir(src.id);
  await fsp.cp(from, contentDir(id), { recursive: true }).catch(() => {});
  const item = await mutateDB((d) => {
    const now = Date.now();
    const c = normalizeContent({
      ...src, id, title: `${src.title || 'Untitled'} (copy)`, status: src.status === 'posted' ? 'idea' : src.status,
      date: '', time: '', link: '', metrics: {}, postedAt: 0, createdAt: now, updatedAt: now,
      media: src.media.map((m) => ({ ...m, id: nanoid(8) })),
    });
    d.content.push(c);
    return c;
  });
  res.status(201).json({ item });
});

const isEmpty = (c) => !c.title.trim() && !c.hook.trim() && !c.caption.trim() && !c.hashtags.trim() && !c.script.trim() && !c.media.length;

// A post → Trash (with its pictures and videos). ?ifEmpty=1: only an empty
// one, and without the Trash (a "New post" left without writing anything).
router.delete('/api/content/:id', async (req, res) => {
  const trashId = nanoid(10);
  const onlyEmpty = req.query.ifEmpty === '1';
  const out = await mutateDB((db) => {
    const i = db.content.findIndex((c) => c.id === req.params.id);
    if (i === -1) return { status: 404 };
    if (onlyEmpty && !isEmpty(db.content[i])) return { kept: true };
    const [item] = db.content.splice(i, 1);
    if (!onlyEmpty) db.trash.unshift({ trashId, kind: 'content', deletedAt: Date.now(), data: item });
    return { removed: true };
  });
  if (out.status === 404) return res.status(404).json({ error: 'not_found' });
  if (out.kept) return res.json({ ok: true, removed: false });
  if (onlyEmpty) {
    await safeRm(contentDir(req.params.id), { recursive: true, force: true }).catch(() => {});
    return res.json({ ok: true, removed: true });
  }
  await moveToTrash(contentDir(req.params.id), path.join(TRASH_DIR, trashId));
  res.json({ ok: true, trashId });
});
