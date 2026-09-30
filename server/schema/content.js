// Content: posts, their media, beats, captions, checks — and pillars, rhythm, snippets, profile.
// Part of the record shapes (see ../schema.js, which re-exports all of it).
import { nanoid } from 'nanoid';
import { ID, TAG_KEYS, isDay, isTimeOfDay, num, str } from './base.js';

/** Your content pillars — the themes you post about: [{ id, name, color }]. */
export function normalizeContentPillars(v) {
  const seen = new Set();
  return (Array.isArray(v) ? v : []).filter((p) => p && typeof p === 'object').map((p) => ({
    id: typeof p.id === 'string' && ID.test(p.id) ? p.id : `p${nanoid(7)}`,
    name: str(p.name, 40),
    color: TAG_KEYS.has(p.color) ? p.color : 'blue',
  })).filter((p) => !seen.has(p.id) && seen.add(p.id)).slice(0, 12);
}
/**
 * Your posting rhythm: how many posts a week (0 = no goal) and fixed slots —
 * a weekday (0 = Monday), a time, a pillar — the calendar and feed keep free.
 */
export function normalizeContentRhythm(v) {
  const o = v && typeof v === 'object' ? v : {};
  const slots = (Array.isArray(o.slots) ? o.slots : []).filter((x) => x && typeof x === 'object').slice(0, 21).map((x) => ({
    id: typeof x.id === 'string' && ID.test(x.id) ? x.id : `s${nanoid(7)}`,
    day: Math.round(num(x.day, 0, 6, 0)),
    time: isTimeOfDay(x.time) ? x.time : '',
    pillar: typeof x.pillar === 'string' && ID.test(x.pillar) ? x.pillar : null,
  })).sort((a, b) => a.day - b.day || a.time.localeCompare(b.time));
  return { goal: Math.round(num(o.goal, 0, 21, 0)), slots };
}
/** A saved hook, hashtag set or call to action, to use again. */
export const CONTENT_SNIPPET_KINDS = ['hook', 'hashtags', 'cta'];
export function normalizeContentSnippet(x) {
  return {
    id: typeof x?.id === 'string' && ID.test(x.id) ? x.id : nanoid(10),
    kind: CONTENT_SNIPPET_KINDS.includes(x?.kind) ? x.kind : 'hook',
    name: str(x?.name, 60).trim(),
    text: str(x?.text, 2000),
    uses: Math.round(num(x?.uses, 0, 1e9, 0)),
    usedAt: num(x?.usedAt, 0, 1e14, 0),
    createdAt: num(x?.createdAt, 0, 1e14, 0),
  };
}
/** How you appear in the post previews (Content): a name and a handle. */
export function normalizeContentProfile(v) {
  const o = v && typeof v === 'object' ? v : {};
  return { name: str(o.name, 60).trim(), handle: str(o.handle, 40).replace(/^@+/, '').replace(/[^\w.]/g, '').slice(0, 30) };
}
// ---------------------------------------------------------------------------
// Content — posts planned for social media (pictures / videos in data/content/<id>/)
// ---------------------------------------------------------------------------
export const CONTENT_PLATFORMS = ['instagram', 'tiktok', 'x', 'youtube', 'linkedin'];
export const CONTENT_FORMATS = ['reel', 'post', 'carousel', 'story', 'text', 'thread', 'video'];
export const CONTENT_STATUSES = ['idea', 'script', 'production', 'scheduled', 'posted'];
export const CONTENT_METRICS = ['views', 'likes', 'comments', 'shares', 'saves', 'follows'];
const contentFile = (v) => (typeof v === 'string' && v.startsWith('media/') && !v.includes('..') ? str(v, 300) : null);
export function normalizeContentMedia(m) {
  return {
    id: typeof m?.id === 'string' && ID.test(m.id) ? m.id : nanoid(8),
    file: contentFile(m?.file), name: str(m?.name, 200), kind: m?.kind === 'video' ? 'video' : 'image',
  };
}
export const CONTENT_BEAT_KINDS = ['hook', 'body', 'cta'];
/** One beat of a Reel / Short: what happens, the text on screen, how long (s). */
export function normalizeContentBeat(b) {
  return {
    id: typeof b?.id === 'string' && ID.test(b.id) ? b.id : nanoid(8),
    kind: CONTENT_BEAT_KINDS.includes(b?.kind) ? b.kind : 'body',
    text: str(b?.text, 2000),
    screen: str(b?.screen, 500),
    sec: Math.round(num(b?.sec, 0, 600, 0) * 10) / 10,
  };
}
/** Its own text for a platform ({ x: '…' }); none = the caption + hashtags. */
export function normalizeContentCaptions(v) {
  const o = v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  return Object.fromEntries(CONTENT_PLATFORMS.filter((p) => typeof o[p] === 'string' && o[p].trim()).map((p) => [p, str(o[p], 20000)]));
}
const CHECK_KEY = /^[a-z0-9-]{1,40}$/;
export const normalizeContentChecks = (v) => [...new Set(Array.isArray(v) ? v : [])].filter((k) => typeof k === 'string' && CHECK_KEY.test(k)).slice(0, 40);
export function normalizeContent(c) {
  const metrics = c?.metrics && typeof c.metrics === 'object' ? c.metrics : {};
  const media = (Array.isArray(c?.media) ? c.media : []).slice(0, 200).map(normalizeContentMedia).filter((m) => m.file);
  return {
    id: typeof c?.id === 'string' && ID.test(c.id) ? c.id : nanoid(10),
    title: str(c?.title, 300),
    platforms: [...new Set(Array.isArray(c?.platforms) ? c.platforms : [])].filter((p) => CONTENT_PLATFORMS.includes(p)),
    format: CONTENT_FORMATS.includes(c?.format) ? c.format : 'reel',
    status: CONTENT_STATUSES.includes(c?.status) ? c.status : 'idea',
    date: isDay(c?.date) ? c.date : '',            // when it goes out
    time: isTimeOfDay(c?.time) ? c.time : '',
    hook: str(c?.hook, 1000),                       // the first second / first line
    caption: str(c?.caption, 20000),
    hashtags: str(c?.hashtags, 4000),
    script: str(c?.script, 100000),                 // shots, voice-over, notes
    notes: str(c?.notes, 20000),                    // the idea: why, references, thoughts
    beats: (Array.isArray(c?.beats) ? c.beats : []).filter((b) => b && typeof b === 'object').slice(0, 60).map(normalizeContentBeat),
    checks: normalizeContentChecks(c?.checks),      // production checklist: the steps done
    captions: normalizeContentCaptions(c?.captions),
    pillar: typeof c?.pillar === 'string' && ID.test(c.pillar) ? c.pillar : null, // one of your content pillars (settings)
    link: str(c?.link, 2000),                       // where it's live
    planId: typeof c?.planId === 'string' && ID.test(c.planId) ? c.planId : null, // the project it shows
    color: TAG_KEYS.has(c?.color) ? c.color : null,
    media,
    coverId: typeof c?.coverId === 'string' && media.some((m) => m.id === c.coverId) ? c.coverId : null, // none = the first
    metrics: Object.fromEntries(CONTENT_METRICS.map((k) => [k, metrics[k] === '' || metrics[k] == null ? null : num(metrics[k], 0, 1e12, null)])),
    postedAt: num(c?.postedAt, 0, 1e14, 0),
    createdAt: num(c?.createdAt, 0, 1e14, 0),
    updatedAt: num(c?.updatedAt, 0, 1e14, 0),
  };
}
