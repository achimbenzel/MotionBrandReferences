// Time tracking: entries and the running tracker.
// Part of the record shapes (see ../schema.js, which re-exports all of it).
import { nanoid } from 'nanoid';
import { ID, isDay, isTimeOfDay, localDay, num, str } from './base.js';

// ---------------------------------------------------------------------------
// Time tracker: entries (a date, from–to, a plan or a free project / client,
// an activity, details) and the one that's running
// ---------------------------------------------------------------------------
export const DEFAULT_ACTIVITIES = ['Design', 'Animation', 'Storyboard', 'After Effects', 'Website', 'Meeting', 'Research', 'Admin'];
/** Minutes from start to end (an end before the start is on the next day). */
export const entryMinutes = (e) => {
  const [a, b] = [e.start, e.end].map((t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; });
  return (b - a + 1440) % 1440;
};
export function normalizeTimeEntry(e) {
  return {
    id: typeof e?.id === 'string' && ID.test(e.id) ? e.id : nanoid(10),
    date: isDay(e?.date) ? e.date : localDay(),
    start: isTimeOfDay(e?.start) ? e.start : '09:00',
    end: isTimeOfDay(e?.end) ? e.end : (isTimeOfDay(e?.start) ? e.start : '09:00'),
    planId: typeof e?.planId === 'string' && ID.test(e.planId) ? e.planId : null,
    clientId: typeof e?.clientId === 'string' && ID.test(e.clientId) ? e.clientId : null, // time for a client, not for one of its projects
    project: str(e?.project, 160),    // a project / client without a plan (or as it was called)
    activity: str(e?.activity, 60),
    details: str(e?.details, 2000),
    pause: Math.round(num(e?.pause, 0, 1440, 0)), // minutes paused while it was tracked (not in start–end)
    createdAt: num(e?.createdAt, 0, 1e14, 0) || Date.now(),
    updatedAt: num(e?.updatedAt, 0, 1e14, 0) || Date.now(),
  };
}
/** Milliseconds a running tracker has been paused up to `now` (only what lies after its start). */
export function pausedMs(r, now = Date.now()) {
  if (!r) return 0;
  const clip = (a, b) => Math.max(0, Math.min(b, now) - Math.max(a, r.startedAt));
  return (r.pauses || []).reduce((n, p) => n + clip(p.from, p.to), 0) + (r.pausedAt ? clip(r.pausedAt, now) : 0);
}
export function normalizeTimeTracker(t) {
  const r = t?.running;
  const running = r && Number.isFinite(r.startedAt) && r.startedAt > 0 ? {
    startedAt: Math.round(r.startedAt),
    planId: typeof r.planId === 'string' && ID.test(r.planId) ? r.planId : null,
    clientId: typeof r.clientId === 'string' && ID.test(r.clientId) ? r.clientId : null,
    project: str(r.project, 160), activity: str(r.activity, 60), details: str(r.details, 2000),
    pausedAt: Number.isFinite(r.pausedAt) && r.pausedAt > 0 ? Math.round(r.pausedAt) : 0, // paused since (0 = running)
    pauses: (Array.isArray(r.pauses) ? r.pauses : [])                                      // the pauses taken so far
      .filter((x) => x && Number.isFinite(x.from) && Number.isFinite(x.to) && x.to > x.from).slice(-200)
      .map((x) => ({ from: Math.round(x.from), to: Math.round(x.to) })),
  } : null;
  const seen = new Set();
  const activities = (Array.isArray(t?.activities) ? t.activities : DEFAULT_ACTIVITIES)
    .map((a) => str(a, 60).trim()).filter((a) => a && !seen.has(a.toLowerCase()) && seen.add(a.toLowerCase())).slice(0, 40);
  return { running, activities };
}
