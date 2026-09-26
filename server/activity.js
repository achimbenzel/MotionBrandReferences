/**
 * How much you worked on each day, for the dashboard's activity map: saves
 * are counted per day in data/activity.json (a small file of its own — the
 * library database isn't touched), and what was added on a day is read from
 * the library itself (references, plans, mockups, Inbox shares).
 */
import fsp from 'node:fs/promises';
import path from 'node:path';
import { DATA_DIR } from './config.js';

const FILE = () => path.join(DATA_DIR, 'activity.json');
const KEEP_DAYS = 400;
let counts = null;   // { 'yyyy-mm-dd': saves }
let loading = null;
let timer = null;

// Local calendar day of a timestamp.
export const dayOf = (t) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

async function load() {
  if (counts) return counts;
  if (!loading) {
    loading = fsp.readFile(FILE(), 'utf8').then((s) => {
      const raw = JSON.parse(s);
      const out = {};
      for (const [k, v] of Object.entries(raw?.days || {})) if (/^\d{4}-\d{2}-\d{2}$/.test(k) && Number.isFinite(v) && v > 0) out[k] = Math.round(v);
      return out;
    }).catch(() => ({})).then((c) => { counts = { ...c, ...(counts || {}) }; return counts; });
  }
  return loading;
}

async function save() {
  timer = null;
  const c = await load();
  const cutoff = dayOf(Date.now() - KEEP_DAYS * 86400000);
  for (const k of Object.keys(c)) if (k < cutoff) delete c[k];
  const tmp = `${FILE()}.${process.pid}.tmp`;
  try {
    await fsp.mkdir(DATA_DIR, { recursive: true });
    await fsp.writeFile(tmp, JSON.stringify({ days: c }));
    await fsp.rename(tmp, FILE());
  } catch { await fsp.rm(tmp, { force: true }).catch(() => {}); }
}

/** One more save today (written to disk a few seconds later, batched). */
export async function noteActivity() {
  const c = await load();
  const k = dayOf(Date.now());
  c[k] = (c[k] || 0) + 1;
  if (!timer) timer = setTimeout(save, 4000);
}

/** Express middleware: every successful change through the API counts (automatic thumbnails don't). */
export function countActivity(req, res, next) {
  if (req.method !== 'GET' && req.method !== 'HEAD' && !/\/thumb$/.test(req.path)) {
    res.on('finish', () => { if (res.statusCode < 400) noteActivity().catch(() => {}); });
  }
  next();
}

/**
 * The last `days` days (up to today) → [{ date, saves, refs, plans, mockups, inbox }].
 */
export async function activityDays(db, days) {
  const c = await load();
  const n = Math.max(7, Math.min(KEEP_DAYS, Math.round(days) || 182));
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const list = [];
  const at = new Map();
  for (let i = n - 1; i >= 0; i -= 1) {
    const d = new Date(today); d.setDate(today.getDate() - i);
    const row = { date: dayOf(d), saves: 0, refs: 0, plans: 0, mockups: 0, inbox: 0 };
    row.saves = c[row.date] || 0;
    list.push(row); at.set(row.date, row);
  }
  const add = (t, key) => { if (!t) return; const row = at.get(dayOf(t)); if (row) row[key] += 1; };
  for (const p of db.projects || []) add(p.createdAt, 'refs');
  for (const p of db.plans || []) add(p.createdAt, 'plans');
  for (const m of db.mockups || []) add(m.createdAt, 'mockups');
  for (const it of db.inbox || []) add(it.createdAt, 'inbox');
  return list;
}
