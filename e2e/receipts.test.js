// Receipts on the Expenses page, in a real browser: a payment without one shows
// as missing (on the row, in the "Missing" filter, in the editor); a file added
// for a missing payment gets its day; deleting one is undone. On a phone the
// editor fits. Needs `npm run build` first.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { startServer, tempDir } from '../tests/helpers.js';
import { paymentsIn, receiptDateFor, missingReceipts } from '../src/lib/expenses.js';
import { addDays } from '../src/lib/dates.js';
import { localDay } from '../server/schema.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = process.env.E2E_SHOTS || '';
let srv;
let browser;
let expense;
let pays;
let today;

before(async () => {
  assert.ok(fs.existsSync(path.join(ROOT, 'dist', 'index.html')), 'build the app first (npm run build)');
  srv = await startServer({ dataDir: await tempDir(), env: { NODE_ENV: 'production', LINK_LOOKUP: 'off' } });
  // Monthly since about two months ago: two or three payments so far, none with a receipt — all in this year's view.
  today = localDay();
  const start = `${today.slice(0, 4)}-01-01` > addDays(today, -65) ? `${today.slice(0, 4)}-01-01` : addDays(today, -65);
  expense = (await srv.api('/api/expenses', { method: 'POST', json: { name: 'Adobe CC', category: 'software', amount: 66, interval: 'month', start } })).data.expense;
  pays = paymentsIn(expense, start, today);
  browser = await chromium.launch(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {});
});
after(async () => { await browser?.close(); await srv?.stop(); });

const shot = (page, name) => (SHOTS ? page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true }) : null);
const PDF = { name: 'invoice.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n% receipt\n') };

test('missing receipts show; one added for a missing payment gets its day; delete and undo', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${srv.base}/expenses`);
  const row = page.locator('.ex-row', { hasText: 'Adobe CC' });
  await row.getByText(`${pays.length} missing`).waitFor({ timeout: 8000 });
  // The filter lists what still needs one.
  await page.locator('.ex-show-rc').click();
  assert.equal(await page.locator('.ex-row').count(), 1);
  await row.click();
  const box = page.locator('.ex-rc-box');
  assert.equal(await box.locator('.ex-rc-miss').count(), pays.length);
  await shot(page, 'receipts-editor-empty');

  // The oldest missing payment (last chip) → a file for exactly that day.
  const chooser = page.waitForEvent('filechooser');
  await box.locator('.ex-rc-miss').last().click();
  await (await chooser).setFiles(PDF);
  await box.locator('.ex-rc').first().waitFor({ timeout: 5000 });
  assert.equal(await box.locator('.ex-rc-date').first().inputValue(), pays[0]);
  assert.equal(await box.locator('.ex-rc-miss').count(), pays.length - 1);
  assert.equal((await srv.api('/api/expenses')).data.expenses[0].receipts[0].date, pays[0]);
  // It opens (a link to the file).
  const href = await box.locator('.ex-rc-name').first().getAttribute('href');
  assert.equal((await fetch(srv.base + href)).status, 200);

  // A dropped / picked file without a day → the latest open payment (today when none is open).
  const next = receiptDateFor({ ...expense, receipts: [{ date: pays[0] }] }, today);
  const chooser2 = page.waitForEvent('filechooser');
  await box.getByRole('button', { name: 'Add' }).click();
  await (await chooser2).setFiles({ ...PDF, name: 'scan.pdf' });
  await box.locator('.ex-rc').nth(1).waitFor({ timeout: 5000 });
  assert.deepEqual((await srv.api('/api/expenses')).data.expenses[0].receipts.map((r) => r.date), [pays[0], next]);
  await shot(page, 'receipts-editor-two');

  // Delete → Trash, Undo → back.
  await box.locator('.ex-rc').first().getByRole('button', { name: /Delete/ }).click();
  await page.getByRole('button', { name: 'Undo' }).click();
  await page.waitForFunction(() => document.querySelectorAll('.ex-rc').length === 2, null, { timeout: 5000 });
  assert.equal((await srv.api('/api/expenses')).data.expenses[0].receipts.length, 2);
  // Closed: the row says what's left.
  await page.getByRole('button', { name: 'Cancel' }).click();
  const left = missingReceipts({ ...expense, receipts: [{ date: pays[0] }, { date: next }] }, Number(today.slice(0, 4)), today).length;
  if (left) await row.getByText(`${left} missing`).waitFor();
  else await row.locator('.ex-row-rc:not(.miss)').waitFor();
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('on a phone the receipts fit', async () => {
  const ctx = await browser.newContext({ viewport: { width: 320, height: 760 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.goto(`${srv.base}/expenses`);
  await page.locator('.ex-row', { hasText: 'Adobe CC' }).click();
  await page.locator('.ex-rc-box').waitFor();
  await shot(page, 'receipts-phone');
  const wide = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok(wide <= 1, `${wide}px sideways`);
  await ctx.close();
});
