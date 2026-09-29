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
  normalizeContent, normalizeContentMedia, normalizeContentBeat, normalizeContentCaptions, normalizeContentChecks, normalizeContentSnippet,
  str, isDay, isTimeOfDay, TAG_KEYS, CONTENT_PLATFORMS, CONTENT_FORMATS, CONTENT_STATUSES, CONTENT_METRICS, CONTENT_SNIPPET_KINDS,
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
      hook: b.hook, caption: b.caption, hashtags: b.hashtags, script: b.script, notes: b.notes, planId: b.planId, pillar: b.pillar, createdAt: now, updatedAt: now,
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
    const text = { title: 300, hook: 1000, caption: 20000, hashtags: 4000, script: 100000, notes: 20000, link: 2000 };
    for (const [k, max] of Object.entries(text)) if (k in b) c[k] = str(b[k], max);
    if ('platforms' in b && Array.isArray(b.platforms)) c.platforms = [...new Set(b.platforms)].filter((p) => CONTENT_PLATFORMS.includes(p));
    if ('format' in b && CONTENT_FORMATS.includes(b.format)) c.format = b.format;
    if ('date' in b) c.date = isDay(b.date) ? b.date : '';
    if ('time' in b) c.time = isTimeOfDay(b.time) ? b.time : '';
    if ('color' in b) c.color = TAG_KEYS.has(b.color) ? b.color : null;
    if ('planId' in b) c.planId = typeof b.planId === 'string' && db.plans.some((p) => p.id === b.planId) ? b.planId : null;
    if ('beats' in b && Array.isArray(b.beats)) c.beats = b.beats.filter((x) => x && typeof x === 'object').slice(0, 60).map(normalizeContentBeat);
    if ('checks' in b) c.checks = normalizeContentChecks(b.checks);
    if ('captions' in b) c.captions = normalizeContentCaptions(b.captions); // the whole set (none = the caption everywhere)
    if ('pillar' in b) c.pillar = typeof b.pillar === 'string' && /^[\w-]{1,40}$/.test(b.pillar) ? b.pillar : null;
    if ('coverId' in b) c.coverId = typeof b.coverId === 'string' && c.media.some((m) => m.id === b.coverId) ? b.coverId : null;
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

// ---- A post made from something in the app -------------------------------------------
// A project (its latest review cut, its banner), a storyboard (its shots become the
// beats, its frames the pictures), a mockup (its picture) or a reference (as the idea,
// with its picture / video to look at). → the new post, its files copied in.
const SECTION_BEAT = { hook: 'hook', cta: 'cta', outro: 'cta' };
const ASPECT_FORMAT = { '9:16': 'reel', '16:9': 'video', '4:5': 'carousel', '1:1': 'carousel' };
const MAX_FROM_FILES = 12;

function postFrom(db, f) {
  if (f?.kind === 'plan') {
    const plan = db.plans.find((p) => p.id === f.planId);
    if (!plan) return null;
    const client = plan.client || (db.clients || []).find((c) => c.id === plan.clientId)?.name || '';
    const sources = [];
    for (const b of plan.blocks || []) {
      if (b.type !== 'review') continue;
      const v = [...(b.versions || [])].reverse().find((x) => x.file);
      if (v) sources.push({ kind: 'plan', planId: plan.id, blockId: b.id, itemId: v.id });
    }
    if (plan.banner) sources.push({ kind: 'plan', planId: plan.id, itemId: '@banner' });
    return {
      fields: { title: plan.name, planId: plan.id, notes: [client && `Client: ${client}`, 'Made from the project — show the result, the process, the before / after.'].filter(Boolean).join('\n') },
      sources,
    };
  }
  if (f?.kind === 'storyboard') {
    const plan = db.plans.find((p) => p.id === f.planId);
    const b = plan?.blocks?.find((x) => x.id === f.blockId && x.type === 'storyboard');
    if (!b) return null;
    const shots = b.shots || [];
    const beats = shots.slice(0, 60).map((sh) => ({
      kind: SECTION_BEAT[sh.section] || (sh === shots[0] ? 'hook' : 'body'),
      text: [sh.visual, sh.vo && `VO: ${sh.vo}`].filter(Boolean).join('\n'),
      screen: sh.onscreen, sec: sh.duration,
    }));
    const vo = shots.map((sh, i) => (sh.vo ? `${i + 1}. ${sh.vo}` : '')).filter(Boolean).join('\n');
    const sfx = [...new Set(shots.map((sh) => sh.sfx).filter(Boolean))].join(' · ');
    return {
      fields: {
        title: b.title || plan.name, planId: plan.id, format: ASPECT_FORMAT[b.aspect] || 'reel', beats, status: 'script', // its script is written
        script: [vo && `VO:\n${vo}`, sfx && `Sound: ${sfx}`].filter(Boolean).join('\n\n'),
        notes: `From the storyboard “${b.title || 'Storyboard'}” (${plan.name}).`,
      },
      sources: shots.filter((sh) => sh.image).slice(0, MAX_FROM_FILES).map((sh) => ({ kind: 'plan', planId: plan.id, blockId: b.id, itemId: sh.id })),
    };
  }
  if (f?.kind === 'mockup') {
    const m = (db.mockups || []).find((x) => x.id === f.mockupId);
    if (!m) return null;
    return {
      fields: { title: m.name, format: 'post', status: 'production', notes: `From the mockup “${m.name}”.` },
      sources: m.thumb ? [{ kind: 'mockup', mockupId: m.id, file: m.thumb }] : [],
    };
  }
  if (f?.kind === 'project') {
    const p = db.projects.find((x) => x.id === f.projectId);
    if (!p) return null;
    const link = typeof p.url === 'string' ? p.url : '';
    return {
      fields: { title: p.title ? `Idea: ${p.title}` : 'Idea from a reference', notes: [`Inspired by “${p.title || 'a reference'}”${p.channel ? ` (${p.channel})` : ''}.`, link].filter(Boolean).join('\n') },
      // the picture picked (one of its frames, assets …), else its main one
      sources: [f.source?.kind === 'project' && f.source.projectId === p.id ? f.source : { kind: 'project', projectId: p.id }],
    };
  }
  return null;
}

router.post('/api/content/from', async (req, res) => {
  const b = req.body || {};
  const db = await readDB();
  const made = postFrom(db, b.from);
  if (!made) throw new HttpError(404, 'not_found', 'That is no longer there.');
  const id = nanoid(10);
  const dir = path.join(contentDir(id), 'media');
  const media = [];
  for (const s of made.sources) {
    const src = await resolveSource(db, s).catch(() => null);
    if (!src) continue;
    await fsp.mkdir(dir, { recursive: true });
    const base = sanitize(String(src.name || src.kind).replace(/\.[^.]+$/, '')).slice(0, 60) || src.kind;
    const name = `${nanoid(6)}-${base}${src.ext}`;
    await fsp.copyFile(src.abs, path.join(dir, name));
    media.push({ id: nanoid(8), file: `media/${name}`, name: str(`${src.name || src.kind}`, 200), kind: src.kind });
  }
  const item = await mutateDB((d) => {
    const now = Date.now();
    const c = normalizeContent({
      platforms: Array.isArray(b.platforms) ? b.platforms : [], status: 'idea', pillar: b.pillar,
      ...made.fields, ...(b.status ? { status: b.status } : {}), id, media, createdAt: now, updatedAt: now,
    });
    d.content.push(c);
    return c;
  });
  res.status(201).json({ item, copied: media.length });
});

// ---- The library: hooks, hashtag sets and calls to action to use again -----------------
router.get('/api/content-library', async (_req, res) => {
  const db = await readDB();
  res.json({ items: [...db.contentLibrary].sort((a, b) => b.uses - a.uses || b.createdAt - a.createdAt) });
});

// The same text of the same kind is kept once (→ that one).
router.post('/api/content-library', async (req, res) => {
  const b = req.body || {};
  if (!CONTENT_SNIPPET_KINDS.includes(b.kind)) throw new HttpError(400, 'bad_kind', 'A hook, hashtags or a call to action.');
  const text = str(b.text, 2000).trim();
  if (!text) throw new HttpError(400, 'text_required', 'There is nothing to save.');
  const out = await mutateDB((db) => {
    const same = db.contentLibrary.find((x) => x.kind === b.kind && x.text.trim().toLowerCase() === text.toLowerCase());
    if (same) return { item: same, existed: true };
    const item = normalizeContentSnippet({ kind: b.kind, name: b.name, text, createdAt: Date.now() });
    db.contentLibrary.push(item);
    return { item, existed: false };
  });
  res.status(out.existed ? 200 : 201).json(out);
});

router.patch('/api/content-library/:id', async (req, res) => {
  const b = req.body || {};
  const item = await mutateDB((db) => {
    const x = db.contentLibrary.find((s) => s.id === req.params.id);
    if (!x) return null;
    if ('text' in b && str(b.text, 2000).trim()) x.text = str(b.text, 2000);
    if ('name' in b) x.name = str(b.name, 60).trim();
    if (b.use === true) { x.uses += 1; x.usedAt = Date.now(); }
    return x;
  });
  if (!item) return res.status(404).json({ error: 'not_found' });
  res.json({ item });
});

router.delete('/api/content-library/:id', async (req, res) => {
  const trashId = nanoid(10);
  const ok = await mutateDB((db) => {
    const i = db.contentLibrary.findIndex((s) => s.id === req.params.id);
    if (i === -1) return false;
    const [item] = db.contentLibrary.splice(i, 1);
    db.trash.unshift({ trashId, kind: 'contentSnippet', deletedAt: Date.now(), data: item });
    return true;
  });
  if (!ok) return res.status(404).json({ error: 'not_found' });
  res.json({ ok: true, trashId });
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
    const wasCover = c.coverId === media.id;
    if (wasCover) c.coverId = null;
    c.updatedAt = Date.now();
    db.trash.unshift({ trashId, kind: 'contentMedia', deletedAt: Date.now(), data: { contentId: c.id, contentTitle: c.title, media, index: i, wasCover, rels: [rel] } });
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
    const at = src.media.findIndex((m) => m.id === src.coverId);
    c.coverId = at >= 0 ? c.media[at].id : null;
    d.content.push(c);
    return c;
  });
  res.status(201).json({ item });
});

const isEmpty = (c) => !c.title.trim() && !c.hook.trim() && !c.caption.trim() && !c.hashtags.trim() && !c.script.trim() && !c.notes.trim()
  && !c.beats.some((b) => b.text.trim() || b.screen.trim()) && !Object.keys(c.captions).length && !c.media.length;

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
