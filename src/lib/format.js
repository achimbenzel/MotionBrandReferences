// How dates and numbers are shown — a setting (Settings → Formats, kept in
// settings.formats), Germany unless you choose otherwise. Only what's shown
// changes: days are stored as 'yyyy-mm-dd' and amounts as plain numbers,
// whatever the format.
//
// The app speaks English, so month and weekday names stay English; the German
// format puts the day first (27 Oct 2026, 27.10.2026), uses the 24-hour
// clock and writes numbers as 1.234,56 €.

export const DATE_FORMATS = [
  { key: 'de', label: 'Germany', hint: '27.10.2026 · 27 Oct · 14:05' },
  { key: 'uk', label: 'UK', hint: '27/10/2026 · 27 Oct · 14:05' },
  { key: 'us', label: 'US', hint: '10/27/2026 · Oct 27 · 2:05 PM' },
  { key: 'iso', label: 'ISO', hint: '2026-10-27 · 27 Oct · 14:05' },
];
export const NUMBER_FORMATS = [
  { key: 'de', label: 'Germany', hint: '1.234,56 €', locale: 'de-DE' },
  { key: 'ch', label: 'Switzerland', hint: '1’234.56', locale: 'de-CH' },
  { key: 'en', label: 'English', hint: '€1,234.56', locale: 'en-GB' },
];
export const FORMAT_DEFAULTS = { date: 'de', number: 'de' };

const STORE = 'confinium.formats'; // a copy for the first paint, before the settings are in
const valid = (f, base = FORMAT_DEFAULTS) => ({
  date: DATE_FORMATS.some((x) => x.key === f?.date) ? f.date : base.date,
  number: NUMBER_FORMATS.some((x) => x.key === f?.number) ? f.number : base.number,
});
let current = (() => {
  try { return valid(JSON.parse(globalThis.localStorage?.getItem(STORE) || 'null')); } catch { return { ...FORMAT_DEFAULTS }; }
})();

export const formats = () => current;
/** Use these formats from now on (from the settings); pages showing dates re-render on 'confinium:formats'. */
export function setFormats(f) {
  const next = valid(f, current); // what isn't a known format stays as it was
  if (next.date === current.date && next.number === current.number) return;
  current = next;
  try { globalThis.localStorage?.setItem(STORE, JSON.stringify(next)); } catch { /* private window */ }
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('confinium:formats', { detail: next }));
}

const numberLocale = () => NUMBER_FORMATS.find((x) => x.key === current.number).locale;
// A format with names (a month or weekday spelt out) or only numbers.
const hasWords = (o) => !!o.weekday || ['short', 'long', 'narrow'].includes(o.month) || !!o.era;
const pad = (n) => String(n).padStart(2, '0');

const sep = (s) => s.replace(/\bSept\b/g, 'Sep'); // British English says "Sept"; everywhere else in the app it's "Sep"

/** A Date (or timestamp) as a date, with Intl options — e.g. { day: 'numeric', month: 'short' }. */
export function fmtDate(d, opts) {
  const t = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(t.getTime())) return '';
  const o = opts || { day: '2-digit', month: '2-digit', year: 'numeric' };
  const f = current.date;
  if (f === 'us') return t.toLocaleDateString('en-US', o);
  if (hasWords(o) || f === 'uk') return sep(t.toLocaleDateString('en-GB', o));
  if (f === 'iso') { // numbers only: year-month-day, with whichever parts were asked for
    const parts = [o.year && t.getFullYear(), o.month && pad(t.getMonth() + 1), o.day && pad(t.getDate())].filter(Boolean);
    return parts.join('-');
  }
  return t.toLocaleDateString('de-DE', { ...o, ...(o.day ? { day: '2-digit' } : {}), ...(o.month ? { month: '2-digit' } : {}) });
}
/** A Date (or timestamp) as a time of day — 14:05, or 2:05 PM in the US format. */
export function fmtTime(d, opts = { hour: '2-digit', minute: '2-digit' }) {
  const t = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(t.getTime())) return '';
  return current.date === 'us' ? t.toLocaleTimeString('en-US', { ...opts, hour: 'numeric' }) : t.toLocaleTimeString('en-GB', { ...opts, hourCycle: 'h23' });
}
/** A month's name (0 = January) — 'short' or 'long'. */
export const monthName = (i, style = 'short') => sep(new Date(2024, i, 1).toLocaleDateString('en-GB', { month: style }));
/** A weekday's name, Monday first (0 = Monday) — 'short' or 'long'. */
export const weekdayName = (i, style = 'short') => new Date(2024, 0, 1 + i).toLocaleDateString('en-GB', { weekday: style }); // 1 Jan 2024 was a Monday

/** A number in the chosen format, with Intl options (digits …). */
export function fmtNumber(v, opts = {}) {
  const n = Number(v);
  if (!Number.isFinite(n)) return '';
  try { return new Intl.NumberFormat(numberLocale(), opts).format(n); } catch { return String(n); }
}
/** A whole number: 12.345 */
export const fmtInt = (v) => fmtNumber(Math.round(Number(v) || 0), { maximumFractionDigits: 0 });
/** A number with a fixed number of decimals: 12,5 → '12,50' with 2. */
export const fmtFixed = (v, digits = 1) => fmtNumber(v, { minimumFractionDigits: digits, maximumFractionDigits: digits });
/** Up to `digits` decimals, none when it's whole: 12,5 · 12 */
export const fmtDec = (v, digits = 1) => fmtNumber(v, { maximumFractionDigits: digits });
/** A number for an input field to edit, in the chosen format and without grouping: 1234,5 */
export const fmtInput = (v, digits = 2) => (v == null || v === '' || !Number.isFinite(Number(v)) ? '' : fmtNumber(v, { useGrouping: false, maximumFractionDigits: digits }));
/** Money: 1.234,56 € (whole yen). */
export function fmtCurrency(v, currency = 'EUR', opts = {}) {
  const n = Number(v);
  if (v == null || !Number.isFinite(n)) return '';
  try {
    return new Intl.NumberFormat(numberLocale(), { style: 'currency', currency, currencyDisplay: 'narrowSymbol', maximumFractionDigits: currency === 'JPY' ? 0 : 2, ...opts }).format(n);
  } catch { return `${n.toFixed(2)} ${currency}`; }
}
/** The currency's sign on its own (€, $, CHF). */
export function currencySign(currency = 'EUR') {
  try { return new Intl.NumberFormat(numberLocale(), { style: 'currency', currency, currencyDisplay: 'narrowSymbol' }).formatToParts(0).find((x) => x.type === 'currency')?.value || currency; } catch { return currency; }
}
/** A file size: 1,2 MB */
export function fmtBytes(n) {
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  let v = Number(n) || 0; let i = 0;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i += 1; }
  return `${fmtNumber(v, { maximumFractionDigits: v < 10 && i > 0 ? 1 : 0 })} ${u[i]}`;
}

/**
 * A number typed in any of the usual ways → a number (NaN when it isn't one):
 * "66,45", "66.45", "1.234,56", "1,234.56", "1’234.5", "1 234", "€ 12". With
 * both marks the last one is the decimal mark; a lone mark followed by exactly
 * three digits groups thousands where that's the custom (1.234 in Germany,
 * 1,234 in English), anything else is a decimal mark.
 */
export function parseNum(input, fallback = NaN) {
  if (typeof input === 'number') return Number.isFinite(input) ? input : fallback;
  let s = String(input ?? '').trim().replace(/[\s\u00a0\u202f'’€$£%]|CHF|EUR|USD|GBP/gi, '');
  if (!s) return fallback;
  const dot = s.lastIndexOf('.');
  const comma = s.lastIndexOf(',');
  if (dot >= 0 && comma >= 0) {
    const [group, dec] = dot > comma ? [',', '.'] : ['.', ','];
    s = s.split(group).join('').replace(dec, '.');
  } else if (dot >= 0 || comma >= 0) {
    const mark = dot >= 0 ? '.' : ',';
    const parts = s.split(mark);
    const groupsHere = mark === '.' ? current.number === 'de' : current.number === 'en';
    const lead = parts[0].replace('-', '');
    const grouped = parts.length > 2 || (groupsHere && parts[1].length === 3 && lead !== '' && lead !== '0');
    s = grouped ? parts.join('') : parts.join('.');
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : fallback;
}
