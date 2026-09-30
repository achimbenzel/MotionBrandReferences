// The same library on two devices (two browser profiles): a change on one shows
// on the other by itself; an edit that clashes with one made meanwhile asks
// "keep mine / load theirs" instead of silently overwriting; what's shared to
// the Inbox appears at once; and a browser keeps one live connection however
// many tabs are open. Needs `npm run build` first.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { startServer, tempDir } from '../tests/helpers.js';
import { seedLegacyLibrary } from '../tests/fixtures/legacy-library.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let srv;
let browser;
let desk;
let phone;
let plan;
let block;

before(async () => {
  assert.ok(fs.existsSync(path.join(ROOT, 'dist', 'index.html')), 'build the app first (npm run build)');
  const dir = await tempDir();
  await seedLegacyLibrary(dir);
  srv = await startServer({ dataDir: dir, env: { NODE_ENV: 'production', LINK_LOOKUP: 'off' } });
  plan = (await srv.api('/api/plans', { method: 'POST', json: { name: 'Shared project' } })).data.plan;
  block = (await srv.api(`/api/plans/${plan.id}/blocks`, { method: 'POST', json: { type: 'text', tab: 'brief' } })).data.block;
  await srv.api(`/api/plans/${plan.id}/blocks/${block.id}`, { method: 'PATCH', json: { content: 'Start' } });
  // PW_CHANNEL=chrome: an installed Google Chrome (CI) instead of Playwright's own Chromium.
  browser = await chromium.launch(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {});
  desk = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
});
after(async () => { await browser?.close(); await srv?.stop(); });

const open = async (ctx, url) => {
  const page = await ctx.newPage();
  await page.goto(srv.base + url);
  await page.waitForSelector('.notes-textarea, .inbox, .main-inner');
  return page;
};
const text = (page) => page.locator('.notes-textarea').first();
const saved = async () => (await srv.api(`/api/plans/${plan.id}`)).data.plan.blocks.find((b) => b.id === block.id).content;
// Another device's save of the same text, straight to the server.
const otherDevice = (content) => srv.api(`/api/plans/${plan.id}/blocks/${block.id}`, { method: 'PATCH', json: { content }, headers: { 'X-Client-Id': 'tab-otherdevice' } });

test('a change on one device shows on the other by itself', async () => {
  const a = await open(desk, `/plan/${plan.id}?tab=brief`);
  const b = await open(phone, `/plan/${plan.id}?tab=brief`);
  await text(b).fill('Written on the phone');
  await a.waitForFunction(() => document.querySelector('.notes-textarea')?.value === 'Written on the phone', null, { timeout: 5000 });
  assert.equal(await saved(), 'Written on the phone');
  await a.close(); await b.close();
});

test('a clash asks: keep mine overwrites theirs', async () => {
  const a = await open(desk, `/plan/${plan.id}?tab=brief`);
  await text(a).fill('Desk version');   // saved half a second later…
  await otherDevice('Other version');   // …but another device saves first
  await a.getByRole('alertdialog').getByRole('heading', { name: 'Changed on another device' }).waitFor({ timeout: 5000 });
  await a.getByRole('button', { name: 'Keep mine' }).click();
  await a.waitForTimeout(800);
  assert.equal(await saved(), 'Desk version');
  assert.equal(await a.getByRole('alertdialog').count(), 0);
  // Typing on afterwards doesn't ask again.
  await text(a).fill('Desk version, more');
  await a.waitForTimeout(1200);
  assert.equal(await saved(), 'Desk version, more');
  assert.equal(await a.getByRole('alertdialog').count(), 0);
  await a.close();
});

test('a clash asks: load theirs shows the other version and keeps it', async () => {
  const a = await open(desk, `/plan/${plan.id}?tab=brief`);
  await text(a).fill('Desk again');
  await otherDevice('Their final text');
  await a.getByRole('alertdialog').getByRole('heading', { name: 'Changed on another device' }).waitFor({ timeout: 5000 });
  await a.getByRole('button', { name: 'Load theirs' }).click();
  await a.waitForFunction(() => document.querySelector('.notes-textarea')?.value === 'Their final text', null, { timeout: 5000 });
  assert.equal(await saved(), 'Their final text');
  await a.getByText(/changed on another device — showing that version now/).waitFor({ timeout: 3000 });
  await a.close();
});

test('shared to the Inbox from the phone: on the desk at once', async () => {
  const a = await open(desk, '/inbox');
  const before = await a.locator('.inbox-item, .inbox-card, [data-inbox-item]').count();
  const fd = new FormData();
  fd.append('text', 'A link from the phone https://example.com/idea');
  await srv.api('/api/inbox', { method: 'POST', body: fd, headers: { 'X-Client-Id': 'tab-phone-share' } });
  await a.getByText('A link from the phone', { exact: false }).first().waitFor({ timeout: 5000 });
  assert.ok((await a.locator('.inbox-item, .inbox-card, [data-inbox-item]').count()) >= before);
  await a.close();
});

test('one live connection per browser, however many tabs', async () => {
  const streams = [];
  const tabs = [];
  for (let i = 0; i < 4; i += 1) {
    const p = await desk.newPage();
    p.on('request', (r) => { if (r.url().endsWith('/api/events')) streams.push(i); });
    await p.goto(`${srv.base}/plan/${plan.id}?tab=brief`);
    await p.waitForSelector('.notes-textarea');
    tabs.push(p);
  }
  await tabs[0].waitForTimeout(500);
  assert.equal(streams.length, 1, `streams opened by tabs ${streams.join(', ')}`);
  // Every tab still hears about changes.
  await otherDevice('Heard everywhere');
  for (const p of tabs) await p.waitForFunction(() => document.querySelector('.notes-textarea')?.value === 'Heard everywhere', null, { timeout: 5000 });
  // The tab holding the connection closes: another one takes over.
  const holder = tabs[streams[0]];
  await holder.close();
  const rest = tabs.filter((p) => p !== holder);
  await rest[0].waitForTimeout(800);
  await otherDevice('After the handover');
  for (const p of rest) await p.waitForFunction(() => document.querySelector('.notes-textarea')?.value === 'After the handover', null, { timeout: 6000 });
  for (const p of rest) await p.close();
});
