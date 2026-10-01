// Presentations in a real browser: a new deck from the proposal template for a
// client, a click on a text in the slide finds its field, typing changes the
// slide and is saved, a slide added and a picture put on it, presenting
// (keys, Esc) and the PDF (one page per shown slide). On a phone it all fits.
// Needs `npm run build` first.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { startServer, tempDir } from '../tests/helpers.js';
import { DECK_TEMPLATES } from '../src/lib/slides.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
let srv;
let browser;
let deckId;

before(async () => {
  assert.ok(fs.existsSync(path.join(ROOT, 'dist', 'index.html')), 'build the app first (npm run build)');
  srv = await startServer({ dataDir: await tempDir(), env: { NODE_ENV: 'production', LINK_LOOKUP: 'off' } });
  await srv.api('/api/clients', { method: 'POST', json: { name: 'Gute Stube' } });
  await srv.api('/api/settings', { method: 'PATCH', json: { imageUploads: { mode: 'off' } } }); // no "make it smaller?" question
  browser = await chromium.launch(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {});
});
after(async () => { await browser?.close(); await srv?.stop(); });

const saved = async () => (await srv.api(`/api/presentations/${deckId}`)).data.presentation;

test('a proposal for a client: edit by clicking the slide, add a slide with a picture, present, PDF', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 950 } });
  await ctx.addInitScript(() => { window.print = () => { window.__printed = document.querySelectorAll('.pz-print-page').length; }; });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${srv.base}/presentations`);
  await page.getByRole('button', { name: 'New presentation' }).first().click();
  await page.getByRole('radio', { name: /Project proposal/ }).click();
  await page.locator('.pz-new select').selectOption({ label: 'Gute Stube' });
  await page.getByRole('button', { name: 'Create' }).click();
  await page.waitForSelector('.pz-stage-slide');
  deckId = page.url().split('/presentations/')[1].split('?')[0];
  assert.equal(await page.locator('.pz-thumb').count(), DECK_TEMPLATES.proposal.slides().length);
  assert.equal((await saved()).meta.preparedFor, 'Gute Stube');

  // A click on the cover's title: its field, focused; what's typed shows on the slide and is saved.
  await page.locator('.pz-stage-slide [data-field="title"]').click();
  await page.waitForFunction(() => document.activeElement?.getAttribute('data-path') === 'title');
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('Proposal *Gute Stube*');
  await page.locator('.pz-stage-slide .pz-accent', { hasText: 'Gute Stube' }).waitFor();
  await page.waitForFunction(async (id) => (await (await fetch(`/api/presentations/${id}`)).json()).presentation.slides[0].data.title === 'Proposal *Gute Stube*', deckId, { timeout: 5000 });

  // A slide added after the third: a big picture, uploaded.
  await page.locator('.pz-thumb').nth(2).locator('.pz-thumb-btn').click();
  await page.getByRole('button', { name: 'Add a slide' }).click();
  await page.getByRole('menuitem', { name: 'Big picture' }).click();
  assert.equal(await page.locator('.pz-thumb.on .pz-thumb-n').innerText(), '4');
  const chooser = page.waitForEvent('filechooser');
  await page.locator('.pzf-image').getByRole('button', { name: 'Upload' }).click();
  await (await chooser).setFiles({ name: 'hero.png', mimeType: 'image/png', buffer: PNG });
  await page.locator('.pz-stage-slide .pz-full img').waitFor({ timeout: 5000 });
  await page.waitForFunction(async (id) => {
    const p = (await (await fetch(`/api/presentations/${id}`)).json()).presentation;
    return p.slides[3].type === 'image' && /^images\/.+hero\.png$/.test(p.slides[3].data.image?.file || '');
  }, deckId, { timeout: 5000 });

  // Hidden slides are left out of presenting and the PDF.
  await page.locator('.pz-thumb').nth(1).hover();
  await page.locator('.pz-thumb').nth(1).getByRole('button', { name: 'Slide options' }).click();
  await page.getByRole('menuitem', { name: 'Hide when presenting' }).click();
  const shown = DECK_TEMPLATES.proposal.slides().length; // +1 added, −1 hidden

  // Presenting: from the slide picked, → and ←, Esc to leave.
  await page.locator('.pz-thumb').nth(0).locator('.pz-thumb-btn').click();
  await page.getByRole('button', { name: 'Present', exact: true }).click();
  await page.locator('.pz-present').waitFor();
  assert.equal(await page.locator('.pz-present-bar span').innerText(), `1 / ${shown}`);
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.locator('.pz-present-bar span').innerText(), `3 / ${shown}`);
  assert.equal(await page.locator('.pz-present .pz-t-image').count(), 1); // the hidden intro skipped: 3rd is the picture
  await page.keyboard.press('Escape');
  await page.locator('.pz-present').waitFor({ state: 'detached' });

  // The PDF: one page per shown slide.
  await page.getByRole('button', { name: 'PDF' }).click();
  await page.waitForFunction(() => window.__printed != null, null, { timeout: 8000 });
  assert.equal(await page.evaluate(() => window.__printed), shown);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('the list shows it; on a phone the editor fits', async () => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.goto(`${srv.base}/presentations`);
  await page.locator('.pz-deck', { hasText: 'Gute Stube' }).click();
  await page.waitForSelector('.pz-stage-slide');
  const wide = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok(wide <= 1, `${wide}px sideways`);
  await page.getByRole('tab', { name: 'Presentation' }).click();
  await page.getByRole('button', { name: 'Light' }).click();
  await page.waitForFunction(async (id) => (await (await fetch(`/api/presentations/${id}`)).json()).presentation.theme.preset === 'light', deckId, { timeout: 5000 });
  assert.ok(await page.locator('.pz-stage-slide .pz-slide.light').count());
  await ctx.close();
});
