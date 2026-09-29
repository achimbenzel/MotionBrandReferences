// Expenses (Work mode): what the business costs — subscriptions, insurance,
// hardware … (and what you pay privately) — with the invoices from your
// clients and the money that comes in regularly (retainers) to hold them
// against, and a year as an Excel workbook for your tax advisor.
import { nanoid } from 'nanoid';
import { readDB, mutateDB } from '../db.js';
import { normalizeExpense, normalizeIncome } from '../schema.js';
import { createRouter, HttpError } from '../http.js';
import { buildXlsx, excelDate } from '../xlsx.js';
import { styles, LOOK } from './time.js';
import { categoryOf, intervalOf, paymentsIn, yearOf } from '../../src/lib/expenses.js';

const router = createRouter();
export default router;

const EDITABLE = ['name', 'category', 'amount', 'interval', 'start', 'end', 'share', 'notice', 'link', 'notes'];
const sorted = (list) => [...list].sort((a, b) => a.category.localeCompare(b.category) || b.amount - a.amount);
// Every invoice (date, amount, paid or not) — what came in, for "earned this month".
const invoicesOf = (db) => (db.clients || []).flatMap((c) => (c.invoices || []).filter((i) => i.date && i.amount != null)
  .map((i) => ({ date: i.date, amount: i.amount, status: i.status, client: c.name })));

router.get('/api/expenses', async (_req, res) => {
  const db = await readDB();
  res.json({
    expenses: sorted(db.expenses), income: [...db.income].sort((a, b) => b.amount - a.amount), finance: db.settings.finance,
    invoices: invoicesOf(db), clients: (db.clients || []).map((c) => ({ id: c.id, name: c.name })), currency: db.settings.currency || 'EUR',
  });
});

router.post('/api/expenses', async (req, res) => {
  const b = req.body || {};
  if (!String(b.name || '').trim()) throw new HttpError(400, 'name_required', 'Give it a name.');
  const expense = await mutateDB((db) => {
    const now = Date.now();
    const e = normalizeExpense({ ...Object.fromEntries(EDITABLE.filter((k) => k in b).map((k) => [k, b[k]])), id: nanoid(10), createdAt: now, updatedAt: now });
    db.expenses.push(e);
    return e;
  });
  res.status(201).json({ expense });
});

router.patch('/api/expenses/:id', async (req, res) => {
  const b = req.body || {};
  const expense = await mutateDB((db) => {
    const i = db.expenses.findIndex((x) => x.id === req.params.id);
    if (i === -1) return null;
    const next = { ...db.expenses[i] };
    for (const k of EDITABLE) if (k in b) next[k] = b[k];
    if ('name' in b && !String(b.name || '').trim()) next.name = db.expenses[i].name; // a name stays
    db.expenses[i] = normalizeExpense({ ...next, updatedAt: Date.now() });
    return db.expenses[i];
  });
  if (!expense) return res.status(404).json({ error: 'not_found' });
  res.json({ expense });
});

router.delete('/api/expenses/:id', async (req, res) => {
  const trashId = nanoid(10);
  const ok = await mutateDB((db) => {
    const i = db.expenses.findIndex((x) => x.id === req.params.id);
    if (i === -1) return false;
    const [e] = db.expenses.splice(i, 1);
    db.trash.unshift({ trashId, kind: 'expense', deletedAt: Date.now(), data: e });
    return true;
  });
  if (!ok) return res.status(404).json({ error: 'not_found' });
  res.json({ trashId });
});

// ---- Recurring income (retainers …)
const INCOME_EDITABLE = ['name', 'clientId', 'amount', 'interval', 'start', 'end', 'notes'];
router.post('/api/income', async (req, res) => {
  const b = req.body || {};
  if (!String(b.name || '').trim()) throw new HttpError(400, 'name_required', 'Give it a name.');
  const income = await mutateDB((db) => {
    const now = Date.now();
    const x = normalizeIncome({ ...Object.fromEntries(INCOME_EDITABLE.filter((k) => k in b).map((k) => [k, b[k]])), id: nanoid(10), createdAt: now, updatedAt: now });
    db.income.push(x);
    return x;
  });
  res.status(201).json({ income });
});
router.patch('/api/income/:id', async (req, res) => {
  const b = req.body || {};
  const income = await mutateDB((db) => {
    const i = db.income.findIndex((x) => x.id === req.params.id);
    if (i === -1) return null;
    const next = { ...db.income[i] };
    for (const k of INCOME_EDITABLE) if (k in b) next[k] = b[k];
    if ('name' in b && !String(b.name || '').trim()) next.name = db.income[i].name;
    db.income[i] = normalizeIncome({ ...next, updatedAt: Date.now() });
    return db.income[i];
  });
  if (!income) return res.status(404).json({ error: 'not_found' });
  res.json({ income });
});
router.delete('/api/income/:id', async (req, res) => {
  const trashId = nanoid(10);
  const ok = await mutateDB((db) => {
    const i = db.income.findIndex((x) => x.id === req.params.id);
    if (i === -1) return false;
    const [x] = db.income.splice(i, 1);
    db.trash.unshift({ trashId, kind: 'income', deletedAt: Date.now(), data: x });
    return true;
  });
  if (!ok) return res.status(404).json({ error: 'not_found' });
  res.json({ trashId });
});

// ---- A year as Excel: every payment (date, what, category, amount, business and private part) and a summary.
const WORDS = {
  de: {
    sheet: 'Ausgaben', summary: 'Übersicht', head: ['Datum', 'Ausgabe', 'Kategorie', 'Intervall', 'Betrag', 'Geschäftlich %', 'Geschäftlich', 'Privat'],
    income: 'Einnahmen', incomeHead: ['Datum', 'Einnahme', 'Kunde', 'Intervall', 'Betrag'],
    total: 'Summe', byCategory: 'Nach Kategorie', byMonth: 'Nach Monat', file: 'Ausgaben', category: 'Kategorie', month: 'Monat', amount: 'Betrag', business: 'Geschäftlich', private: 'Privat',
    intervals: { month: 'monatlich', quarter: 'vierteljährlich', half: 'halbjährlich', year: 'jährlich', once: 'einmalig' },
  },
  en: {
    sheet: 'Expenses', summary: 'Summary', head: ['Date', 'Expense', 'Category', 'Interval', 'Amount', 'Business %', 'Business', 'Private'],
    income: 'Income', incomeHead: ['Date', 'Income', 'Client', 'Interval', 'Amount'],
    total: 'Total', byCategory: 'By category', byMonth: 'By month', file: 'Expenses', category: 'Category', month: 'Month', amount: 'Amount', business: 'Business', private: 'Private',
    intervals: { month: 'monthly', quarter: 'quarterly', half: 'every 6 months', year: 'yearly', once: 'one-time' },
  },
};
export function expensesWorkbook(db, q = {}) {
  const w = WORDS[q.lang === 'en' ? 'en' : 'de'];
  const year = Number(q.year) || new Date().getFullYear();
  const currency = db.settings?.currency || 'EUR';
  const pays = db.expenses.flatMap((e) => paymentsIn(e, `${year}-01-01`, `${year}-12-31`).map((date) => ({ date, e })))
    .sort((a, b) => a.date.localeCompare(b.date) || a.e.name.localeCompare(b.e.name));
  const head = w.head.map((v) => ({ v, s: 1 }));
  const rows = pays.map(({ date, e }, i) => [
    { v: excelDate(date), s: 2 }, e.name, categoryOf(e.category).label, w.intervals[e.interval] || intervalOf(e.interval).label,
    { v: e.amount, s: 11 }, { v: e.share, s: 10 }, { f: `ROUND(E${i + 2}*F${i + 2}/100,2)`, v: Math.round(e.amount * e.share) / 100, s: 11 },
    { f: `E${i + 2}-G${i + 2}`, v: Math.round(e.amount * (100 - e.share)) / 100, s: 11 },
  ]);
  const last = rows.length + 1;
  const totals = [{ v: w.total, s: 6 }, { v: '', s: 6 }, { v: '', s: 6 }, { v: '', s: 6 },
    { f: `SUBTOTAL(109,E2:E${last})`, v: pays.reduce((n, p) => n + p.e.amount, 0), s: 12 }, { v: '', s: 6 },
    { f: `SUBTOTAL(109,G2:G${last})`, v: pays.reduce((n, p) => n + p.e.amount * p.e.share / 100, 0), s: 12 },
    { f: `SUBTOTAL(109,H2:H${last})`, v: pays.reduce((n, p) => n + p.e.amount * (100 - p.e.share) / 100, 0), s: 12 }];
  const byCat = new Map();
  for (const e of db.expenses) {
    const y = yearOf(e, year);
    if (!y.count) continue;
    const k = categoryOf(e.category).label;
    const c = byCat.get(k) || { all: 0, business: 0 };
    c.all += y.all; c.business += y.business; byCat.set(k, c);
  }
  const months = Array.from({ length: 12 }, (_, i) => {
    const list = pays.filter((p) => Number(p.date.slice(5, 7)) === i + 1);
    return [new Date(year, i, 1).toLocaleDateString(q.lang === 'en' ? 'en' : 'de', { month: 'long' }), list.reduce((n, p) => n + p.e.amount, 0), list.reduce((n, p) => n + p.e.amount * p.e.share / 100, 0)];
  });
  const summary = [
    [{ v: `${w.file} ${year}`, s: 8 }],
    [],
    [{ v: w.byCategory, s: 1 }, { v: w.amount, s: 1 }, { v: w.business, s: 1 }, { v: w.private, s: 1 }],
    ...[...byCat].sort((a, b) => b[1].all - a[1].all).map(([k, c]) => [k, { v: c.all, s: 11 }, { v: c.business, s: 11 }, { v: c.all - c.business, s: 11 }]),
    [],
    [{ v: w.byMonth, s: 1 }, { v: w.amount, s: 1 }, { v: w.business, s: 1 }, { v: w.private, s: 1 }],
    ...months.map(([m, all, bus]) => [m, { v: all, s: 11 }, { v: bus, s: 11 }, { v: all - bus, s: 11 }]),
  ];
  // Recurring income: every payment of the year.
  const clientName = new Map((db.clients || []).map((c) => [c.id, c.name]));
  const ins = (db.income || []).flatMap((x) => paymentsIn(x, `${year}-01-01`, `${year}-12-31`).map((date) => ({ date, x })))
    .sort((a, b) => a.date.localeCompare(b.date) || a.x.name.localeCompare(b.x.name));
  const inRows = ins.map(({ date, x }) => [
    { v: excelDate(date), s: 2 }, x.name, clientName.get(x.clientId) || '', w.intervals[x.interval] || intervalOf(x.interval).label, { v: x.amount, s: 11 },
  ]);
  const inLast = inRows.length + 1;
  const inTotals = [{ v: w.total, s: 6 }, { v: '', s: 6 }, { v: '', s: 6 }, { v: '', s: 6 },
    { f: `SUBTOTAL(109,E2:E${inLast})`, v: ins.reduce((n, p) => n + p.x.amount, 0), s: 12 }];
  const buffer = buildXlsx({
    stylesXml: styles(LOOK.app, currency),
    sheets: [
      { name: `${w.sheet} ${year}`, rows: [head, ...rows, totals], cols: [12, 32, 24, 16, 13, 13, 14, 14], freeze: true, autoFilter: `A1:H${last}`, tab: LOOK.app.tab, headerHeight: 24 },
      { name: w.summary, rows: summary, cols: [30, 14, 14, 14] },
      ...(ins.length ? [{ name: `${w.income} ${year}`, rows: [w.incomeHead.map((v) => ({ v, s: 1 })), ...inRows, inTotals], cols: [12, 32, 24, 16, 13], freeze: true, autoFilter: `A1:E${inLast}`, tab: LOOK.app.tab, headerHeight: 24 }] : []),
    ],
  });
  return { buffer, filename: `${w.file}_${year}.xlsx` };
}

router.get('/api/expenses/export.xlsx', async (req, res) => {
  const { buffer, filename } = expensesWorkbook(await readDB(), req.query);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`);
  res.send(buffer);
});
