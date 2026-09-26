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

export const tracker = {
  async load() {
    try { const d = await api.getTime('__none__'); set({ loaded: true, running: d.running, activities: d.activities }); } catch { /* offline */ }
  },
  async start(body) { const d = await api.timeStart({ ...body, startedAt: body.startedAt || Date.now() }); set({ running: d.running, activities: d.activities }); return d.running; },
  async update(patch) { const d = await api.timeUpdateRunning(patch); set({ running: d.running }); return d.running; },
  /** Stop → the new entry (or null when it ran under a minute). */
  async stop(extra = {}) {
    const r = state.running;
    if (!r) return null;
    const now = Date.now();
    // Entries are one day at most: a tracker left running longer ends 24 h after it started (edit it after).
    const end = Math.min(now, r.startedAt + 24 * 3600000 - 60000);
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
const getSnapshot = () => {
  const k = `${JSON.stringify(state)}|${state.running ? Math.floor((Date.now() - state.running.startedAt) / 1000) : ''}`;
  if (k !== key) { key = k; snap = { ...state, elapsed: state.running ? Date.now() - state.running.startedAt : 0 }; }
  return snap;
};
export const useTimeTracker = () => useSyncExternalStore(subscribe, getSnapshot);

// Loaded once for the app, and again when the tab comes back (it may have been stopped elsewhere).
if (typeof window !== 'undefined') {
  tracker.load();
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') tracker.load(); });
}
