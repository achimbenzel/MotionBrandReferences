// Presentations in a real browser: a new deck from the proposal template for a
// client, a click on a text in the slide finds its field, typing changes the
// slide and is saved, a slide added and a picture put on it, presenting
// (keys, Esc), the PDF (one page per shown slide) and PowerPoint; saved as a
// template and a new deck from it on a client's page, a case study filled from
// a project. On a phone it all fits.
// Needs `npm run build` first.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { startServer, tempDir } from '../tests/helpers.js';
import { DECK_TEMPLATES } from '../src/lib/slides.js';
import { fileName } from '../src/lib/pptxExport.js';
import { readCentralDirectory, readEntryBuffer } from '../server/zip.js';

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

const saved = async (id = deckId) => (await srv.api(`/api/presentations/${id}`)).data.presentation;
// Waits until what's stored passes the check (autosave runs a moment after a change).
async function until(check, ms = 5000) {
  const end = Date.now() + ms;
  while (!(await check())) {
    if (Date.now() > end) throw new Error(`not saved in ${ms} ms: ${check}`);
    await new Promise((r) => setTimeout(r, 100));
  }
}

test('a proposal for a client: edit by clicking the slide, add a slide with a picture, present, PDF, PowerPoint', async () => {
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
  await until(async () => (await saved()).slides[0].data.title === 'Proposal *Gute Stube*');

  // A slide added after the third: a big picture, uploaded.
  await page.locator('.pz-thumb').nth(2).locator('.pz-thumb-btn').click();
  await page.getByRole('button', { name: 'Add a slide' }).click();
  await page.getByRole('menuitem', { name: 'Big picture' }).click();
  assert.equal(await page.locator('.pz-thumb.on .pz-thumb-n').innerText(), '4');
  const chooser = page.waitForEvent('filechooser');
  await page.locator('.pzf-image').getByRole('button', { name: 'Upload' }).click();
  await (await chooser).setFiles({ name: 'hero.png', mimeType: 'image/png', buffer: PNG });
  await page.locator('.pz-stage-slide .pz-full img').waitFor({ timeout: 5000 });
  await until(async () => {
    const p = await saved();
    return p.slides[3].type === 'image' && /^images\/.+hero\.png$/.test(p.slides[3].data.image?.file || '');
  });

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
  await page.getByRole('button', { name: 'Export' }).click();
  await page.getByRole('menuitem', { name: 'PDF' }).click();
  await page.waitForFunction(() => window.__printed != null, null, { timeout: 8000 });
  assert.equal(await page.evaluate(() => window.__printed), shown);

  // PowerPoint: a slide per shown slide, the text as text, the picture as a picture.
  await page.getByRole('button', { name: 'Export' }).click();
  const [download] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), page.getByRole('menuitem', { name: 'PowerPoint (.pptx)' }).click()]);
  assert.equal(download.suggestedFilename(), `${fileName((await saved()).title)}.pptx`);
  const pptx = path.join(srv.dataDir, 'deck.pptx');
  await download.saveAs(pptx);
  const fh = await fsp.open(pptx, 'r');
  try {
    const entries = await readCentralDirectory(fh, (await fsp.stat(pptx)).size);
    const slideXml = async (n) => (await readEntryBuffer(fh, entries.find((e) => e.name === `ppt/slides/slide${n}.xml`))).toString('utf8');
    assert.equal(entries.filter((e) => /^ppt\/slides\/slide\d+\.xml$/.test(e.name)).length, shown);
    assert.match(await slideXml(1), /<a:t>Gute Stube<\/a:t>/i);
    assert.match(await slideXml(3), /<p:pic>/);
  } finally { await fh.close(); }
  assert.equal(await page.locator('.pz-pptx-root').count(), 0);
  await page.locator('.toast', { hasText: `PowerPoint with ${shown} slides` }).waitFor();
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('saved as a template, a new deck from it on the client page; a case study from a project', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 950 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const kiara = (await srv.api('/api/clients', { method: 'POST', json: { name: 'Café Kiara' } })).data.client;
  const plan = (await srv.api('/api/plans', { method: 'POST', json: { name: 'Bistro rebrand', clientId: kiara.id } })).data.plan;
  const brief = (await srv.api(`/api/plans/${plan.id}/blocks`, { method: 'POST', json: { type: 'briefing' } })).data.block;
  await srv.api(`/api/plans/${plan.id}/blocks/${brief.id}`, { method: 'PATCH', json: { fields: [{ label: 'Goal', value: 'A warm identity for a bistro.' }] } });

  // The deck from the first test becomes a template: the client's name turns into [Client].
  await page.goto(`${srv.base}/presentations/${deckId}`);
  await page.waitForSelector('.pz-stage-slide');
  await page.getByRole('button', { name: 'More' }).click();
  await page.getByRole('menuitem', { name: 'Save as template…' }).click();
  await page.locator('.pz-save-tpl input').first().fill('Restaurant proposal');
  await page.getByRole('button', { name: 'Save template' }).click();
  await page.locator('.toast', { hasText: 'Restaurant proposal' }).waitFor();
  const { own } = (await srv.api('/api/presentations/templates')).data;
  assert.deepEqual(own.map((t) => t.name), ['Restaurant proposal']);
  assert.match(own[0].slides[0].data.title, /\[Client\]/);

  // The client's page: their presentations (none yet), a new one from the template for them.
  await page.goto(`${srv.base}/clients/${kiara.id}`);
  const sec = page.locator('.client-card-sec', { has: page.getByRole('heading', { name: /^Presentations/ }) });
  await sec.locator('.client-empty').waitFor();
  await sec.getByRole('button', { name: 'New presentation' }).click();
  await page.getByRole('radio', { name: /Restaurant proposal/ }).click();
  assert.equal(await page.locator('.pz-new select').inputValue(), kiara.id);
  await page.getByRole('button', { name: 'Create' }).click();
  await page.waitForSelector('.pz-stage-slide');
  const newId = page.url().split('/presentations/')[1].split('?')[0];
  let made = await saved(newId);
  assert.equal(made.clientId, kiara.id);
  assert.equal(made.slides.length, own[0].slides.length);
  assert.match(made.slides[0].data.title, /Café Kiara/);

  // A case study from the project: a slide after the one picked, filled from it (no pictures: no gallery).
  const before = made.slides.length;
  await page.getByRole('button', { name: 'Add a slide' }).click();
  await page.getByRole('menuitem', { name: 'Case study from a project…' }).click();
  await page.locator('.pz-from-item', { hasText: 'Bistro rebrand' }).click();
  await page.locator('.pz-stage-slide', { hasText: 'Bistro rebrand' }).waitFor();
  await until(async () => (await saved(newId)).slides.length === before + 1);
  made = await saved(newId);
  const cover = made.slides.find((s) => s.type === 'caseCover' && s.data.title === 'Bistro rebrand');
  assert.ok(cover);
  assert.equal(cover.data.text, 'A warm identity for a bistro.');
  assert.equal(cover.data.facts.find((f) => f.label === 'Client')?.value, 'Café Kiara');

  // Back on the client's page: the deck is listed by its cover.
  await page.goto(`${srv.base}/clients/${kiara.id}`);
  await sec.locator('.client-deck').first().waitFor();
  assert.equal(await sec.locator('.client-deck').count(), 1);
  await sec.locator('.client-deck').click();
  await page.waitForURL(`**/presentations/${newId}`);
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
  await until(async () => (await saved()).theme.preset === 'light');
  assert.ok(await page.locator('.pz-stage-slide .pz-slide.light').count());
  await ctx.close();
});
