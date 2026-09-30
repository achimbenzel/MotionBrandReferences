// Expenses: what the business costs — saved (cleaned up), in the Trash and
// back, found by search, the year as Excel; and the sums: when each is paid,
// what a year comes to, the month's target. Receipts: which payments have one,
// uploads that find their month, Trash and back, the year's ZIP.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { startServer, tempDir } from './helpers.js';
import { readCentralDirectory, readEntryBuffer } from '../server/zip.js';
import { paymentsIn, yearOf, monthlyOf, nextPayment, cancelBy, monthsOf, targetOf, targetFor, incomeMonthsOf, incomeNow, isActive, partOf, inView, EXPENSE_CATEGORIES,
  receiptCheck, missingReceipts, receiptDateFor, dateFromName } from '../src/lib/expenses.js';
import { addDays } from '../src/lib/dates.js';
import { EXPENSE_CATEGORY_KEYS, localDay } from '../server/schema.js';

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

test('receipts: which payments have one, the month a new one is for, dates in file names', () => {
  const cc = { amount: 66, interval: 'month', start: '2026-01-15', end: '', share: 100, receipts: [{ date: '2026-02-03' }] };
  assert.deepEqual(receiptCheck(cc, '2026-01-01', '2026-03-31'), [
    { date: '2026-01-15', covered: false }, { date: '2026-02-15', covered: true }, { date: '2026-03-15', covered: false }]);
  assert.deepEqual(missingReceipts(cc, 2026, '2026-04-20'), ['2026-01-15', '2026-03-15', '2026-04-15']);
  assert.deepEqual(missingReceipts(cc, 2025, '2026-04-20'), []);
  assert.equal(receiptDateFor(cc, '2026-04-20'), '2026-04-15');
  assert.equal(receiptDateFor({ ...cc, receipts: [...cc.receipts, { date: '2026-04-01' }, { date: '2026-03-30' }, { date: '2026-01-15' }] }, '2026-04-20'), '2026-04-20'); // all there → today
  assert.deepEqual(missingReceipts({ ...cc, share: 0 }, 2026, '2026-04-20'), []); // private: none needed
  assert.deepEqual(['Invoice_2026-03-15.pdf', 'Rechnung 15.03.2026.pdf', 'adobe-202603.pdf', 'Beleg 1.3.2026.jpg', 'order 202612345.pdf', '31.02.2026.pdf', 'scan.jpg'].map(dateFromName),
    ['2026-03-15', '2026-03-15', '2026-03-01', '2026-03-01', null, null, null]);
});

test('receipts: upload (each finds its payment), served, dated, Trash and back, with the expense, the year as ZIP', async () => {
  const PDF = Buffer.from('%PDF-1.4\n% receipt\n');
  const form = (names, date) => {
    const fd = new FormData();
    for (const n of names) fd.append('files', new Blob([PDF], { type: 'application/pdf' }), n);
    if (date) fd.append('date', date);
    return fd;
  };
  // A monthly cost that started ~100 days ago: the file named with a day goes there, the others fill the latest open months.
  const today = localDay();
  const cc = (await srv.api('/api/expenses', { method: 'POST', json: { name: 'Adobe CC', amount: 66, interval: 'month', start: addDays(today, -100) } })).data.expense;
  assert.deepEqual(cc.receipts, []);
  const pays = paymentsIn(cc, addDays(today, -730), today);
  assert.ok(pays.length >= 3);
  let r = await srv.api(`/api/expenses/${cc.id}/receipts`, { method: 'POST', body: form(['scan.pdf', `Invoice ${pays[0]}.pdf`, 'photo.pdf']) });
  assert.equal(r.status, 201);
  assert.deepEqual(r.data.receipts.map((x) => x.date), [pays.at(-1), pays[0], pays.at(-2)]);
  assert.deepEqual(r.data.expense.receipts.map((x) => x.date), [pays[0], pays.at(-2), pays.at(-1)]); // kept by day
  assert.deepEqual(r.data.receipts.map((x) => [x.kind, x.size, x.name]), [['pdf', PDF.length, 'scan.pdf'], ['pdf', PDF.length, `Invoice ${pays[0]}.pdf`], ['pdf', PDF.length, 'photo.pdf']]);
  const [scan] = r.data.receipts;
  let res = await fetch(`${srv.base}/data/expense/${cc.id}/${scan.file}`);
  assert.equal(res.status, 200);
  assert.equal(Buffer.from(await res.arrayBuffer()).toString(), PDF.toString());

  // Not a receipt → refused; an e-invoice (XML) is kept and never runs as a page.
  const bad = new FormData(); bad.append('files', new Blob(['x'], { type: 'text/plain' }), 'notes.txt');
  assert.equal((await srv.api(`/api/expenses/${cc.id}/receipts`, { method: 'POST', body: bad })).status, 400);
  assert.equal((await srv.api('/api/expenses/nope/receipts', { method: 'POST', body: form(['a.pdf']) })).status, 404);
  const xml = new FormData(); xml.append('files', new Blob(['<Invoice/>'], { type: 'text/xml' }), 'x-rechnung.xml'); xml.append('date', '2025-12-01');
  const x = (await srv.api(`/api/expenses/${cc.id}/receipts`, { method: 'POST', body: xml })).data.receipts[0];
  assert.deepEqual([x.kind, x.date], ['xml', '2025-12-01']);
  res = await fetch(`${srv.base}/data/expense/${cc.id}/${x.file}`);
  assert.equal(res.headers.get('content-security-policy'), 'sandbox');

  // Another day, a name; nothing else — and editing the expense keeps them.
  r = await srv.api(`/api/expenses/${cc.id}/receipts/${scan.id}`, { method: 'PATCH', json: { date: '2025-11-02', name: 'Adobe Nov', file: '../../db.json' } });
  const moved = r.data.expense.receipts.find((y) => y.id === scan.id);
  assert.deepEqual([moved.date, moved.name, moved.file, r.data.expense.receipts[0].id], ['2025-11-02', 'Adobe Nov', scan.file, scan.id]);
  assert.equal((await srv.api(`/api/expenses/${cc.id}/receipts/${scan.id}`, { method: 'PATCH', json: { date: 'soon', name: ' ' } })).data.expense.receipts[0].date, '2025-11-02');
  r = await srv.api(`/api/expenses/${cc.id}`, { method: 'PATCH', json: { name: 'Adobe Creative Cloud', receipts: [] } });
  assert.equal(r.data.expense.receipts.length, 4);

  // The unused-files scan leaves them alone.
  const old = new Date(Date.now() - 3600e3);
  for (const f of await fsp.readdir(path.join(srv.dataDir, 'expense', cc.id, 'receipts'))) await fsp.utimes(path.join(srv.dataDir, 'expense', cc.id, 'receipts', f), old, old);
  const unused = (await srv.api('/api/maintenance/unused')).data.files.map((f) => f.rel);
  assert.ok(!unused.some((rel) => rel.startsWith('expense/')), unused.join(', '));

  // A receipt → Trash (its file too) and back.
  const onDisk = (rel) => fsp.access(path.join(srv.dataDir, 'expense', cc.id, rel)).then(() => true, () => false);
  r = await srv.api(`/api/expenses/${cc.id}/receipts/${scan.id}`, { method: 'DELETE' });
  assert.equal(r.data.expense.receipts.length, 3);
  assert.equal(await onDisk(scan.file), false);
  const t = (await srv.api('/api/trash')).data.items.find((i) => i.trashId === r.data.trashId);
  assert.deepEqual([t.kind, t.title, t.subtitle], ['receipt', 'Adobe Nov', 'Receipt · Adobe Creative Cloud']);
  await srv.api(`/api/trash/${r.data.trashId}/restore`, { method: 'POST' });
  assert.equal(await onDisk(scan.file), true);
  assert.equal((await srv.api('/api/expenses')).data.expenses.find((e) => e.id === cc.id).receipts[0].id, scan.id);

  // The expense → Trash with all its receipts, and back with them.
  r = await srv.api(`/api/expenses/${cc.id}`, { method: 'DELETE' });
  assert.equal(await onDisk(scan.file), false);
  assert.match((await srv.api('/api/trash')).data.items.find((i) => i.trashId === r.data.trashId).subtitle, /4 receipts/);
  await srv.api(`/api/trash/${r.data.trashId}/restore`, { method: 'POST' });
  assert.equal(await onDisk(scan.file), true);
  assert.equal((await srv.api('/api/expenses')).data.expenses.find((e) => e.id === cc.id).receipts.length, 4);

  // The year as a ZIP: the workbook with a receipt column, each receipt named by its day and expense; private ones apart.
  const host = (await srv.api('/api/expenses', { method: 'POST', json: { name: 'Hosting / Server', amount: 10, interval: 'month', start: '2021-01-10', end: '2021-06-30' } })).data.expense;
  await srv.api(`/api/expenses/${host.id}/receipts`, { method: 'POST', body: form(['a.pdf', 'b.pdf'], '2021-03-10') });
  const tv = (await srv.api('/api/expenses', { method: 'POST', json: { name: 'Netflix', amount: 13.99, interval: 'month', start: '2021-01-02', end: '2021-02-28', share: 0 } })).data.expense;
  await srv.api(`/api/expenses/${tv.id}/receipts`, { method: 'POST', body: form(['n.pdf'], '2021-02-02') });
  res = await fetch(`${srv.base}/api/expenses/receipts.zip?year=2021&lang=de`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-disposition'), /Belege_2021\.zip/);
  const buf = Buffer.from(await res.arrayBuffer());
  const file = path.join(srv.dataDir, 'receipts.zip');
  await fsp.writeFile(file, buf);
  const fh = await fsp.open(file, 'r');
  try {
    const entries = await readCentralDirectory(fh, buf.length);
    assert.deepEqual(entries.map((e) => e.name), ['Ausgaben_2021.xlsx', 'Privat/2021-02-02 Netflix.pdf', '2021-03-10 Hosting Server.pdf', '2021-03-10 Hosting Server (2).pdf']);
    assert.equal((await readEntryBuffer(fh, entries[2])).toString(), PDF.toString());
    await fsp.writeFile(path.join(srv.dataDir, 'in-zip.xlsx'), await readEntryBuffer(fh, entries[0]));
  } finally { await fh.close(); }
  const xfile = path.join(srv.dataDir, 'in-zip.xlsx');
  const xbuf = await fsp.readFile(xfile);
  const xh = await fsp.open(xfile, 'r');
  try {
    const sheet = (await readEntryBuffer(xh, (await readCentralDirectory(xh, xbuf.length)).find((e) => e.name === 'xl/worksheets/sheet1.xml'))).toString('utf8');
    assert.match(sheet, /2021-03-10 Hosting Server\.pdf, 2021-03-10 Hosting Server \(2\)\.pdf/);
    assert.equal((sheet.match(/>fehlt</g) || []).length, 5); // Hosting: every month but March; Netflix is private
    assert.match(sheet, />Beleg</);
  } finally { await xh.close(); }
});
