// Presentations: decks from templates (filled in for a client), slides saved and
// cleaned up, pictures, a copy, the look for new decks, search, recent edits,
// the unused-files scan, Trash and back — and the slide helpers.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { startServer, tempDir, exists } from './helpers.js';
import { accentLines, plain, slideName, blankData, SLIDE_TYPES, DECK_TEMPLATES } from '../src/lib/slides.js';
import { normalizeSlide } from '../server/schema.js';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
let srv;
before(async () => { srv = await startServer({ dataDir: await tempDir() }); });
after(async () => { await srv?.stop(); });

const picture = (name = 'cover.png') => { const fd = new FormData(); fd.append('file', new Blob([PNG], { type: 'image/png' }), name); return fd; };

test('slides: accent marks, names, blank data; every template slide survives the clean-up', () => {
  assert.deepEqual(accentLines('Hello,\nit’s *nice* to'), [[{ text: 'Hello,', accent: false }], [{ text: 'it’s ', accent: false }, { text: 'nice', accent: true }, { text: ' to', accent: false }]]);
  assert.equal(plain('How *I* work…'), 'How I work…');
  assert.equal(slideName({ type: 'cards', data: { title: 'Project *goals*\nfor you' } }), 'Project goals');
  assert.equal(slideName({ type: 'image', data: {} }), 'Big picture');
  for (const type of Object.keys(SLIDE_TYPES)) assert.deepEqual(Object.keys(normalizeSlide({ type, data: blankData(type) }).data), SLIDE_TYPES[type].fields.map((f) => f.key));
  for (const t of Object.values(DECK_TEMPLATES)) {
    for (const s of t.slides()) {
      const n = normalizeSlide(s);
      assert.ok(n, `${t.label}: ${s.type}`);
      assert.deepEqual(n.data, JSON.parse(JSON.stringify(n.data)));
      for (const f of SLIDE_TYPES[s.type].fields) if (f.kind === 'text' || f.kind === 'textarea') assert.equal(n.data[f.key], s.data[f.key] ?? '', `${t.label} ${s.type}.${f.key}`);
    }
  }
});

test('presentations: from a template for a client, saved, pictures, copy, defaults, search, Trash and back', async () => {
  const templates = (await srv.api('/api/presentations/templates')).data.templates;
  assert.deepEqual(templates.map((t) => t.key), ['proposal', 'identity', 'case', 'blank']);
  const client = (await srv.api('/api/clients', { method: 'POST', json: { name: 'Gute Stube' } })).data.client;

  // A proposal for the client: its name where the template says [Client].
  let r = await srv.api('/api/presentations', { method: 'POST', json: { template: 'proposal', clientId: client.id } });
  assert.equal(r.status, 201);
  let deck = r.data.presentation;
  assert.deepEqual([deck.title, deck.kind, deck.label, deck.meta.preparedFor, deck.theme], ['Project proposal · Gute Stube', 'proposal', 'PROJECT PROPOSAL', 'Gute Stube', { preset: 'dark', accent: '#007588' }]);
  assert.equal(deck.slides.length, DECK_TEMPLATES.proposal.slides().length);
  assert.ok(deck.slides.some((s) => s.data.title === 'Project *goals* for Gute Stube:'));
  assert.ok(deck.slides.every((s) => s.id));

  // Saved: a slide changed, one moved, nonsense dropped, a wrong colour ignored.
  const slides = deck.slides.map((s) => (s.type === 'intro' ? { ...s, data: { ...s.data, title: 'Hi *there*' } } : s));
  [slides[1], slides[2]] = [slides[2], slides[1]];
  r = await srv.api(`/api/presentations/${deck.id}`, { method: 'PATCH', json: { slides: [...slides, { type: 'nonsense', data: {} }], theme: { accent: 'blue' }, title: 'Proposal GS', meta: { version: 'v2.0', date: 'soon' } } });
  deck = r.data.presentation;
  assert.deepEqual([deck.slides.length, deck.slides[2].type, deck.slides[2].data.title, deck.theme.accent, deck.title, deck.meta.version], [slides.length, 'intro', 'Hi *there*', '#007588', 'Proposal GS', 'v2.0']);
  assert.match(deck.meta.date, /^\d{4}-\d{2}-\d{2}$/); // a wrong date leaves the one there
  r = await srv.api(`/api/presentations/${deck.id}`, { method: 'PATCH', json: { theme: { preset: 'light', accent: '#E4572E' } } });
  assert.deepEqual(r.data.presentation.theme, { preset: 'light', accent: '#e4572e' });

  // A picture: uploaded, served, put on the cover; a non-picture refused; a path outside the folder isn't taken.
  r = await srv.api(`/api/presentations/${deck.id}/images`, { method: 'POST', body: picture() });
  assert.equal(r.status, 201);
  const { file } = r.data;
  assert.match(file, /^images\/\w{6}-cover\.png$/);
  assert.equal((await fetch(`${srv.base}/data/presentation/${deck.id}/${file}`)).status, 200);
  const bad = new FormData(); bad.append('file', new Blob(['x'], { type: 'text/plain' }), 'notes.txt');
  assert.equal((await srv.api(`/api/presentations/${deck.id}/images`, { method: 'POST', body: bad })).status, 400);
  const withPic = deck.slides.map((s, i) => (i === 0 ? { ...s, data: { ...s.data, image: { file, x: 30 } } } : i === 1 ? { ...s, data: { ...s.data, image: { file: '../../db.json' } } } : s));
  deck = (await srv.api(`/api/presentations/${deck.id}`, { method: 'PATCH', json: { slides: withPic, brand: { name: 'Achim Benzel', lines: ['info@achimbenzel.com'], logo: file } } })).data.presentation;
  assert.deepEqual(deck.slides[0].data.image, { file, fit: 'cover', x: 30, y: 50 });
  assert.equal(deck.slides[1].data.items?.[0]?.image ?? deck.slides[1].data.image ?? null, null);
  assert.equal(deck.brand.logo, file);

  // The unused-files scan leaves its pictures alone.
  const abs = path.join(srv.dataDir, 'presentation', deck.id, file);
  const old = new Date(Date.now() - 3600e3);
  await fsp.utimes(abs, old, old);
  assert.ok(!(await srv.api('/api/maintenance/unused')).data.files.some((f) => f.rel.startsWith('presentation/')));

  // Found by its slides' text; and it's where you left off.
  assert.ok((await srv.api('/api/search?q=iterative')).data.results.some((x) => x.kind === 'presentation' && x.id === deck.id));
  await new Promise((res) => { setTimeout(res, 50); });
  assert.ok((await srv.api('/api/recent')).data.items.some((x) => x.kind === 'presentation' && x.href === `/presentations/${deck.id}`));

  // A copy, with its own pictures.
  const copy = (await srv.api(`/api/presentations/${deck.id}/duplicate`, { method: 'POST' })).data.presentation;
  assert.equal(copy.title, 'Proposal GS (copy)');
  assert.notEqual(copy.slides[0].id, deck.slides[0].id);
  assert.ok(await exists(path.join(srv.dataDir, 'presentation', copy.id, file)));

  // Its look for new decks: a new one starts with the logo (copied), the name, the contact and the colours.
  const defaults = (await srv.api(`/api/presentations/${deck.id}/defaults`, { method: 'POST' })).data.defaults;
  assert.deepEqual([defaults.brand.name, defaults.theme.accent, /^deck-logo-/.test(defaults.brand.logo)], ['Achim Benzel', '#e4572e', true]);
  const next = (await srv.api('/api/presentations', { method: 'POST', json: { template: 'identity' } })).data.presentation;
  assert.deepEqual([next.brand.name, next.brand.lines, next.theme.preset, next.meta.preparedBy, next.label], ['Achim Benzel', ['info@achimbenzel.com'], 'light', 'Achim Benzel', 'BRAND IDENTITY']);
  assert.ok(next.brand.logo && await exists(path.join(srv.dataDir, 'presentation', next.id, next.brand.logo)));
  assert.ok(!next.slides.some((s) => JSON.stringify(s).includes('[Name]')));

  // Pinned first in the list.
  await srv.api(`/api/presentations/${copy.id}`, { method: 'PATCH', json: { pinned: true } });
  assert.equal((await srv.api('/api/presentations')).data.presentations[0].id, copy.id);

  // → Trash with its pictures, and back.
  r = await srv.api(`/api/presentations/${deck.id}`, { method: 'DELETE' });
  assert.equal(await exists(abs), false);
  const t = (await srv.api('/api/trash')).data.items.find((i) => i.trashId === r.data.trashId);
  assert.deepEqual([t.kind, t.title], ['presentation', 'Proposal GS']);
  assert.ok(t.thumb);
  await srv.api(`/api/trash/${r.data.trashId}/restore`, { method: 'POST' });
  assert.equal(await exists(abs), true);
  assert.equal((await srv.api(`/api/presentations/${deck.id}`)).data.presentation.slides[0].data.image.file, file);
  assert.equal((await srv.api('/api/presentations/nope', { method: 'PATCH', json: { title: 'x' } })).status, 404);
});
