// Small helpers every record shape uses (strings, numbers in range, days and times, ids).
// Part of the record shapes (see ../schema.js, which re-exports all of it).

export const str = (v, max = 2000) => String(v == null ? '' : v).slice(0, max);
export const TAG_KEYS = new Set(['red', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'gray']);
export const CURRENCIES = new Set(['EUR', 'USD', 'GBP', 'CHF', 'JPY', 'CAD', 'AUD']);
export const num = (v, min, max, fallback) => {
  const n = Number(v);
  return v !== '' && v != null && Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};
// Days (yyyy-mm-dd) and times of day (hh:mm)
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const YMD = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
export const isTimeOfDay = (v) => typeof v === 'string' && HHMM.test(v);
export const isDay = (v) => typeof v === 'string' && YMD.test(v);
/** Today as yyyy-mm-dd on this computer's clock — not UTC (which is still "yesterday" here until 1 or 2 am). */
export const localDay = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const ID = /^[\w-]{1,40}$/;
