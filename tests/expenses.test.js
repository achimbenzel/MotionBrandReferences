// Expenses: what the business costs — saved (cleaned up), in the Trash and
// back, found by search, the year as Excel; and the sums: when each is paid,
// what a year comes to, the month's target.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { startServer, tempDir } from './helpers.js';
import { readCentralDirectory, readEntryBuffer } from '../server/zip.js';
import { paymentsIn, yearOf, monthlyOf, nextPayment, cancelBy, monthsOf, targetOf, targetFor, incomeMonthsOf, incomeNow, isActive, partOf, inView, EXPENSE_CATEGORIES } from '../src/lib/expenses.js';
import { EXPENSE_CATEGORY_KEYS } from '../server/schema.js';

let srv;
before(async () => { srv = await startServer({ dataDir: await tempDir() }); });
after(async () => { await srv?.stop(); });

test('sums: payment days (month ends kept), a year, per month, next payment, cancel-by, the target', () => {
  const cc = { amount: 66.45, interval: 'month', start: '2025-01-31', end: '', share: 100 };
  assert.deepEqual(paymentsIn(cc, '2026-01-01', '2026-04-30'), ['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']);
  assert.equal(yearOf(cc, 2026).count, 12);
  assert.equal(Math.round(yearOf(cc, 2026).all * 100) / 100, 797.4);
  const ins = { amount: 240, interval: 'year', start: '2024-06-15', end: '', share: 50, notice: 30 };
  assert.deepEqual([yearOf(ins, 2026).all, yearOf(ins, 2026).business, monthlyOf(ins)], [240, 120, 20]);
  assert.equal(yearOf(ins, 2026).private, 120);
  const netflix = { amount: 13.99, interval: 'month', start: '2026-01-02', end: '', share: 0 };
  assert.deepEqual([partOf(netflix, 'business'), partOf(netflix, 'private'), partOf(netflix, 'both'), partOf(ins, 'private')], [0, 1, 1, 0.5]);
  assert.deepEqual([inView(netflix, 'business'), inView(netflix, 'private'), inView(cc, 'private'), inView(cc, 'both')], [false, true, false, true]);
  assert.equal(nextPayment(ins, '2026-06-16'), '2027-06-15');
  assert.equal(cancelBy(ins, '2026-01-01'), '2026-05-16');
  const laptop = { amount: 2400, interval: 'once', start: '2026-03-10', end: '', share: 100 };
  assert.deepEqual([yearOf(laptop, 2026).all, yearOf(laptop, 2027).all, monthlyOf(laptop)], [2400, 0, 0]);
  const ended = { amount: 10, interval: 'quarter', start: '2026-01-05', end: '2026-06-30', share: 100 };
  assert.deepEqual(paymentsIn(ended, '2026-01-01', '2026-12-31'), ['2026-01-05', '2026-04-05']);
  assert.equal(isActive(ended, '2026-07-01'), false);
  const months = monthsOf([cc, ins, laptop], 2026);
  assert.equal(months[2].all, 66.45 + 2400);
  assert.equal(months[5].business, 66.45 + 120);
  assert.deepEqual([months[5].private, months[2].private], [120, 0]);
  assert.deepEqual(EXPENSE_CATEGORIES.map((c) => c.key), EXPENSE_CATEGORY_KEYS); // app and server know the same categories
  // 1,000 a month of costs, 3,000 pay, 30 % tax, 10 % reserve, 80/h, 6 weeks off.
  const t = targetOf(1000, { salary: 3000, taxRate: 30, reserve: 10, rate: 80, weeksOff: 6 });
  assert.equal(Math.round(t.gross), 4286);
  assert.equal(Math.round(t.total), Math.round((1000 + 3000 / 0.7) * 1.1));
  assert.equal(Math.round(t.hours), Math.round(t.total / 80));
  assert.equal(Math.round(t.weekHours * 10) / 10, Math.round(((t.total / 80) * 12 / 46) * 10) / 10);
  assert.equal(targetOf(500, {}).total, 500);
  // Per view: business costs alone; your pay (or private costs, if more) before tax; both — and what retainers leave to find.
  const f = { salary: 3000, taxRate: 30, reserve: 10, rate: 100, weeksOff: 6 };
  const monthly = { business: 1000, private: 3500 };
  assert.equal(Math.round(targetFor('business', monthly, f).total), 1100);
  const priv = targetFor('private', monthly, f);
  assert.deepEqual([Math.round(priv.total), priv.needIsPrivate], [5500, true]); // 3,500 private > 3,000 pay → 3,500 / 0.7 × 1.1
  const both = targetFor('both', monthly, f, 2000);
  assert.deepEqual([Math.round(both.total), Math.round(both.rest), Math.round(both.restHours)], [6600, 4600, 46]);
  assert.equal(targetFor('business', monthly, f, 5000).rest, 0);
  assert.equal(Math.round(targetOf(1000, f).total), Math.round(targetFor('both', { business: 1000 }, f).total));
  const retainer = { amount: 2000, interval: 'month', start: '2026-03-01', end: '2026-08-31' };
  const quarterly = { amount: 900, interval: 'quarter', start: '2026-01-15', end: '' };
  const inc = incomeMonthsOf([retainer, quarterly], 2026);
  assert.deepEqual(inc.map((m) => m.sum), [900, 0, 2000, 2900, 2000, 2000, 2900, 2000, 0, 900, 0, 0]);
  assert.deepEqual([incomeNow([retainer, quarterly], '2026-05-10'), incomeNow([retainer, quarterly], '2026-09-01'), incomeNow([retainer], '2026-02-01')], [2300, 300, 0]);
});

test('expenses: saved and cleaned up, edited, Trash and back, found, the year as Excel; finance settings', async () => {
  assert.equal((await srv.api('/api/expenses', { method: 'POST', json: { name: '  ' } })).status, 400);
  let r = await srv.api('/api/expenses', { method: 'POST', json: { name: 'Adobe CC', category: 'software', amount: '66.449', interval: 'month', start: '2026-01-15', share: 250, notice: -3, bogus: 1 } });
  assert.equal(r.status, 201);
  const cc = r.data.expense;
  assert.deepEqual([cc.amount, cc.interval, cc.share, cc.notice, cc.end, 'bogus' in cc], [66.45, 'month', 100, 0, '', false]);
  r = await srv.api('/api/expenses', { method: 'POST', json: { name: 'Haftpflicht', category: 'nope', amount: 180, interval: 'year', start: '2025-09-01', share: 100, notice: 30 } });
  const ins = r.data.expense;
  assert.equal(ins.category, 'other');
  r = await srv.api(`/api/expenses/${ins.id}`, { method: 'PATCH', json: { category: 'insurance', end: '2026-12-31', name: '' } });
  assert.deepEqual([r.data.expense.category, r.data.expense.end, r.data.expense.name], ['insurance', '2026-12-31', 'Haftpflicht']);

  r = await srv.api('/api/settings', { method: 'PATCH', json: { finance: { salary: 3000, taxRate: 99, rate: '85.5' } } });
  assert.deepEqual(r.data.settings.finance, { salary: 3000, taxRate: 80, reserve: 10, rate: 85.5, weeksOff: 6 });
  r = await srv.api('/api/expenses');
  assert.deepEqual([r.data.expenses.length, r.data.finance.salary, r.data.currency, Array.isArray(r.data.invoices)], [2, 3000, 'EUR', true]);

  assert.ok((await srv.api('/api/search?q=haftpflicht')).data.results.some((x) => x.kind === 'expense' && x.id === ins.id));
  r = await srv.api(`/api/expenses/${ins.id}`, { method: 'DELETE' });
  assert.equal((await srv.api('/api/expenses')).data.expenses.length, 1);
  await srv.api(`/api/trash/${r.data.trashId}/restore`, { method: 'POST' });
  assert.equal((await srv.api('/api/expenses')).data.expenses.length, 2);

  const res = await fetch(`${srv.base}/api/expenses/export.xlsx?year=2026&lang=de`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-disposition'), /Ausgaben_2026\.xlsx/);
  const buf = Buffer.from(await res.arrayBuffer());
  const file = path.join(srv.dataDir, 'expenses.xlsx');
  await fsp.writeFile(file, buf);
  const fh = await fsp.open(file, 'r');
  let sheet;
  try {
    const entries = await readCentralDirectory(fh, buf.length);
    sheet = (await readEntryBuffer(fh, entries.find((e) => e.name === 'xl/worksheets/sheet1.xml'))).toString('utf8');
  } finally { await fh.close(); }
  assert.equal((sheet.match(/Adobe CC/g) || []).length, 12); // every month of 2026
  assert.equal((sheet.match(/Haftpflicht/g) || []).length, 1); // once a year
  assert.match(sheet, /SUBTOTAL\(109,G2:G14\)/);
  assert.match(sheet, /SUBTOTAL\(109,H2:H14\)/); // the private part too

  // Recurring income: saved (cleaned up), edited, Trash and back, found, in the export.
  assert.equal((await srv.api('/api/income', { method: 'POST', json: { name: ' ' } })).status, 400);
  let x = (await srv.api('/api/income', { method: 'POST', json: { name: 'Retainer Acme', amount: '2000', interval: 'once', start: '2026-02-01', clientId: 'x y', bogus: 1 } })).data.income;
  assert.deepEqual([x.amount, x.interval, x.clientId, 'bogus' in x], [2000, 'month', '', false]);
  x = (await srv.api(`/api/income/${x.id}`, { method: 'PATCH', json: { end: '2026-06-30', name: '' } })).data.income;
  assert.deepEqual([x.name, x.end], ['Retainer Acme', '2026-06-30']);
  r = await srv.api('/api/expenses');
  assert.deepEqual([r.data.income.length, Array.isArray(r.data.clients)], [1, true]);
  assert.ok((await srv.api('/api/search?q=retainer')).data.results.some((s) => s.kind === 'income'));
  const del = await srv.api(`/api/income/${x.id}`, { method: 'DELETE' });
  assert.equal((await srv.api('/api/expenses')).data.income.length, 0);
  await srv.api(`/api/trash/${del.data.trashId}/restore`, { method: 'POST' });
  assert.equal((await srv.api('/api/expenses')).data.income.length, 1);
  const res2 = await fetch(`${srv.base}/api/expenses/export.xlsx?year=2026&lang=en`);
  const buf2 = Buffer.from(await res2.arrayBuffer());
  const file2 = path.join(srv.dataDir, 'expenses-en.xlsx');
  await fsp.writeFile(file2, buf2);
  const fh2 = await fsp.open(file2, 'r');
  try {
    const entries = await readCentralDirectory(fh2, buf2.length);
    const s3 = (await readEntryBuffer(fh2, entries.find((e) => e.name === 'xl/worksheets/sheet3.xml'))).toString('utf8');
    assert.equal((s3.match(/Retainer Acme/g) || []).length, 5); // Feb … Jun
  } finally { await fh2.close(); }
});
