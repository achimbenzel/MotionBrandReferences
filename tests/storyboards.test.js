// Storyboards: shot fields, templates, copies in another format, and frames
// taken from the plan or from Motion references.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, tempDir } from './helpers.js';
import { seedLegacyLibrary, png } from './fixtures/legacy-library.js';

let srv;
before(async () => {
  const dir = await tempDir();
  await seedLegacyLibrary(dir);
  srv = await startServer({ dataDir: dir });
});
after(async () => { await srv?.stop(); });

const newPlan = async (name) => (await srv.api('/api/plans', { method: 'POST', json: { name } })).data.plan;
const served = async (planId, rel) => (await fetch(`${srv.base}/data/plan/${planId}/${rel}`)).status;

test('templates are listed and each adds up to its target length', async () => {
  const { data } = await srv.api('/api/storyboard-templates');
  assert.deepEqual(data.templates.map((t) => t.key), ['launch', 'social', 'sting']);
  const plan = await newPlan('Template sums');
  for (const t of data.templates) {
    const r = await srv.api(`/api/plans/${plan.id}/storyboards`, { method: 'POST', json: { template: t.key } });
    assert.equal(r.status, 201);
    const b = r.data.block;
    assert.equal(b.type, 'storyboard');
    assert.equal(b.aspect, t.aspect);
    assert.equal(b.target, t.target);
    assert.equal(b.shots.length, t.shots);
    assert.equal(Math.round(b.shots.reduce((n, s) => n + s.duration, 0) * 10) / 10, t.target, t.key);
    assert.ok(b.shots.every((s) => s.id && s.visual && s.image === null && s.status === ''));
  }
  const launch = (await srv.api(`/api/plans/${plan.id}`)).data.plan.blocks.find((b) => b.title === 'Launch video');
  assert.deepEqual([...new Set(launch.shots.map((s) => s.section))], ['hook', 'problem', 'reveal', 'features', 'proof', 'cta', 'outro']);
  assert.equal((await srv.api(`/api/plans/${plan.id}/storyboards`, { method: 'POST', json: { template: 'nope' } })).status, 400);
  assert.equal((await srv.api('/api/plans/nope/storyboards', { method: 'POST', json: {} })).status, 404);
});

test('shot fields: camera, transition, texts kept; section and status only known values', async () => {
  const plan = await newPlan('Fields');
  const { block } = (await srv.api(`/api/plans/${plan.id}/storyboards`, { method: 'POST', json: { title: 'Main', aspect: '4:5' } })).data;
  assert.deepEqual([block.title, block.aspect, block.shots, block.target], ['Main', '4:5', [], null]);
  const r = await srv.api(`/api/plans/${plan.id}/blocks/${block.id}`, {
    method: 'PATCH',
    json: { shots: [
      { id: 'a', duration: 3, visual: 'Phone rises', vo: 'Meet Nova.', onscreen: 'NOVA', sfx: 'Whoosh', size: 'Close-up', camera: 'Orbit', transition: 'Match cut', section: 'reveal', status: 'approved' },
      { id: 'b', section: 'finale', status: 'done', size: 'x'.repeat(100) },
    ] },
  });
  const [a, b] = r.data.plan.blocks.find((x) => x.id === block.id).shots;
  assert.deepEqual([a.onscreen, a.sfx, a.size, a.camera, a.transition, a.section, a.status], ['NOVA', 'Whoosh', 'Close-up', 'Orbit', 'Match cut', 'reveal', 'approved']);
  assert.deepEqual([b.section, b.status, b.size.length, b.duration], ['', '', 40, 2]);
  const found = await srv.api('/api/search?q=match%20cut');
  assert.ok(found.data.results.some((x) => x.id === plan.id), 'transitions are searchable');
});

test('copy as another format: frames and track are copied into the new storyboard', async () => {
  const plan = await newPlan('Copy');
  const { block: src } = (await srv.api(`/api/plans/${plan.id}/storyboards`, { method: 'POST', json: { template: 'sting' } })).data;
  await srv.api(`/api/plans/${plan.id}/blocks`, { method: 'POST', json: { type: 'text' } }); // something after it
  const fd = new FormData();
  fd.append('files', new Blob([png(16, 9, [200, 40, 40])], { type: 'image/png' }), 'f.png');
  fd.append('files', new Blob([Buffer.from('ID3-audio')], { type: 'audio/mpeg' }), 'music.mp3');
  const [img, mp3] = (await srv.api(`/api/plans/${plan.id}/blocks/${src.id}/uploads`, { method: 'POST', body: fd })).data.files;
  await srv.api(`/api/plans/${plan.id}/blocks/${src.id}`, {
    method: 'PATCH', json: { audio: { file: mp3.file, name: 'music.mp3', size: mp3.size }, shots: src.shots.map((s, i) => (i === 1 ? { ...s, image: img.file, status: 'styleframe' } : s)) },
  });

  const r = await srv.api(`/api/plans/${plan.id}/storyboards`, { method: 'POST', json: { from: src.id, aspect: '9:16' } });
  assert.equal(r.status, 201);
  const copy = r.data.block;
  assert.equal(copy.title, 'Logo sting (9:16)');
  assert.equal(copy.aspect, '9:16');
  assert.equal(copy.target, 5);
  assert.equal(copy.shots.length, 3);
  assert.ok(copy.shots.every((s, i) => s.id !== src.shots[i].id));
  assert.ok(copy.shots[1].image.startsWith(`blocks/${copy.id}/`));
  assert.equal(copy.shots[1].status, 'styleframe');
  assert.ok(copy.audio.file.startsWith(`blocks/${copy.id}/`));
  assert.equal(await served(plan.id, copy.shots[1].image), 200);
  assert.equal(await served(plan.id, copy.audio.file), 200);
  assert.equal(await served(plan.id, img.file), 200); // the original keeps its own
  const order = r.data.plan.blocks.map((b) => b.id);
  assert.equal(order.indexOf(copy.id), order.indexOf(src.id) + 1, 'placed right after the original');

  const text = r.data.plan.blocks.find((b) => b.type === 'text');
  assert.equal((await srv.api(`/api/plans/${plan.id}/storyboards`, { method: 'POST', json: { from: text.id } })).status, 404);
});

test('frames from the plan and from Motion references are copied in by id', async () => {
  const plan = await newPlan('Import');
  const { block } = (await srv.api(`/api/plans/${plan.id}/storyboards`, { method: 'POST', json: {} })).data;
  const mood = (await srv.api(`/api/plans/${plan.id}/blocks`, { method: 'POST', json: { type: 'moodboard' } })).data.block;
  const fd = new FormData();
  fd.append('files', new Blob([png(12, 12, [10, 200, 90])], { type: 'image/png' }), 'mood.png');
  const img = (await srv.api(`/api/plans/${plan.id}/blocks/${mood.id}/files`, { method: 'POST', body: fd })).data.plan.blocks.find((b) => b.id === mood.id).images[0];

  // A moment with a captured frame on the Showreel.
  const th = new FormData();
  th.append('thumb', new Blob([png(16, 9, [0, 0, 255])], { type: 'image/png' }), 'm.png');
  const thumb = (await srv.api('/api/projects/mot1/marker-thumb', { method: 'POST', body: th })).data.file;
  await srv.api('/api/projects/mot1', { method: 'PATCH', json: { markers: [{ id: 'mk1', t: 65, label: 'Whip pan', thumb }] } });

  const r = await srv.api(`/api/plans/${plan.id}/blocks/${block.id}/import`, {
    method: 'POST',
    json: { items: [
      { kind: 'plan', blockId: mood.id, itemId: img.id },
      { kind: 'frame', projectId: 'mot1', itemId: 'f1' },
      { kind: 'moment', projectId: 'mot1', itemId: 'mk1' },
      { kind: 'frame', projectId: 'brand1', itemId: 'a2' }, // not a motion project
      { kind: 'plan', blockId: mood.id, itemId: 'missing' },
      { kind: 'file', path: '../../db.json' },
    ] },
  });
  assert.equal(r.status, 201);
  const files = r.data.files;
  assert.deepEqual(files.map((f) => f.key), [`plan:${img.id}`, 'frame:f1', 'moment:mk1']);
  assert.deepEqual(files.map((f) => f.label), ['', 'Showreel · 0:01', 'Showreel · 1:05 · Whip pan']);
  for (const f of files) {
    assert.ok(f.file.startsWith(`blocks/${block.id}/`));
    assert.equal(await served(plan.id, f.file), 200);
  }
  // Nothing is added to the shots until the page saves them — then they're valid frames.
  const saved = await srv.api(`/api/plans/${plan.id}/blocks/${block.id}`, { method: 'PATCH', json: { shots: files.map((f, i) => ({ id: `s${i}`, image: f.file, notes: f.label })) } });
  assert.deepEqual(saved.data.plan.blocks.find((b) => b.id === block.id).shots.map((s) => s.image), files.map((f) => f.file));

  assert.equal((await srv.api(`/api/plans/${plan.id}/blocks/${mood.id}/import`, { method: 'POST', json: { items: [] } })).status, 404);
});
