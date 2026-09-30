// Every page of the built app in a real browser, against the legacy library
// plus a few fresh items: each renders, nothing is logged as an error, and on a
// phone nothing scrolls sideways. `npm run test:e2e` builds first; Chromium
// comes from Playwright (`npx playwright install chromium`).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { startServer, tempDir } from '../tests/helpers.js';
import { seedLegacyLibrary } from '../tests/fixtures/legacy-library.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PHONES = [320, 390];
let srv;
let browser;
let pages;

before(async () => {
  assert.ok(fs.existsSync(path.join(ROOT, 'dist', 'index.html')), 'build the app first (npm run build)');
  const dir = await tempDir();
  await seedLegacyLibrary(dir);
  srv = await startServer({ dataDir: dir, env: { NODE_ENV: 'production', LINK_LOOKUP: 'off' } });
  const made = async (p, json, key) => {
    const r = await srv.api(p, { method: 'POST', json });
    assert.ok(r.status < 300, `${p} → ${r.status} ${JSON.stringify(r.data)}`);
    return r.data[key];
  };
  const note = await made('/api/notes', { title: 'Smoke note' }, 'note');
  const client = await made('/api/clients', { name: 'Smoke client' }, 'client');
  const post = await made('/api/content', { title: 'Smoke post', platforms: ['instagram', 'x'], format: 'reel' }, 'item');
  await made('/api/expenses', { name: 'Adobe CC', category: 'software', amount: 66, interval: 'month', start: '2026-01-15' }, 'expense');
  const mockup = await made('/api/mockups', { kind: '2d', name: 'Smoke post', d2: { type: 'ig-post' } }, 'mockup');
  const board = await made('/api/plans/plan2/storyboards', { template: 'launch' }, 'block');
  pages = [
    '/work', '/branding', '/motion', '/logo', '/businesscard', '/color', '/imagegallery', '/font', '/logonogo',
    '/project/brand1', '/project/mot1', '/project/logo2', '/project/bc1', '/project/col1', '/project/font1', '/project/img1', '/project/nogo1', '/gallery/gal1',
    '/plan', '/plan/plan1', '/plan/plan2', '/plan/plan3', '/board', '/logo-tester', '/software', '/software/sw1',
    '/storyboards', `/storyboards/plan2/${board.id}`, '/mockups', `/mockups/${mockup.id}`,
    '/time', '/expenses', '/clients', `/clients/${client.id}`, '/notes', `/notes/${note.id}`,
    '/content', `/content/${post.id}`, '/achievements', '/inbox', '/trash', '/settings',
  ];
  browser = await chromium.launch();
});
after(async () => { await browser?.close(); await srv?.stop(); });

/** Open each page; → [problem, …] (page errors, console errors, a page that stayed empty, sideways scroll). */
async function visit(contextOptions, { overflow = false } = {}) {
  const ctx = await browser.newContext({ ...contextOptions, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  const problems = [];
  let at = '';
  page.on('pageerror', (e) => problems.push(`${at}: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') problems.push(`${at}: console: ${m.text()}`); });
  for (const u of pages) {
    at = u;
    await page.goto(srv.base + u, { waitUntil: 'load' });
    // until the page's own code and data are in (its spinner gone), then a moment to settle
    await page.waitForFunction(() => document.querySelector('.main-inner') && !document.querySelector('.main-inner .spinner'), null, { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(400);
    if (!(await page.locator('.main-inner *').count())) problems.push(`${u}: nothing rendered`);
    if (await page.getByText('Something went wrong').count()) problems.push(`${u}: error boundary shown`);
    if (overflow) {
      const wide = await page.evaluate(() => {
        const vw = document.documentElement.clientWidth;
        const sw = document.documentElement.scrollWidth;
        if (sw <= vw + 1) return null;
        const out = [...document.querySelectorAll('body *')]
          .filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.right > vw + 1 && getComputedStyle(el).position !== 'fixed'; })
          .map((el) => `${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]}`);
        return `${sw}px wide: ${[...new Set(out)].slice(0, 4).join(', ')}`;
      });
      if (wide) problems.push(`${u}: ${wide}`);
    }
  }
  await ctx.close();
  return problems;
}

test('every page renders on a desktop, without errors', async () => {
  const problems = await visit({ viewport: { width: 1440, height: 900 } });
  assert.deepEqual(problems, []);
});

for (const width of PHONES) {
  test(`every page fits a ${width} px phone, without errors`, async () => {
    const problems = await visit({ viewport: { width, height: 800 }, isMobile: true, hasTouch: true }, { overflow: true });
    assert.deepEqual(problems, []);
  });
}
