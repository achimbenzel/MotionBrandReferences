// Plan templates, status + client, the briefing block and motion sections.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { startServer, tempDir, readJSON } from './helpers.js';
import { seedLegacyLibrary, png } from './fixtures/legacy-library.js';

let srv;
before(async () => {
  const dir = await tempDir();
  await seedLegacyLibrary(dir);
  // Sections written before section types existed: free-text labels only.
  const dbPath = path.join(dir, 'db.json');
  const db = await readJSON(dbPath);
  db.projects.find((p) => p.id === 'mot1').segments = [
    { id: 's1', start: 0, label: 'Hook' },
    { id: 's2', start: 4, label: 'Feature 2' },
    { id: 's3', start: 9, label: 'Mein Teil' },
    { id: 's4', start: 30, label: 'social proof' },
  ];
  await fsp.writeFile(dbPath, JSON.stringify(db, null, 2));
  srv = await startServer({ dataDir: dir });
});
after(async () => { await srv?.stop(); });

const newPlan = async (body) => {
  const { status, data } = await srv.api('/api/plans', { method: 'POST', json: body });
  assert.equal(status, 201, JSON.stringify(data));
  return data.plan;
};

test('older sections keep their text and gain a type when the label names one', async () => {
  const { data } = await srv.api('/api/projects/mot1');
  assert.deepEqual(data.project.segments.map(({ id, kind, label }) => ({ id, kind, label })), [
    { id: 's1', kind: 'hook', label: '' },           // exact name → the type
    { id: 's2', kind: 'features', label: 'Feature 2' }, // typed, text kept
    { id: 's3', kind: '', label: 'Mein Teil' },     // custom text stays as is
    { id: 's4', kind: 'proof', label: '' },
  ]);
  // The video and everything else about the project are untouched.
  assert.equal(data.project.video, 'video.mp4');
  assert.equal(data.project.frames.length, 1);
});

test('sections save with a type; unknown types fall back to none', async () => {
  const segments = [
    { id: 'a', start: 3, kind: 'hook', label: '' }, // the first is pinned to 0
    { id: 'b', start: 5.5, kind: 'reveal', label: 'Phone flies in' },
    { id: 'c', start: 12, kind: 'bogus', label: 'Hook' }, // explicit kind → no guessing
  ];
  const { status, data } = await srv.api('/api/projects/mot1', { method: 'PATCH', json: { segments } });
  assert.equal(status, 200);
  assert.deepEqual(data.project.segments, [
    { id: 'a', start: 0, kind: 'hook', label: '' },
    { id: 'b', start: 5.5, kind: 'reveal', label: 'Phone flies in' },
    { id: 'c', start: 12, kind: '', label: 'Hook' },
  ]);
  const found = await srv.api('/api/search?q=product%20reveal');
  assert.ok(found.data.results.some((r) => r.id === 'mot1'), 'search finds sections by type');
});

test('built-in templates are listed and a launch-video plan starts filled in', async () => {
  const { data } = await srv.api('/api/plan-templates');
  const ids = data.templates.map((t) => t.id);
  assert.ok(ids.includes('launch') && ids.includes('branding'));
  assert.ok(data.templates.find((t) => t.id === 'launch').outline.includes('Briefing'));

  const plan = await newPlan({ name: 'Acme launch', client: 'Acme', template: 'launch' });
  assert.equal(plan.status, 'briefing');
  assert.equal(plan.client, 'Acme');
  assert.equal(plan.avatarEmoji, '🚀');
  assert.ok(plan.milestones.length > 0 && plan.milestones.every((m) => m.id && m.date === '' && !m.done));
  const brief = plan.blocks.find((b) => b.type === 'briefing');
  assert.ok(brief.fields.some((f) => f.label === 'Target length'));
  assert.ok(brief.fields.every((f) => f.id && f.value === ''));
  // Table rows are keyed by the (fresh) column ids.
  const table = plan.blocks.find((b) => b.type === 'table');
  const colIds = table.columns.map((c) => c.id);
  assert.ok(!colIds.includes('c0'));
  assert.equal(table.rows[0].cells[colIds[0]], '16:9 master');
  // Every block has its own id, also across two plans from the same template.
  const again = await newPlan({ template: 'launch' });
  const allIds = [...plan.blocks, ...again.blocks].map((b) => b.id);
  assert.equal(new Set(allIds).size, allIds.length);
  assert.equal(again.name, 'Untitled plan');
});

test('an unknown template is refused; a plan without one starts empty with no status', async () => {
  const bad = await srv.api('/api/plans', { method: 'POST', json: { template: 'nope' } });
  assert.equal(bad.status, 400);
  const plan = await newPlan({ name: 'Blank' });
  assert.equal(plan.status, '');
  assert.equal(plan.client, '');
  assert.deepEqual(plan.blocks, []);
});

test('plans made before statuses existed read as "no status"', async () => {
  const { data } = await srv.api('/api/plans');
  for (const id of ['plan1', 'plan2', 'plan3']) {
    const legacy = data.plans.find((p) => p.id === id);
    assert.equal(legacy.status, '', id);
    assert.equal(legacy.client, '', id);
  }
});

test('status only takes known values; client is stored', async () => {
  const plan = await newPlan({ name: 'Status test' });
  let r = await srv.api(`/api/plans/${plan.id}`, { method: 'PATCH', json: { status: 'review', client: 'Globex' } });
  assert.equal(r.data.plan.status, 'review');
  assert.equal(r.data.plan.client, 'Globex');
  r = await srv.api(`/api/plans/${plan.id}`, { method: 'PATCH', json: { status: 'bogus' } });
  assert.equal(r.data.plan.status, 'review');
  r = await srv.api(`/api/plans/${plan.id}`, { method: 'PATCH', json: { status: '' } });
  assert.equal(r.data.plan.status, '');
});

test('briefing block: default questions, answers saved and searchable', async () => {
  const plan = await newPlan({ name: 'Brief test', client: 'Initech' });
  const add = await srv.api(`/api/plans/${plan.id}/blocks`, { method: 'POST', json: { type: 'briefing' } });
  assert.equal(add.status, 201);
  const block = add.data.block;
  assert.ok(block.fields.length >= 5 && block.fields.every((f) => f.id && f.label));
  const fields = block.fields.map((f, i) => (i === 0 ? { ...f, value: 'Quantum toaster' } : f));
  fields.push({ label: 'Extra', value: 42, junk: true }); // sanitised: id added, value a string
  const r = await srv.api(`/api/plans/${plan.id}/blocks/${block.id}`, { method: 'PATCH', json: { fields } });
  const saved = r.data.plan.blocks.find((b) => b.id === block.id).fields;
  assert.equal(saved[0].value, 'Quantum toaster');
  assert.deepEqual(Object.keys(saved.at(-1)).sort(), ['id', 'label', 'value']);
  assert.equal(saved.at(-1).value, '42');
  const byAnswer = await srv.api('/api/search?q=quantum%20toaster');
  assert.ok(byAnswer.data.results.some((x) => x.id === plan.id));
  const byClient = await srv.api('/api/search?q=initech');
  assert.ok(byClient.data.results.some((x) => x.id === plan.id && x.subtitle.includes('Initech')));
});

test('save as template: structure and text, without files, ticks or answers; same name updates', async () => {
  const plan = await newPlan({ name: 'Source', template: 'branding' });
  const mood = plan.blocks.find((b) => b.type === 'moodboard');
  const todo = plan.blocks.find((b) => b.type === 'todos');
  const brief = plan.blocks.find((b) => b.type === 'briefing');
  const fd = new FormData();
  fd.append('files', new Blob([png(8, 8, [255, 0, 0])], { type: 'image/png' }), 'mood.png');
  await srv.api(`/api/plans/${plan.id}/blocks/${mood.id}/files`, { method: 'POST', body: fd });
  await srv.api(`/api/plans/${plan.id}/blocks/${todo.id}`, { method: 'PATCH', json: { items: todo.items.map((t) => ({ ...t, done: true, urgent: true })) } });
  await srv.api(`/api/plans/${plan.id}/blocks/${brief.id}`, { method: 'PATCH', json: { fields: brief.fields.map((f) => ({ ...f, value: 'secret answer' })) } });
  await srv.api(`/api/plans/${plan.id}`, { method: 'PATCH', json: { status: 'production', milestones: [{ id: 'm1', title: 'Kick-off', date: '2026-01-02', done: true }] } });

  const saved = await srv.api('/api/plan-templates', { method: 'POST', json: { planId: plan.id, name: 'My branding' } });
  assert.equal(saved.status, 201);
  assert.equal(saved.data.replaced, false);
  const tid = saved.data.template.id;

  const copy = await newPlan({ name: 'From mine', template: tid });
  assert.equal(copy.status, 'briefing');
  assert.deepEqual(copy.milestones.map((m) => [m.title, m.date, m.done]), [['Kick-off', '', false]]);
  assert.equal(copy.blocks.length, plan.blocks.length);
  assert.deepEqual(copy.blocks.find((b) => b.type === 'moodboard').images, []);
  assert.ok(copy.blocks.find((b) => b.type === 'todos').items.every((t) => !t.done && !t.urgent && t.text));
  assert.ok(copy.blocks.find((b) => b.type === 'briefing').fields.every((f) => f.value === '' && f.label));

  // Saving under the same name (any case) replaces that template.
  const again = await srv.api('/api/plan-templates', { method: 'POST', json: { planId: plan.id, name: 'MY BRANDING' } });
  assert.equal(again.status, 200);
  assert.equal(again.data.replaced, true);
  assert.equal(again.data.template.id, tid);
  const list = (await srv.api('/api/plan-templates')).data.templates;
  assert.equal(list.filter((t) => !t.builtin).length, 1);

  // Custom templates can be deleted, built-in ones can't.
  assert.equal((await srv.api('/api/plan-templates/launch', { method: 'DELETE' })).status, 400);
  assert.equal((await srv.api(`/api/plan-templates/${tid}`, { method: 'DELETE' })).status, 200);
  assert.equal((await srv.api(`/api/plan-templates/${tid}`, { method: 'DELETE' })).status, 404);
  const gone = await srv.api('/api/plans', { method: 'POST', json: { template: tid } });
  assert.equal(gone.status, 400);
});
