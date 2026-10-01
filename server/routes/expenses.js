// Expenses (Work mode): what the business costs — subscriptions, insurance,
// hardware … (and what you pay privately) — with the invoices from your
// clients and the money that comes in regularly (retainers) to hold them
// against, the receipts for what it paid, and a year as an Excel workbook
// (and a ZIP with every receipt) for your tax advisor.
import fsp from 'node:fs/promises';
import path from 'node:path';
import { nanoid } from 'nanoid';
import { DATA_DIR, TRASH_DIR } from '../config.js';
import { readDB, mutateDB } from '../db.js';
import { moveInto, safeRm, sanitize, extOf, relPairs } from '../files.js';
import { trashFiles } from '../trashMoves.js';
import { upload } from '../upload.js';
import { normalizeExpense, normalizeIncome, normalizeReceipt, isDay, localDay, str } from '../schema.js';
import { createRouter, HttpError } from '../http.js';
import { buildXlsx, excelDate } from '../xlsx.js';
import { writeZip } from '../zip.js';
import { styles, LOOK } from './time.js';
import { categoryOf, intervalOf, paymentsIn, yearOf, needsReceipts, receiptDateFor, dateFromName } from '../../src/lib/expenses.js';

const router = createRouter();
export default router;

export const expenseDir = (id) => path.join(DATA_DIR, 'expense', id);
const EDITABLE = ['name', 'category', 'amount', 'interval', 'start', 'end', 'share', 'notice', 'link', 'notes', 'needsReceipt'];
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

// → Trash, with its receipts.
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
  await trashFiles(trashId, [{ from: expenseDir(req.params.id), to: path.join(TRASH_DIR, trashId) }]);
  res.json({ trashId });
});

// ---- Receipts: the invoice or bill for a payment — a PDF, a photo or scan, an
// e-invoice (XML). Each is for a day; it counts for the payment in its month.
const RECEIPT_EXT = /\.(pdf|png|jpe?g|webp|gif|heic|heif|avif|xml)$/i;
const receiptKind = (name) => (/\.pdf$/i.test(name) ? 'pdf' : /\.xml$/i.test(name) ? 'xml' : RECEIPT_EXT.test(name) ? 'image' : 'other');

// The day each file is for: the one asked for, else a date in its name, else
// the latest payment without a receipt yet (so a pile of monthly invoices
// fills the open months one after another), else today. → { expense, receipts }
router.post('/api/expenses/:id/receipts', upload.array('files', 50), async (req, res) => {
  const files = (req.files || []).filter((f) => RECEIPT_EXT.test(f.originalname));
  if (!files.length) throw new HttpError(400, 'file_required', 'Pick a PDF, a picture or an e-invoice (XML).');
  const db = await readDB();
  const expense = db.expenses.find((x) => x.id === req.params.id);
  if (!expense) return res.status(404).json({ error: 'not_found' });
  const dir = path.join(expenseDir(expense.id), 'receipts');
  await fsp.mkdir(dir, { recursive: true });
  const today = localDay();
  const asked = isDay(req.body?.date) ? req.body.date : null;
  const named = files.map((f) => dateFromName(f.originalname));
  const added = [];
  for (const [i, f] of files.entries()) {
    const ext = extOf(f.originalname);
    const base = sanitize(path.basename(f.originalname, path.extname(f.originalname))).slice(0, 80) || 'receipt';
    const stored = await moveInto(dir, f.path, `${nanoid(6)}-${base}${ext}`);
    // files with a date in their name are placed first, so the rest fill what's still open
    const date = asked || named[i] || receiptDateFor({ ...expense, receipts: [...expense.receipts, ...added, ...named.filter(Boolean).map((d) => ({ date: d }))] }, today);
    added.push(normalizeReceipt({ id: nanoid(8), file: `receipts/${stored}`, name: str(f.originalname, 200), size: f.size, date, kind: receiptKind(f.originalname) }));
  }
  const updated = await mutateDB((d) => {
    const e = d.expenses.find((x) => x.id === expense.id);
    if (!e) return null;
    e.receipts = [...e.receipts, ...added].sort((a, b) => a.date.localeCompare(b.date));
    e.updatedAt = Date.now();
    return e;
  });
  if (!updated) {
    for (const r of added) await safeRm(path.join(expenseDir(expense.id), r.file), { force: true }).catch(() => {});
    return res.status(404).json({ error: 'not_found' });
  }
  res.status(201).json({ expense: updated, receipts: added });
});

// Its day (the payment it's for) or the name it's shown with.
router.patch('/api/expenses/:id/receipts/:receiptId', async (req, res) => {
  const b = req.body || {};
  const expense = await mutateDB((db) => {
    const e = db.expenses.find((x) => x.id === req.params.id);
    const i = e ? e.receipts.findIndex((r) => r.id === req.params.receiptId) : -1;
    if (i === -1) return null;
    const cur = e.receipts[i];
    e.receipts[i] = normalizeReceipt({ ...cur, date: isDay(b.date) ? b.date : cur.date, name: String(b.name ?? '').trim() ? b.name : cur.name });
    e.receipts.sort((x, y) => x.date.localeCompare(y.date));
    e.updatedAt = Date.now();
    return e;
  });
  if (!expense) return res.status(404).json({ error: 'not_found' });
  res.json({ expense });
});

// → Trash (with its file), restorable.
router.delete('/api/expenses/:id/receipts/:receiptId', async (req, res) => {
  const trashId = nanoid(10);
  let rel = null;
  const expense = await mutateDB((db) => {
    const e = db.expenses.find((x) => x.id === req.params.id);
    const i = e ? e.receipts.findIndex((r) => r.id === req.params.receiptId) : -1;
    if (i === -1) return null;
    const [receipt] = e.receipts.splice(i, 1);
    rel = receipt.file;
    e.updatedAt = Date.now();
    db.trash.unshift({ trashId, kind: 'receipt', deletedAt: Date.now(), data: { expenseId: e.id, expenseName: e.name, receipt, rels: [rel] } });
    return e;
  });
  if (!expense) return res.status(404).json({ error: 'not_found' });
  await trashFiles(trashId, relPairs(expenseDir(req.params.id), path.join(TRASH_DIR, trashId), [rel]));
  res.json({ expense, trashId });
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
    sheet: 'Ausgaben', summary: 'Übersicht', head: ['Datum', 'Ausgabe', 'Kategorie', 'Intervall', 'Betrag', 'Geschäftlich %', 'Geschäftlich', 'Privat', 'Beleg'],
    income: 'Einnahmen', incomeHead: ['Datum', 'Einnahme', 'Kunde', 'Intervall', 'Betrag'],
    total: 'Summe', byCategory: 'Nach Kategorie', byMonth: 'Nach Monat', file: 'Ausgaben', category: 'Kategorie', month: 'Monat', amount: 'Betrag', business: 'Geschäftlich', private: 'Privat',
    missing: 'fehlt', receipts: 'Belege', privateFolder: 'Privat', receipt: 'Beleg',
    intervals: { month: 'monatlich', quarter: 'vierteljährlich', half: 'halbjährlich', year: 'jährlich', once: 'einmalig' },
  },
  en: {
    sheet: 'Expenses', summary: 'Summary', head: ['Date', 'Expense', 'Category', 'Interval', 'Amount', 'Business %', 'Business', 'Private', 'Receipt'],
    income: 'Income', incomeHead: ['Date', 'Income', 'Client', 'Interval', 'Amount'],
    total: 'Total', byCategory: 'By category', byMonth: 'By month', file: 'Expenses', category: 'Category', month: 'Month', amount: 'Amount', business: 'Business', private: 'Private',
    missing: 'missing', receipts: 'Receipts', privateFolder: 'Private', receipt: 'Receipt',
    intervals: { month: 'monthly', quarter: 'quarterly', half: 'every 6 months', year: 'yearly', once: 'one-time' },
  },
};
const wordsFor = (q) => WORDS[q.lang === 'en' ? 'en' : 'de'];
const yearFor = (q) => (Number(q.year) >= 2000 && Number(q.year) <= 2100 ? Math.floor(Number(q.year)) : new Date().getFullYear());

/**
 * The receipts of `year` under the names they get in the ZIP (and the Excel
 * workbook): "2026-03-15 Adobe CC.pdf", private costs in a folder of their own.
 * → Map(receipt id → { name, full, e, r })
 */
function receiptFiles(db, year, w) {
  const clean = (v) => String(v || '').replace(/[\\/:*?"<>|\p{Cc}]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || w.receipt;
  const list = db.expenses.flatMap((e) => (e.receipts || []).filter((r) => r.date.startsWith(`${year}-`)).map((r) => ({ e, r })))
    .sort((a, b) => a.r.date.localeCompare(b.r.date) || a.e.name.localeCompare(b.e.name));
  const used = new Set();
  const out = new Map();
  for (const { e, r } of list) {
    const ext = path.extname(r.file).toLowerCase();
    const stem = `${e.share > 0 ? '' : `${w.privateFolder}/`}${r.date} ${clean(e.name)}`;
    let name = `${stem}${ext}`;
    for (let n = 2; used.has(name.toLowerCase()); n += 1) name = `${stem} (${n})${ext}`;
    used.add(name.toLowerCase());
    out.set(r.id, { name, full: path.join(expenseDir(e.id), r.file), e, r });
  }
  return out;
}

export function expensesWorkbook(db, q = {}) {
  const w = wordsFor(q);
  const year = yearFor(q);
  const today = localDay();
  const currency = db.settings?.currency || 'EUR';
  const pays = db.expenses.flatMap((e) => paymentsIn(e, `${year}-01-01`, `${year}-12-31`).map((date) => ({ date, e })))
    .sort((a, b) => a.date.localeCompare(b.date) || a.e.name.localeCompare(b.e.name));
  // The receipts for each payment (those of its month), by the names they have in the ZIP.
  const files = [...receiptFiles(db, year, w).values()];
  const receiptOf = (e, date) => {
    const names = files.filter((f) => f.e.id === e.id && f.r.date.slice(0, 7) === date.slice(0, 7)).map((f) => f.name);
    return names.length ? names.join(', ') : needsReceipts(e) && date <= today ? w.missing : '';
  };
  const head = w.head.map((v) => ({ v, s: 1 }));
  const rows = pays.map(({ date, e }, i) => [
    { v: excelDate(date), s: 2 }, e.name, categoryOf(e.category).label, w.intervals[e.interval] || intervalOf(e.interval).label,
    { v: e.amount, s: 11 }, { v: e.share, s: 10 }, { f: `ROUND(E${i + 2}*F${i + 2}/100,2)`, v: Math.round(e.amount * e.share) / 100, s: 11 },
    { f: `E${i + 2}-G${i + 2}`, v: Math.round(e.amount * (100 - e.share)) / 100, s: 11 }, receiptOf(e, date),
  ]);
  const last = rows.length + 1;
  const totals = [{ v: w.total, s: 6 }, { v: '', s: 6 }, { v: '', s: 6 }, { v: '', s: 6 },
    { f: `SUBTOTAL(109,E2:E${last})`, v: pays.reduce((n, p) => n + p.e.amount, 0), s: 12 }, { v: '', s: 6 },
    { f: `SUBTOTAL(109,G2:G${last})`, v: pays.reduce((n, p) => n + p.e.amount * p.e.share / 100, 0), s: 12 },
    { f: `SUBTOTAL(109,H2:H${last})`, v: pays.reduce((n, p) => n + p.e.amount * (100 - p.e.share) / 100, 0), s: 12 }, { v: '', s: 6 }];
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
      { name: `${w.sheet} ${year}`, rows: [head, ...rows, totals], cols: [12, 32, 24, 16, 13, 13, 14, 14, 40], freeze: true, autoFilter: `A1:I${last}`, tab: LOOK.app.tab, headerHeight: 24 },
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

// Every receipt of a year in one ZIP, with the Excel workbook that lists them
// against the payments — what a tax advisor asks for.
router.get('/api/expenses/receipts.zip', async (req, res) => {
  const db = await readDB();
  const w = wordsFor(req.query);
  const year = yearFor(req.query);
  const files = receiptFiles(db, year, w);
  const { buffer, filename } = expensesWorkbook(db, req.query);
  const zipName = `${w.receipts}_${year}.zip`;
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${zipName}"; filename*=UTF-8''${encodeURIComponent(zipName)}`);
  async function* entries() {
    yield { name: filename, data: buffer };
    for (const f of files.values()) {
      if (await fsp.access(f.full).then(() => true, () => false)) yield { name: f.name, full: f.full };
    }
  }
  await writeZip(entries(), res);
  res.end();
});
