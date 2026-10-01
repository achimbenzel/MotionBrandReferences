/**
 * How you've been working, for the dashboard — kept in data/activity.json, a
 * small file of its own (the library database isn't touched):
 * - saves per day (every successful change through the API) and focus minutes
 *   per day (finished focus-timer sessions) for the activity map; what was
 *   added on a day is read from the library itself;
 * - the things you changed last (plans, storyboards, mockups, references,
 *   software, the board) for "Continue where you left off".
 */
import fsp from 'node:fs/promises';
import path from 'node:path';
import { DATA_DIR, TYPE_LABEL } from './config.js';

const FILE = () => path.join(DATA_DIR, 'activity.json');
const KEEP_DAYS = 400;
const KEEP_RECENT = 60;
const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;
let store = null;    // { days: { day: saves }, focus: { day: minutes }, recent: [{ kind, id, blockId?, t }] }
let loading = null;
let timer = null;

// Local calendar day of a timestamp.
export const dayOf = (t) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const counts = (raw) => {
  const out = {};
  for (const [k, v] of Object.entries(raw && typeof raw === 'object' ? raw : {})) if (DAY_KEY.test(k) && Number.isFinite(v) && v > 0) out[k] = Math.round(v);
  return out;
};
const ID = /^[\w-]{1,40}$/;
const recentList = (raw) => (Array.isArray(raw) ? raw : [])
  .filter((r) => r && typeof r.kind === 'string' && ID.test(r.id || '') && Number.isFinite(r.t) && (!r.blockId || ID.test(r.blockId)))
  .map((r) => ({ kind: r.kind, id: r.id, ...(r.blockId ? { blockId: r.blockId } : {}), t: r.t }))
  .slice(0, KEEP_RECENT);

async function load() {
  if (store) return store;
  if (!loading) {
    loading = fsp.readFile(FILE(), 'utf8').then((s) => {
      const raw = JSON.parse(s);
      return { days: counts(raw?.days), focus: counts(raw?.focus), recent: recentList(raw?.recent) };
    }).catch(() => ({ days: {}, focus: {}, recent: [] })).then((st) => { store = st; return store; });
  }
  return loading;
}

async function save() {
  timer = null;
  const st = await load();
  const cutoff = dayOf(Date.now() - KEEP_DAYS * 86400000);
  for (const map of [st.days, st.focus]) for (const k of Object.keys(map)) if (k < cutoff) delete map[k];
  const tmp = `${FILE()}.${process.pid}.tmp`;
  try {
    await fsp.mkdir(DATA_DIR, { recursive: true });
    await fsp.writeFile(tmp, JSON.stringify(st));
    await fsp.rename(tmp, FILE());
  } catch { await fsp.rm(tmp, { force: true }).catch(() => {}); }
}
const later = () => { if (!timer) timer = setTimeout(save, 4000); };

// What a change through the API was about, from its path.
function subjectOf(p) {
  let m = /^\/api\/plans\/([\w-]+)\/blocks\/([\w-]+)/.exec(p);
  if (m) return { kind: 'block', id: m[1], blockId: m[2] };
  if ((m = /^\/api\/plans\/([\w-]+)/.exec(p))) return { kind: 'plan', id: m[1] };
  if ((m = /^\/api\/mockups\/([\w-]+)/.exec(p))) return { kind: 'mockup', id: m[1] };
  if ((m = /^\/api\/projects\/([\w-]+)/.exec(p))) return { kind: 'project', id: m[1] };
  if ((m = /^\/api\/software\/([\w-]+)/.exec(p))) return { kind: 'software', id: m[1] };
  if ((m = /^\/api\/presentations\/([\w-]+)/.exec(p)) && m[1] !== 'templates') return { kind: 'presentation', id: m[1] };
  if (/^\/api\/board(\/|$)/.test(p)) return { kind: 'board', id: 'board' };
  return null;
}

/** One more save today (written to disk a few seconds later, batched), and what it was about. */
export async function noteActivity(subject) {
  const st = await load();
  const k = dayOf(Date.now());
  st.days[k] = (st.days[k] || 0) + 1;
  if (subject) {
    const key = (r) => `${r.kind}:${r.id}:${r.blockId || ''}`;
    const entry = { ...subject, t: Date.now() };
    st.recent = [entry, ...st.recent.filter((r) => key(r) !== key(entry))].slice(0, KEEP_RECENT);
  }
  later();
}

/** Minutes of a finished focus session, on today. */
export async function noteFocus(minutes) {
  const st = await load();
  const k = dayOf(Date.now());
  st.focus[k] = Math.min(24 * 60, (st.focus[k] || 0) + minutes);
  later();
  return st.focus[k];
}

/** Express middleware: every successful change through the API counts (automatic thumbnails and the activity itself don't). */
export function countActivity(req, res, next) {
  const full = `${req.baseUrl}${req.path}`;
  if (req.method !== 'GET' && req.method !== 'HEAD' && !/\/thumb$/.test(full) && !/^\/api\/activity(\/|$)/.test(full)) {
    // Deleting something isn't somewhere to continue.
    const subject = req.method === 'DELETE' && /^\/api\/(plans|mockups|projects|software|clients|presentations)\/[\w-]+$/.test(full) ? null : subjectOf(full);
    res.on('finish', () => { if (res.statusCode < 400) noteActivity(subject).catch(() => {}); });
  }
  next();
}

/**
 * The last `days` days (up to today) → [{ date, saves, focus, refs, plans, mockups, inbox }].
 */
export async function activityDays(db, days) {
  const st = await load();
  const n = Math.max(7, Math.min(KEEP_DAYS, Math.round(days) || 182));
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const list = [];
  const at = new Map();
  for (let i = n - 1; i >= 0; i -= 1) {
    const d = new Date(today); d.setDate(today.getDate() - i);
    const date = dayOf(d);
    const row = { date, saves: st.days[date] || 0, focus: st.focus[date] || 0, refs: 0, plans: 0, mockups: 0, inbox: 0 };
    list.push(row); at.set(row.date, row);
  }
  const add = (t, key) => { if (!t) return; const row = at.get(dayOf(t)); if (row) row[key] += 1; };
  for (const p of db.projects || []) add(p.createdAt, 'refs');
  for (const p of db.plans || []) add(p.createdAt, 'plans');
  for (const m of db.mockups || []) add(m.createdAt, 'mockups');
  for (const it of db.inbox || []) add(it.createdAt, 'inbox');
  return list;
}

const planPic = (p, rel) => (typeof rel === 'string' && rel ? `/data/plan/${p.id}/${rel}` : null);
/**
 * What you changed last, newest first, as cards: → [{ key, kind, title, sub, href, thumb, gradient, emoji, t }].
 * Things that are gone are left out; a plan's blocks count as the plan (storyboards on their own).
 */
export async function recentItems(db, limit = 8) {
  const st = await load();
  const out = []; const seen = new Set();
  for (const r of st.recent) {
    let item = null;
    if (r.kind === 'plan' || r.kind === 'block') {
      const p = (db.plans || []).find((x) => x.id === r.id);
      if (!p) continue;
      const b = r.kind === 'block' ? (p.blocks || []).find((x) => x.id === r.blockId) : null;
      if (b?.type === 'storyboard') {
        const shot = (b.shots || []).find((s) => s.image);
        item = { key: `storyboard:${p.id}:${b.id}`, kind: 'storyboard', title: b.title || 'Storyboard', sub: `Storyboard · ${p.name || 'Project'}`,
          href: `/storyboards/${p.id}/${b.id}`, thumb: shot ? planPic(p, shot.image) : null };
      } else {
        item = { key: `plan:${p.id}`, kind: 'plan', title: p.name || 'Project', sub: b ? `Project · ${b.title || 'block'}` : 'Project',
          href: b ? `/plan/${p.id}?block=${b.id}` : `/plan/${p.id}`, thumb: planPic(p, p.banner), gradient: p.banner ? null : p.bannerGradient || null,
          emoji: p.avatar ? null : p.avatarEmoji || null, avatar: planPic(p, p.avatar) };
      }
    } else if (r.kind === 'mockup') {
      const m = (db.mockups || []).find((x) => x.id === r.id);
      if (!m) continue;
      item = { key: `mockup:${m.id}`, kind: 'mockup', title: m.name || 'Mockup', sub: m.kind === '2d' ? '2D mockup' : '3D mockup',
        href: `/mockups/${m.id}`, thumb: m.thumb ? `/data/mockup/${m.id}/${m.thumb}` : null };
    } else if (r.kind === 'project') {
      const p = (db.projects || []).find((x) => x.id === r.id);
      if (!p) continue;
      const file = [p.thumb, p.image, p.front, p.shot].find((f) => typeof f === 'string' && f);
      item = { key: `project:${p.id}`, kind: 'project', title: p.title || 'Untitled', sub: TYPE_LABEL[p.type] || 'Reference',
        href: `/project/${p.id}`, thumb: file ? `/data/${p.type}/${p.id}/${file}` : null };
    } else if (r.kind === 'software') {
      const s = (db.software || []).find((x) => x.id === r.id);
      if (!s) continue;
      item = { key: `software:${s.id}`, kind: 'software', title: s.name || 'Software', sub: 'Software', href: `/software/${s.id}`,
        thumb: typeof s.banner === 'string' && s.banner ? `/data/software/${s.id}/${s.banner}` : null, gradient: s.banner ? null : s.bannerGradient || null,
        emoji: s.avatar ? null : s.avatarEmoji || null };
    } else if (r.kind === 'presentation') {
      const d = (db.presentations || []).find((x) => x.id === r.id);
      if (!d) continue;
      const pic = d.slides.find((s) => s.data?.image?.file)?.data.image.file;
      item = { key: `presentation:${d.id}`, kind: 'presentation', title: d.title || 'Presentation', sub: 'Presentation', href: `/presentations/${d.id}`,
        thumb: pic ? `/data/presentation/${d.id}/${pic}` : null };
    } else if (r.kind === 'board') {
      item = { key: 'board', kind: 'board', title: 'To-Do board', sub: 'To-dos', href: '/board', thumb: null };
    }
    if (!item || seen.has(item.key)) continue;
    seen.add(item.key);
    out.push({ ...item, t: r.t });
    if (out.length >= limit) break;
  }
  return out;
}
