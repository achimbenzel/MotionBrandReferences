// Days as 'yyyy-mm-dd' on the local calendar (never UTC — that's still
// "yesterday" in Germany until 1 or 2 am) and how they're shown (in the
// chosen format, see format.js).
import { fmtDate } from './format.js';

const pad = (n) => String(n).padStart(2, '0');

/** A Date or timestamp → 'yyyy-mm-dd' on the local calendar; today without one. */
export const dayKey = (d = new Date()) => {
  const t = d instanceof Date ? d : new Date(d);
  return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`;
};
/** 'yyyy-mm-dd' → a local Date at midnight (null when it isn't a day). */
export const dateOf = (iso) => {
  const [y, m, d] = String(iso || '').split('-').map(Number);
  return y && m && d ? new Date(y, m - 1, d) : null;
};
/** 'yyyy-mm-dd' plus n days (n may be negative) → 'yyyy-mm-dd'. */
export const addDays = (iso, n) => { const t = dateOf(iso); t.setDate(t.getDate() + n); return dayKey(t); };
/** Whole days from today to 'yyyy-mm-dd' (negative = past; NaN when it isn't a day). */
export const daysFromToday = (iso) => { const t = dateOf(iso); return t ? Math.round((t - dateOf(dayKey())) / 86400000) : NaN; };
/** 'yyyy-mm-dd' in the chosen format — e.g. "Tue 30 Sep" (Intl options pick the parts). */
export const fmtDay = (iso, opts = { weekday: 'short', day: 'numeric', month: 'short' }) => { const t = dateOf(iso); return t ? fmtDate(t, opts) : ''; };
