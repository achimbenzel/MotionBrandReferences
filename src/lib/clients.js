// Clients and what belongs to them: who a time entry is for, a project's
// budget, money, birthdays. Shared by the client pages, projects, the Time
// Tracker and the dashboard.
import { useEffect, useState } from 'react';
import { api } from './api.js';
import { dayKey } from './timeTracker.js';
import { fmtCurrency, fmtDec } from './format.js';

// The currency rates and invoices are in (Settings), loaded once.
let currencyP = null;
export const loadCurrency = () => (currencyP ||= api.getSettings().then((s) => s?.currency || 'EUR').catch(() => 'EUR'));
export const rememberCurrency = (c) => { currencyP = Promise.resolve(c); };
export function useCurrency() {
  const [c, setC] = useState('EUR');
  useEffect(() => { let alive = true; loadCurrency().then((v) => { if (alive) setC(v); }); return () => { alive = false; }; }, []);
  return c;
}

export const minutesOf = (e) => {
  const t = (x) => { const [h, m] = x.split(':').map(Number); return h * 60 + m; };
  return (t(e.end) - t(e.start) + 1440) % 1440;
};
export const fmtHours = (min) => `${fmtDec(min / 60, 1)} h`;

/** Who an entry is for → { plan, client, project } (a project's client, or the entry's own). */
export function whoOf(e, planById, clientById) {
  const plan = e.planId ? planById[e.planId] || null : null;
  const clientId = plan ? plan.clientId : e.clientId;
  return { plan, client: clientId ? clientById[clientId] || null : null, project: plan ? plan.name : e.project || '' };
}
/** "Client · Project", "Client", a free name, or '' — how an entry reads in lists. */
export function entryLabel(e, planById, clientById) {
  const { plan, client, project } = whoOf(e, planById, clientById);
  if (plan) return client ? `${client.name} · ${plan.name}` : plan.name;
  if (client) return project ? `${client.name} · ${project}` : client.name;
  return project;
}

/** The entries that count for a project's budget: all of them, or this month's for a monthly one. */
export function budgetMinutes(plan, entries, runningMin = 0) {
  if (!plan?.budget) return 0;
  const month = dayKey().slice(0, 7);
  return entries.filter((e) => e.planId === plan.id && (plan.budget.per !== 'month' || e.date.startsWith(month)))
    .reduce((n, e) => n + minutesOf(e), 0) + runningMin;
}
/** → { used, of, ratio, level: 'ok' | 'warn' | 'over' } for a project with a budget. */
export function budgetState(plan, usedMin) {
  if (!plan?.budget) return null;
  const of = plan.budget.hours * 60;
  const ratio = of ? usedMin / of : 0;
  return { used: usedMin, of, ratio, level: ratio > 1 ? 'over' : ratio >= 0.8 ? 'warn' : 'ok' };
}
export const budgetText = (plan, usedMin) => (plan?.budget
  ? `${fmtDec(usedMin / 60, 1)} / ${fmtDec(plan.budget.hours, 2)} h${plan.budget.per === 'month' ? ' this month' : ''}`
  : '');

/** Money in the chosen number format — 1.234,56 €. */
export const fmtMoney = (v, currency = 'EUR') => (v == null || !Number.isFinite(v) ? '' : fmtCurrency(v, currency));
/** Hours × the project's rate. */
export const amountOf = (min, rate) => (rate ? Math.round((min / 60) * rate * 100) / 100 : null);

/** The next birthday on or after `from` (a Date at midnight) → Date; 29 Feb falls on 28 Feb in other years. */
export function nextBirthday(iso, from = new Date(new Date().setHours(0, 0, 0, 0))) {
  if (!/^\d{4}-\d\d-\d\d$/.test(iso || '')) return null;
  const [, m, d] = iso.split('-').map(Number);
  const on = (y) => { const last = new Date(y, m, 0).getDate(); return new Date(y, m - 1, Math.min(d, last)); };
  const t = on(from.getFullYear());
  return t < from ? on(from.getFullYear() + 1) : t;
}
/** How old someone turns on their next birthday (when the year is a real one). */
export function turnsOn(iso, when) {
  const y = Number(iso.slice(0, 4));
  return y > 1900 && y <= when.getFullYear() ? when.getFullYear() - y : null;
}
/** Every contact's birthday in the next `days` days → [{ date (iso), client, contact, age }]. */
export function upcomingBirthdays(clients, days = 14, from = new Date(new Date().setHours(0, 0, 0, 0))) {
  const until = new Date(from); until.setDate(from.getDate() + days);
  const out = [];
  for (const c of clients || []) {
    for (const p of c.contacts || []) {
      const next = nextBirthday(p.birthday, from);
      if (next && next <= until) out.push({ date: dayKey(next), client: c, contact: p, age: turnsOn(p.birthday, next) });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}
