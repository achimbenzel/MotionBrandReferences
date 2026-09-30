// Settings: dashboard focus, weekly to-dos, layout, picture uploads.
// Part of the record shapes (see ../schema.js, which re-exports all of it).
import { nanoid } from 'nanoid';
import { TYPES } from '../config.js';
import { num, str } from './base.js';

// ---------------------------------------------------------------------------
// Dashboard: today's focus (pinned to-dos) and the widget layout
// ---------------------------------------------------------------------------
const DASH_ID = /^[\w-]{1,40}$/;
const DASH_DAY = /^\d{4}-\d{2}-\d{2}$/;
/** Up to 5 pinned to-dos: a board card { kind: 'card', id } or a plan to-do { kind: 'todo', planId, blockId, itemId }. */
export function normalizeDashboardFocus(v) {
  const items = (Array.isArray(v?.items) ? v.items : []).map((it) => {
    const doneOn = typeof it?.doneOn === 'string' && DASH_DAY.test(it.doneOn) ? { doneOn: it.doneOn } : {};
    if (it?.kind === 'card' && DASH_ID.test(it.id || '')) return { kind: 'card', id: it.id, ...doneOn };
    if (it?.kind === 'todo' && [it.planId, it.blockId, it.itemId].every((x) => DASH_ID.test(x || ''))) {
      return { kind: 'todo', planId: it.planId, blockId: it.blockId, itemId: it.itemId, ...doneOn };
    }
    return null;
  }).filter(Boolean);
  const seen = new Set();
  return { items: items.filter((it) => { const k = JSON.stringify([it.kind, it.id, it.itemId]); if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 5) };
}
/**
 * Weekly to-dos (apart from the board): something for a weekday — every Sunday
 * "Backup" — { id, day (0 = Monday … 6 = Sunday), text, doneOn (the date it was
 * last ticked; it's open again the next week) }.
 */
export function normalizeWeeklyTodos(v) {
  const seen = new Set();
  return (Array.isArray(v) ? v : []).filter((t) => t && typeof t === 'object').slice(0, 70).map((t) => {
    const id = typeof t.id === 'string' && DASH_ID.test(t.id) && !seen.has(t.id) ? t.id : nanoid(8);
    seen.add(id);
    return {
      id, day: Number.isInteger(t.day) && t.day >= 0 && t.day <= 6 ? t.day : 0, text: str(t.text, 200),
      doneOn: typeof t.doneOn === 'string' && DASH_DAY.test(t.doneOn) ? t.doneOn : '',
    };
  });
}
/** Picture uploads: made smaller in the browser first — ask each time, always, or never; format, long edge, quality. */
const IMAGE_MODES = ['ask', 'auto', 'off'];
const IMAGE_FORMATS = ['webp', 'jpeg', 'keep'];
const IMAGE_EDGES = [0, 1280, 1920, 2560, 3840];
export function normalizeImageUploads(v) {
  const o = v && typeof v === 'object' ? v : {};
  return {
    mode: IMAGE_MODES.includes(o.mode) ? o.mode : 'ask',
    format: IMAGE_FORMATS.includes(o.format) ? o.format : 'webp',
    maxEdge: IMAGE_EDGES.includes(Number(o.maxEdge)) ? Number(o.maxEdge) : 2560,
    quality: Math.round(num(o.quality, 50, 100, 85)),
  };
}
export const DASHBOARD_WIDGETS = ['focus', 'weekly', 'timer', 'next', 'continue', 'urgent', 'tools', 'pipeline', 'money', 'rhythm', 'inspiration', 'note', 'achievements'];
/** The dashboard's widgets in your order: [{ id, hidden, size: 'full' | 'half' }] (unknown ones dropped; [] = the default). */
export function normalizeDashboardLayout(v) {
  const seen = new Set();
  return (Array.isArray(v) ? v : []).filter((w) => w && DASHBOARD_WIDGETS.includes(w.id) && !seen.has(w.id) && seen.add(w.id))
    .map((w) => {
      const out = { id: w.id, hidden: !!w.hidden, size: w.size === 'half' ? 'half' : 'full' };
      // Inspiration: the Reference sections it draws from (none = all of them).
      if (w.id === 'inspiration' && Array.isArray(w.sources)) {
        const sources = [...new Set(w.sources.filter((t) => TYPES.has(t)))];
        if (sources.length) out.sources = sources;
      }
      return out;
    });
}
