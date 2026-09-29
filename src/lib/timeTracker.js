import { useSyncExternalStore } from 'react';
import { api } from './api.js';

/**
 * The running time tracker, for the whole app (the sidebar shows it while it
 * runs, the Time Tracker page and a plan's header start and stop it). It
 * lives on the server — so it runs on, whichever device you stop it on —
 * and this keeps a copy that ticks each second.
 */
let state = { loaded: false, running: null, activities: [] };
const subs = new Set();
let tick = 0;
const emit = () => subs.forEach((f) => f());
const set = (patch) => { state = { ...state, ...patch }; emit(); sync(); };
function sync() {
  if (state.running && !tick) tick = setInterval(emit, 1000);
  if (!state.running && tick) { clearInterval(tick); tick = 0; }
}
const pad = (n) => String(n).padStart(2, '0');
/** Local yyyy-mm-dd and HH:MM of a time. */
export const dayKey = (t = new Date()) => { const d = new Date(t); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
export const hhmm = (t = new Date()) => { const d = new Date(t); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
export const fmtElapsed = (ms) => { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 3600)}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`; };
/** 5 min, 1 h 05 */
export const fmtPause = (ms) => {
  if (ms < 60000) return `${Math.max(0, Math.round(ms / 1000))} s`;
  const m = Math.round(ms / 60000);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${pad(m % 60)}`;
};

/** The time a running tracker has been paused up to `now` (what lies after its start). */
export function pausedMs(r, now = Date.now()) {
  if (!r) return 0;
  const clip = (a, b) => Math.max(0, Math.min(b, now) - Math.max(a, r.startedAt));
  return (r.pauses || []).reduce((n, p) => n + clip(p.from, p.to), 0) + (r.pausedAt ? clip(r.pausedAt, now) : 0);
}
/** The time worked so far: since the start, pauses left out. */
export const workedMs = (r, now = Date.now()) => (r ? Math.max(0, now - r.startedAt - pausedMs(r, now)) : 0);
/** Work and pauses in order, from the start until now: [{ kind: 'work' | 'pause', from, to }]. */
export function segmentsOf(r, now = Date.now()) {
  if (!r) return [];
  const pauses = [...(r.pauses || []), ...(r.pausedAt ? [{ from: r.pausedAt, to: now, open: true }] : [])]
    .map((p) => ({ ...p, from: Math.max(p.from, r.startedAt), to: Math.min(p.to, now) })).filter((p) => p.to > p.from)
    .sort((a, b) => a.from - b.from);
  const out = [];
  let t = r.startedAt;
  for (const p of pauses) {
    if (p.from > t) out.push({ kind: 'work', from: t, to: p.from });
    out.push({ kind: 'pause', from: p.from, to: p.to, open: !!p.open });
    t = Math.max(t, p.to);
  }
  if (now > t) out.push({ kind: 'work', from: t, to: now });
  return out;
}

export const tracker = {
  async load() {
    try { const d = await api.getTime('__none__'); set({ loaded: true, running: d.running, activities: d.activities }); } catch { /* offline */ }
  },
  async start(body) { const d = await api.timeStart({ ...body, startedAt: body.startedAt || Date.now() }); set({ running: d.running, activities: d.activities }); return d.running; },
  async update(patch) { const d = await api.timeUpdateRunning(patch); set({ running: d.running }); return d.running; },
  /** Pause (now, or since `at`) / go on — the time paused doesn't count. */
  async pause(at) { const d = await api.timePause(at); set({ running: d.running }); return d.running; },
  async resume() { const d = await api.timeResume(); set({ running: d.running }); return d.running; },
  /** Stop → the new entry (or null when it ran under a minute). It ends at the start plus the time worked. */
  async stop(extra = {}) {
    const r = state.running;
    if (!r) return null;
    const now = Date.now();
    // Entries are one day at most: a tracker left running longer ends 24 h after it started (edit it after).
    const end = Math.min(r.startedAt + workedMs(r, now), r.startedAt + 24 * 3600000 - 60000);
    const d = await api.timeStop({ date: dayKey(r.startedAt), start: hhmm(r.startedAt), end: hhmm(end), ...extra });
    set({ running: null, activities: d.activities });
    return d.entry;
  },
  async discard() { const d = await api.timeStop({ discard: true }); set({ running: null, activities: d.activities }); },
  async setActivities(list) { const d = await api.setTimeActivities(list); set({ activities: d.activities }); },
  apply(d) { set({ loaded: true, running: d.running, activities: d.activities }); },
};

const subscribe = (f) => { subs.add(f); sync(); return () => subs.delete(f); };
let snap = null; let key = '';
// elapsed = the time worked (pauses left out); paused / pauseNow = a pause going on and how long so far.
const getSnapshot = () => {
  const now = Date.now();
  const r = state.running;
  const k = `${JSON.stringify(state)}|${r ? Math.floor((now - r.startedAt) / 1000) : ''}`;
  if (k !== key) {
    key = k;
    snap = { ...state, elapsed: workedMs(r, now), paused: !!r?.pausedAt, pauseNow: r?.pausedAt ? now - r.pausedAt : 0, pausedTotal: pausedMs(r, now) };
  }
  return snap;
};
export const useTimeTracker = () => useSyncExternalStore(subscribe, getSnapshot);

// Loaded once for the app, and again when the tab comes back (it may have been stopped elsewhere).
if (typeof window !== 'undefined') {
  tracker.load();
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') tracker.load(); });
}
