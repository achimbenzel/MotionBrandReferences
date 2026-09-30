// Expenses, recurring income and the "what has to come in" calculator.
// Part of the record shapes (see ../schema.js, which re-exports all of it).
import { nanoid } from 'nanoid';
import { ID, isDay, localDay, num, str } from './base.js';

// ---- Expenses: what the business costs (subscriptions, insurance …) ------------------
// The same keys as EXPENSE_CATEGORIES in src/lib/expenses.js (a test keeps them in step).
export const EXPENSE_CATEGORY_KEYS = ['software', 'insurance', 'health', 'office', 'phone', 'hardware', 'taxes', 'accounting', 'marketing', 'learning', 'travel', 'home', 'mobility', 'leisure', 'other'];
export const EXPENSE_INTERVALS = ['month', 'quarter', 'half', 'year', 'once'];
export function normalizeExpense(e) {
  const amount = Number(e?.amount);
  return {
    id: typeof e?.id === 'string' && ID.test(e.id) ? e.id : nanoid(10),
    name: str(e?.name, 120),
    category: EXPENSE_CATEGORY_KEYS.includes(e?.category) ? e.category : 'other',
    amount: Number.isFinite(amount) && amount > 0 ? Math.round(Math.min(amount, 1e9) * 100) / 100 : 0,
    interval: EXPENSE_INTERVALS.includes(e?.interval) ? e.interval : 'month',
    start: isDay(e?.start) ? e.start : localDay(), // the first payment (its day of the month is the payment day)
    end: isDay(e?.end) ? e.end : '',                                         // the last payment on or before this day ('' = runs on)
    share: Math.round(num(e?.share, 0, 100, 100)),                           // the business part, in % (the rest is private; 0 = all private)
    notice: Math.round(num(e?.notice, 0, 730, 0)),                           // days' notice to cancel before it renews
    link: str(e?.link, 500).trim(),
    notes: str(e?.notes, 2000),
    createdAt: num(e?.createdAt, 0, 1e14, 0) || Date.now(),
    updatedAt: num(e?.updatedAt, 0, 1e14, 0) || Date.now(),
  };
}
/** Money that comes in regularly — a retainer, a fixed monthly fee … (the rhythm fields work as for an expense). */
export const INCOME_INTERVALS = ['month', 'quarter', 'half', 'year'];
export function normalizeIncome(x) {
  const amount = Number(x?.amount);
  return {
    id: typeof x?.id === 'string' && ID.test(x.id) ? x.id : nanoid(10),
    name: str(x?.name, 120),
    clientId: typeof x?.clientId === 'string' && ID.test(x.clientId) ? x.clientId : '', // the client it comes from (optional)
    amount: Number.isFinite(amount) && amount > 0 ? Math.round(Math.min(amount, 1e9) * 100) / 100 : 0,
    interval: INCOME_INTERVALS.includes(x?.interval) ? x.interval : 'month',
    start: isDay(x?.start) ? x.start : localDay(),
    end: isDay(x?.end) ? x.end : '',
    notes: str(x?.notes, 2000),
    createdAt: num(x?.createdAt, 0, 1e14, 0) || Date.now(),
    updatedAt: num(x?.updatedAt, 0, 1e14, 0) || Date.now(),
  };
}
/** What you want to earn with it: your pay (net, a month), tax on profit, a reserve, your hourly rate, weeks off a year. */
export function normalizeFinance(v) {
  const o = v && typeof v === 'object' ? v : {};
  return {
    salary: Math.round(num(o.salary, 0, 1e7, 0)),
    taxRate: Math.round(num(o.taxRate, 0, 80, 30)),
    reserve: Math.round(num(o.reserve, 0, 100, 10)),
    rate: Math.round(num(o.rate, 0, 1e5, 0) * 100) / 100,
    weeksOff: Math.round(num(o.weeksOff, 0, 20, 6)),
  };
}
