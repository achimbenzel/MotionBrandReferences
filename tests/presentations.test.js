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
  assert.match(file, /^images\/[\w-]{6}-cover\.png$/); // the id may hold - and _
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

test('your own templates: a deck saved as one (client neutral, with its pictures), a new deck from it, renamed, Trash and back', async () => {
  const client = (await srv.api('/api/clients', { method: 'POST', json: { name: 'Nordlicht' } })).data.client;
  let deck = (await srv.api('/api/presentations', { method: 'POST', json: { template: 'proposal', clientId: client.id } })).data.presentation;
  const { file } = (await srv.api(`/api/presentations/${deck.id}/images`, { method: 'POST', body: picture('hero.png') })).data;
  deck = (await srv.api(`/api/presentations/${deck.id}`, { method: 'PATCH', json: {
    theme: { preset: 'light', accent: '#3fa34d' }, label: 'ANGEBOT',
    slides: deck.slides.slice(0, 6).map((s, i) => (i === 0 ? { ...s, data: { ...s.data, image: { file } } } : s)),
  } })).data.presentation;
  assert.ok(deck.slides.some((s) => s.data.title === 'Project *goals* for Nordlicht:'));

  let r = await srv.api(`/api/presentations/${deck.id}/template`, { method: 'POST', json: {} });
  assert.equal(r.status, 201);
  const tpl = r.data.template;
  assert.deepEqual([tpl.name, tpl.label, tpl.kind, tpl.theme, tpl.slides.length], ['Project proposal', 'ANGEBOT', 'proposal', { preset: 'light', accent: '#3fa34d' }, 6]);
  assert.ok(tpl.slides.some((s) => s.data.title === 'Project *goals* for [Client]:'));
  assert.ok(await exists(path.join(srv.dataDir, 'presentation-template', tpl.id, file)));
  const list = (await srv.api('/api/presentations/templates')).data;
  assert.deepEqual([list.templates.length, list.own.map((t) => t.id)], [4, [tpl.id]]);

  // A new deck from it, for another client: their name where [Client] was, its own copy of the pictures, its look.
  const other = (await srv.api('/api/clients', { method: 'POST', json: { name: 'Gute Stube 2' } })).data.client;
  const made = (await srv.api('/api/presentations', { method: 'POST', json: { template: `own:${tpl.id}`, clientId: other.id } })).data.presentation;
  assert.deepEqual([made.title, made.label, made.theme.accent, made.slides.length, made.meta.preparedFor], ['Project proposal · Gute Stube 2', 'ANGEBOT', '#3fa34d', 6, 'Gute Stube 2']);
  assert.ok(made.slides.some((s) => s.data.title === 'Project *goals* for Gute Stube 2:'));
  assert.equal(made.slides[0].data.image.file, file);
  assert.ok(await exists(path.join(srv.dataDir, 'presentation', made.id, file)));
  assert.notEqual(made.slides[0].id, tpl.slides[0].id);
  assert.equal((await srv.api('/api/presentations', { method: 'POST', json: { template: 'own:nope' } })).status, 404);

  // Renamed; → Trash (decks made from it keep their pictures) and back.
  r = await srv.api(`/api/presentation-templates/${tpl.id}`, { method: 'PATCH', json: { name: 'Proposal (short)', hint: 'Six slides' } });
  assert.deepEqual([r.data.template.name, r.data.template.hint], ['Proposal (short)', 'Six slides']);
  r = await srv.api(`/api/presentation-templates/${tpl.id}`, { method: 'DELETE' });
  assert.equal((await srv.api('/api/presentations/templates')).data.own.length, 0);
  assert.ok(await exists(path.join(srv.dataDir, 'presentation', made.id, file)));
  const t = (await srv.api('/api/trash')).data.items.find((i) => i.trashId === r.data.trashId);
  assert.deepEqual([t.kind, t.title], ['deckTemplate', 'Proposal (short)']);
  await srv.api(`/api/trash/${r.data.trashId}/restore`, { method: 'POST' });
  assert.equal((await srv.api('/api/presentations/templates')).data.own[0].id, tpl.id);
  assert.ok(await exists(path.join(srv.dataDir, 'presentation-template', tpl.id, file)));
});

test('a case study from a project (briefing, client, deliverables, pictures) or a reference', async () => {
  const deck = (await srv.api('/api/presentations', { method: 'POST', json: { template: 'case' } })).data.presentation;
  const client = (await srv.api('/api/clients', { method: 'POST', json: { name: 'Café Kiara' } })).data.client;
  const plan = (await srv.api('/api/plans', { method: 'POST', json: { name: 'Café rebrand', clientId: client.id } })).data.plan;
  await srv.api(`/api/plans/${plan.id}`, { method: 'PATCH', json: { end: '2025-11-30' } });
  const brief = (await srv.api(`/api/plans/${plan.id}/blocks`, { method: 'POST', json: { type: 'briefing' } })).data.block;
  await srv.api(`/api/plans/${plan.id}/blocks/${brief.id}`, { method: 'PATCH', json: { fields: [{ label: 'Project goal', value: 'A warm, nostalgic identity for a café and bistro.\n\nMore later.' }] } });
  const deliv = (await srv.api(`/api/plans/${plan.id}/blocks`, { method: 'POST', json: { type: 'deliverables' } })).data.block;
  await srv.api(`/api/plans/${plan.id}/blocks/${deliv.id}`, { method: 'PATCH', json: { items: [{ name: 'Logo' }, { name: 'Menu' }, { name: 'Logo' }] } });
  const mood = (await srv.api(`/api/plans/${plan.id}/blocks`, { method: 'POST', json: { type: 'moodboard' } })).data.block;
  const fd = new FormData();
  for (const n of ['a.png', 'b.png']) fd.append('files', new Blob([PNG], { type: 'image/png' }), n);
  await srv.api(`/api/plans/${plan.id}/blocks/${mood.id}/files`, { method: 'POST', body: fd });

  let r = await srv.api(`/api/presentations/${deck.id}/case-from`, { method: 'POST', json: { kind: 'plan', id: plan.id } });
  assert.equal(r.status, 200);
  assert.deepEqual([r.data.title, r.data.text], ['Café rebrand', 'A warm, nostalgic identity for a café and bistro.']);
  assert.deepEqual(r.data.facts, [{ label: 'Client', value: 'Café Kiara' }, { label: 'Year', value: '2025' }, { label: 'Scope', value: 'Logo - Menu' }]);
  assert.match(r.data.image.file, /^images\/[\w-]{6}-[\w-]+\.png$/); // moodboard pictures: the first for the cover …
  assert.equal(r.data.images.length, 1);                                // … the rest for the case pictures
  assert.ok(await exists(path.join(srv.dataDir, 'presentation', deck.id, r.data.image.file)));

  // A reference: its title, notes, year, kind, tags and picture.
  const ref = new FormData();
  ref.append('type', 'imagegallery'); ref.append('title', 'Joeys Picknick'); ref.append('year', '2026'); ref.append('notes', 'A food truck by the Rhine.');
  ref.append('tags', JSON.stringify(['Brand Identity', 'Print'])); ref.append('image', new Blob([PNG], { type: 'image/png' }), 'joeys.png');
  const project = (await srv.api('/api/projects', { method: 'POST', body: ref })).data.project;
  r = await srv.api(`/api/presentations/${deck.id}/case-from`, { method: 'POST', json: { kind: 'project', id: project.id } });
  assert.deepEqual([r.data.title, r.data.text, r.data.facts.map((f) => f.value), r.data.images], ['Joeys Picknick', 'A food truck by the Rhine.', ['2026', 'Image Gallery', 'Brand Identity - Print'], []]);
  assert.ok(r.data.image.file);
  assert.equal((await srv.api(`/api/presentations/${deck.id}/case-from`, { method: 'POST', json: { kind: 'plan', id: 'nope' } })).status, 404);
});
