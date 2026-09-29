// Expenses: what the business costs — subscriptions, insurance, hardware … —
// when each is paid, what a year comes to, and what has to come in each
// month to cover it (and pay you). Plain functions, used by the app and by
// the server's Excel export alike.

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

// Names to start from when typing a new one (their category comes along).
export const EXPENSE_IDEAS = [
  ['Adobe Creative Cloud', 'software'], ['Maxon One / Cinema 4D', 'software'], ['Figma', 'software'], ['Frame.io', 'software'],
  ['Envato Elements', 'software'], ['Artlist / Musicbed', 'software'], ['Google Workspace', 'software'], ['Notion', 'software'],
  ['Dropbox / Cloud storage', 'software'], ['Domain & hosting', 'software'], ['ChatGPT / Claude', 'software'], ['Plugins (Aescripts)', 'software'],
  ['Betriebshaftpflicht', 'insurance'], ['Berufsunfähigkeit', 'insurance'], ['Elektronikversicherung', 'insurance'], ['Rechtsschutz', 'insurance'],
  ['Krankenversicherung', 'health'], ['Rentenversicherung', 'health'], ['Künstlersozialkasse', 'health'],
  ['Büro / Coworking', 'office'], ['Mobilfunk', 'phone'], ['Internet', 'phone'],
  ['Steuerberater', 'accounting'], ['Geschäftskonto', 'accounting'], ['Buchhaltungssoftware', 'accounting'], ['IHK-Beitrag', 'taxes'],
  ['Portfolio / Behance Pro', 'marketing'], ['Online-Kurse', 'learning'],
];

const pad = (n) => String(n).padStart(2, '0');
const iso = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
export const isDayStr = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
export const todayIso = () => { const d = new Date(); return iso(d.getFullYear(), d.getMonth() + 1, d.getDate()); };

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
/** What it costs in a year — all of it, and the business part (its share). */
export function yearOf(e, year) {
  const n = paymentsIn(e, `${year}-01-01`, `${year}-12-31`).length;
  const all = n * (e.amount || 0);
  return { count: n, all, business: all * (e.share ?? 100) / 100 };
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
  const [y, m, d] = next.split('-').map(Number);
  const t = new Date(y, m - 1, d - e.notice);
  return iso(t.getFullYear(), t.getMonth() + 1, t.getDate());
}

/** Each month of a year: what's paid (all and the business part) → [{ month: 1…12, all, business, items: [{ e, date }] }]. */
export function monthsOf(list, year) {
  const months = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, all: 0, business: 0, items: [] }));
  for (const e of list) {
    for (const date of paymentsIn(e, `${year}-01-01`, `${year}-12-31`)) {
      const m = months[Number(date.slice(5, 7)) - 1];
      m.all += e.amount; m.business += e.amount * (e.share ?? 100) / 100;
      m.items.push({ e, date });
    }
  }
  return months;
}

/**
 * What has to come in each month: the costs (business part, ⌀ over the
 * year), plus your pay before tax — pay ÷ (1 − tax on profit) — plus a
 * reserve on top. → { costs, pay, gross, tax, reserve, total, hours, weekHours }
 */
export function targetOf(monthlyCosts, f = {}) {
  const tax = Math.min(0.8, Math.max(0, (f.taxRate || 0) / 100));
  const pay = Math.max(0, f.salary || 0);
  const gross = pay / (1 - tax);
  const base = monthlyCosts + gross;
  const reserve = base * Math.max(0, f.reserve || 0) / 100;
  const total = base + reserve;
  const hours = f.rate > 0 ? total / f.rate : null;
  const weeks = 52 - Math.min(20, Math.max(0, f.weeksOff ?? 6));
  return { costs: monthlyCosts, pay, gross, tax: gross - pay, reserve, total, hours, weekHours: hours == null ? null : (hours * 12) / weeks };
}
