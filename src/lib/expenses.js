// Expenses: what the business costs — subscriptions, insurance, hardware … —
// and, if you like, what you pay privately; when each is paid, what a year
// comes to (business part, private part, both), and what has to come in each
// month to cover it (and pay you). Plain functions, used by the app and by
// the server's Excel export alike.
import { dayKey, addDays } from './dates.js';

export const EXPENSE_CATEGORIES = [
  { key: 'software', label: 'Software & subscriptions', color: '#a78bfa' },
  { key: 'insurance', label: 'Insurance', color: '#38bdf8' },
  { key: 'health', label: 'Health & pension', color: '#34d399' },
  { key: 'office', label: 'Office & rent', color: '#fb923c' },
  { key: 'phone', label: 'Phone & internet', color: '#2ec5d3' },
  { key: 'hardware', label: 'Hardware', color: '#f472b6' },
  { key: 'taxes', label: 'Taxes & fees', color: '#facc15' },
  { key: 'accounting', label: 'Bank & accounting', color: '#94a3b8' },
  { key: 'marketing', label: 'Marketing', color: '#f87171' },
  { key: 'learning', label: 'Learning', color: '#c084fc' },
  { key: 'travel', label: 'Travel', color: '#4ade80' },
  { key: 'home', label: 'Home & living', color: '#d6a36b' },
  { key: 'mobility', label: 'Car & transport', color: '#60a5fa' },
  { key: 'leisure', label: 'Leisure & streaming', color: '#e879f9' },
  { key: 'other', label: 'Other', color: '#8b93a7' },
];
export const categoryOf = (key) => EXPENSE_CATEGORIES.find((c) => c.key === key) || EXPENSE_CATEGORIES[EXPENSE_CATEGORIES.length - 1];

export const INTERVALS = [
  { key: 'month', label: 'Monthly', per: 'month', months: 1 },
  { key: 'quarter', label: 'Quarterly', per: 'quarter', months: 3 },
  { key: 'half', label: 'Every 6 months', per: 'half year', months: 6 },
  { key: 'year', label: 'Yearly', per: 'year', months: 12 },
  { key: 'once', label: 'One-time', per: '', months: 0 },
];
export const intervalOf = (key) => INTERVALS.find((i) => i.key === key) || INTERVALS[0];

// Business, private or both: which part of each expense counts.
export const VIEWS = [
  { key: 'business', label: 'Business' },
  { key: 'private', label: 'Private' },
  { key: 'both', label: 'Both' },
];
/** The part of `e` that counts in a view (0…1): its business share, the rest, or all of it. */
export const partOf = (e, view = 'business') => {
  const b = (e.share ?? 100) / 100;
  return view === 'private' ? 1 - b : view === 'both' ? 1 : b;
};
/** Does `e` show up in a view at all (a private-only one not under Business, a business-only one not under Private)? */
export const inView = (e, view = 'business') => view === 'both' || partOf(e, view) > 0;

// Names to start from when typing a new one (their category comes along — and for private ones, 0 % business).
export const EXPENSE_IDEAS = [
  ['Adobe Creative Cloud', 'software'], ['Maxon One / Cinema 4D', 'software'], ['Figma', 'software'], ['Frame.io', 'software'],
  ['Envato Elements', 'software'], ['Artlist / Musicbed', 'software'], ['Google Workspace', 'software'], ['Notion', 'software'],
  ['Dropbox / Cloud storage', 'software'], ['Domain & hosting', 'software'], ['ChatGPT / Claude', 'software'], ['Plugins (Aescripts)', 'software'],
  ['Betriebshaftpflicht', 'insurance'], ['Berufsunfähigkeit', 'insurance'], ['Elektronikversicherung', 'insurance'], ['Rechtsschutz', 'insurance'],
  ['Krankenversicherung', 'health'], ['Rentenversicherung', 'health'], ['Künstlersozialkasse', 'health'],
  ['Büro / Coworking', 'office'], ['Mobilfunk', 'phone'], ['Internet', 'phone'],
  ['Steuerberater', 'accounting'], ['Geschäftskonto', 'accounting'], ['Buchhaltungssoftware', 'accounting'], ['IHK-Beitrag', 'taxes'],
  ['Portfolio / Behance Pro', 'marketing'], ['Online-Kurse', 'learning'],
  ['Miete / Wohnung', 'home', 0], ['Strom & Gas', 'home', 0], ['Hausratversicherung', 'insurance', 0], ['Privathaftpflicht', 'insurance', 0],
  ['Kfz-Versicherung', 'insurance', 0], ['Auto / Leasing', 'mobility', 0], ['Deutschlandticket', 'mobility', 0],
  ['Netflix', 'leisure', 0], ['Spotify', 'leisure', 0], ['Fitnessstudio', 'leisure', 0],
];

const pad = (n) => String(n).padStart(2, '0');
const iso = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
export const isDayStr = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
export const todayIso = () => dayKey();

/** Every day `e` is paid between `from` and `to` (inclusive, yyyy-mm-dd) — the day of the month of its start, or the month's last. */
export function paymentsIn(e, from, to) {
  if (!e || !isDayStr(e.start) || !(e.amount > 0)) return [];
  if (e.interval === 'once') return e.start >= from && e.start <= to && (!e.end || e.start <= e.end) ? [e.start] : [];
  const step = intervalOf(e.interval).months || 1;
  const [y, m, d] = e.start.split('-').map(Number);
  const [fy, fm] = from.split('-').map(Number);
  const gap = (fy - y) * 12 + (fm - m);
  const out = [];
  for (let k = Math.max(0, Math.floor(gap / step) - 1); k < 100000; k += 1) {
    const mm = m - 1 + k * step;
    const yy = y + Math.floor(mm / 12);
    const mon = ((mm % 12) + 12) % 12;
    const date = iso(yy, mon + 1, Math.min(d, new Date(yy, mon + 1, 0).getDate()));
    if (date > to || (e.end && date > e.end)) break;
    if (date >= from) out.push(date);
  }
  return out;
}
/** What it costs in a year — all of it, the business part (its share) and the private rest. */
export function yearOf(e, year) {
  const n = paymentsIn(e, `${year}-01-01`, `${year}-12-31`).length;
  const all = n * (e.amount || 0);
  const business = all * (e.share ?? 100) / 100;
  return { count: n, all, business, private: all - business };
}
/** Per month, for a recurring one (a yearly 120 → 10); a one-time one → 0. */
export const monthlyOf = (e) => (e.interval === 'once' ? 0 : (e.amount || 0) / (intervalOf(e.interval).months || 1));
/** The next day it's paid, from `from` on (up to two years ahead), or ''. */
export function nextPayment(e, from = todayIso()) {
  const [y, m, d] = from.split('-').map(Number);
  return paymentsIn(e, from, iso(y + 2, m, d))[0] || '';
}
/** Still running on that day (started, not ended — a one-time one only on its day and before). */
export const isActive = (e, day = todayIso()) => (e.interval === 'once' ? e.start >= day : !e.end || e.end >= day);
/** The last day to cancel before it renews (its next payment minus the notice), or ''. */
export function cancelBy(e, from = todayIso()) {
  if (!e.notice || e.interval === 'once') return '';
  const next = nextPayment(e, from);
  if (!next) return '';
  return addDays(next, -e.notice);
}

/** Each month of a year: what's paid (all, the business part, the private rest) → [{ month: 1…12, all, business, private, items: [{ e, date }] }]. */
export function monthsOf(list, year) {
  const months = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, all: 0, business: 0, private: 0, items: [] }));
  for (const e of list) {
    for (const date of paymentsIn(e, `${year}-01-01`, `${year}-12-31`)) {
      const m = months[Number(date.slice(5, 7)) - 1];
      const business = e.amount * (e.share ?? 100) / 100;
      m.all += e.amount; m.business += business; m.private += e.amount - business;
      m.items.push({ e, date });
    }
  }
  return months;
}

/**
 * What has to come in each month, for a view:
 * - business — the business costs (⌀ over the year);
 * - private — what you take home: your pay, or your private costs if they're
 *   more (or no pay is set) — before tax: ÷ (1 − tax on profit);
 * - both — the two together.
 * A reserve goes on top. Recurring income (retainers) already covers part of
 * it: `rest` is what's still to find. → { view, costs, need, needIsPrivate,
 * gross, tax, reserve, total, income, rest, hours, weekHours, restHours }
 */
export function targetFor(view, monthly = {}, f = {}, income = 0) {
  const taxRate = Math.min(0.8, Math.max(0, (f.taxRate || 0) / 100));
  const costs = view === 'private' ? 0 : Math.max(0, monthly.business || 0);
  const pay = Math.max(0, f.salary || 0);
  const priv = Math.max(0, monthly.private || 0);
  const need = view === 'business' ? 0 : Math.max(pay, priv);
  const gross = need / (1 - taxRate);
  const base = costs + gross;
  const reserve = base * Math.max(0, f.reserve || 0) / 100;
  const total = base + reserve;
  const rest = Math.max(0, total - Math.max(0, income));
  const perHour = (v) => (f.rate > 0 ? v / f.rate : null);
  const hours = perHour(total);
  const weeks = 52 - Math.min(20, Math.max(0, f.weeksOff ?? 6));
  return {
    view, costs, need, needIsPrivate: need > 0 && priv > pay, gross, tax: gross - need, reserve, total,
    income: Math.max(0, income), rest, hours, weekHours: hours == null ? null : (hours * 12) / weeks, restHours: perHour(rest),
  };
}
/** The same for business costs and your pay alone (no private costs, no income) → { costs, pay, gross, tax, reserve, total, hours, weekHours }. */
export function targetOf(monthlyCosts, f = {}) {
  const t = targetFor('both', { business: monthlyCosts, private: 0 }, f);
  return { costs: t.costs, pay: t.need, gross: t.gross, tax: t.tax, reserve: t.reserve, total: t.total, hours: t.hours, weekHours: t.weekHours };
}

// ---- Recurring income: retainers and other money that comes in regularly (same rhythm fields as an expense).
export const INCOME_INTERVALS = INTERVALS.filter((i) => i.key !== 'once');
/** What comes in each month of a year → [12 sums], and the items per month. */
export function incomeMonthsOf(list, year) {
  const months = Array.from({ length: 12 }, () => ({ sum: 0, items: [] }));
  for (const x of list || []) {
    for (const date of paymentsIn(x, `${year}-01-01`, `${year}-12-31`)) {
      const m = months[Number(date.slice(5, 7)) - 1];
      m.sum += x.amount; m.items.push({ x, date });
    }
  }
  return months;
}
/** What comes in a month from what's running on that day (a quarterly 900 → 300). */
export const incomeNow = (list, day = todayIso()) => (list || [])
  .filter((x) => x.start <= day && (!x.end || x.end >= day))
  .reduce((n, x) => n + (x.amount || 0) / (intervalOf(x.interval).months || 1), 0);
