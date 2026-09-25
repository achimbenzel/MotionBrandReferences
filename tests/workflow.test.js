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

test('storyboard: uploads store files only; shots, track and format are sanitised', async () => {
  const plan = await newPlan({ name: 'Board test' });
  const add = await srv.api(`/api/plans/${plan.id}/blocks`, { method: 'POST', json: { type: 'storyboard' } });
  const sb = add.data.block;
  assert.deepEqual([sb.aspect, sb.shots, sb.audio, sb.target], ['16:9', [], null, null]);

  const fd = new FormData();
  fd.append('files', new Blob([png(16, 9, [0, 120, 255])], { type: 'image/png' }), 'frame1.png');
  fd.append('files', new Blob([Buffer.from('ID3fake-audio')], { type: 'audio/mpeg' }), 'music.mp3');
  const up = await srv.api(`/api/plans/${plan.id}/blocks/${sb.id}/uploads`, { method: 'POST', body: fd });
  assert.equal(up.status, 201);
  const [img, mp3] = up.data.files;
  assert.ok(img.file.startsWith(`blocks/${sb.id}/`) && img.file.endsWith('.png'));
  assert.equal(mp3.name, 'music.mp3');
  // Nothing is referenced until the page saves it.
  const before = (await srv.api(`/api/plans/${plan.id}`)).data.plan.blocks.find((b) => b.id === sb.id);
  assert.deepEqual(before.shots, []);
  const served = await fetch(`${srv.base}/data/plan/${plan.id}/${img.file}`);
  assert.equal(served.status, 200);

  const r = await srv.api(`/api/plans/${plan.id}/blocks/${sb.id}`, {
    method: 'PATCH',
    json: {
      aspect: '9:16', target: '30', audio: { file: mp3.file, name: mp3.name, size: mp3.size },
      shots: [
        { id: 'a', image: img.file, duration: 2.5, visual: 'Logo', vo: 'Hi' },
        { id: 'b', image: '../../../db.json', duration: 'x', visual: 'Bad path' },
        { id: 'c', image: 'blocks/other/x.png', duration: 9999 },
      ],
    },
  });
  const saved = r.data.plan.blocks.find((b) => b.id === sb.id);
  assert.equal(saved.aspect, '9:16');
  assert.equal(saved.target, 30);
  assert.equal(saved.audio.file, mp3.file);
  assert.deepEqual(saved.shots.map((x) => [x.id, x.image, x.duration]), [['a', img.file, 2.5], ['b', null, 2], ['c', null, 600]]);
  const bad = await srv.api(`/api/plans/${plan.id}/blocks/${sb.id}`, { method: 'PATCH', json: { aspect: '2:1', target: '' } });
  const after = bad.data.plan.blocks.find((b) => b.id === sb.id);
  assert.equal(after.aspect, '9:16');
  assert.equal(after.target, null);

  // Uploads are only for storyboards.
  const other = await srv.api(`/api/plans/${plan.id}/blocks`, { method: 'POST', json: { type: 'text' } });
  const nope = await srv.api(`/api/plans/${plan.id}/blocks/${other.data.block.id}/uploads`, { method: 'POST', body: new FormData() });
  assert.equal(nope.status, 404);

  // Deleting the block takes its frames and track to Trash; restoring brings them back.
  const del = await srv.api(`/api/plans/${plan.id}/blocks/${sb.id}`, { method: 'DELETE' });
  assert.equal((await fetch(`${srv.base}/data/plan/${plan.id}/${img.file}`)).status, 404);
  await srv.api(`/api/trash/${del.data.trashId}/restore`, { method: 'POST' });
  assert.equal((await fetch(`${srv.base}/data/plan/${plan.id}/${mp3.file}`)).status, 200);
});

test('script block: lines and pace saved, searchable; blocks can be inserted after another', async () => {
  const plan = await newPlan({ name: 'Script test', template: 'launch' });
  const script = plan.blocks.find((b) => b.type === 'script');
  assert.ok(script, 'launch template has a script block');
  assert.deepEqual(script.lines.map((l) => l.visual).slice(0, 2), ['Hook', 'Problem']);
  assert.ok(plan.blocks.some((b) => b.type === 'storyboard'), 'launch template has a storyboard');

  const lines = [{ id: 'l1', visual: 'Phone on desk', vo: 'Meet Zephyr, your pocket gardener.', junk: 1 }, { visual: 'Logo' }];
  const r = await srv.api(`/api/plans/${plan.id}/blocks/${script.id}`, { method: 'PATCH', json: { lines, pace: 99, target: 45 } });
  const saved = r.data.plan.blocks.find((b) => b.id === script.id);
  assert.deepEqual(Object.keys(saved.lines[0]).sort(), ['id', 'visual', 'vo']);
  assert.ok(saved.lines[1].id);
  assert.equal(saved.pace, 6);
  assert.equal(saved.target, 45);
  const found = await srv.api('/api/search?q=pocket%20gardener');
  assert.ok(found.data.results.some((x) => x.id === plan.id));

  const ins = await srv.api(`/api/plans/${plan.id}/blocks`, { method: 'POST', json: { type: 'storyboard', after: script.id } });
  const order = ins.data.plan.blocks.map((b) => b.id);
  assert.equal(order[order.indexOf(script.id) + 1], ins.data.block.id);
});

test('templates keep storyboard text but drop frames and tracks', async () => {
  const plan = await newPlan({ name: 'SB source' });
  const sb = (await srv.api(`/api/plans/${plan.id}/blocks`, { method: 'POST', json: { type: 'storyboard' } })).data.block;
  const fd = new FormData();
  fd.append('files', new Blob([png(8, 8, [9, 9, 9])], { type: 'image/png' }), 'f.png');
  const [img] = (await srv.api(`/api/plans/${plan.id}/blocks/${sb.id}/uploads`, { method: 'POST', body: fd })).data.files;
  await srv.api(`/api/plans/${plan.id}/blocks/${sb.id}`, { method: 'PATCH', json: {
    shots: [{ id: 's1', image: img.file, duration: 3, visual: 'Opening shot', vo: '' }], audio: { file: img.file, name: 'x' },
  } });
  const t = await srv.api('/api/plan-templates', { method: 'POST', json: { planId: plan.id, name: 'SB tpl' } });
  const copy = await newPlan({ template: t.data.template.id });
  const csb = copy.blocks.find((b) => b.type === 'storyboard');
  assert.equal(csb.shots.length, 1);
  assert.equal(csb.shots[0].visual, 'Opening shot');
  assert.equal(csb.shots[0].duration, 3);
  assert.equal(csb.shots[0].image, null);
  assert.notEqual(csb.shots[0].id, 's1');
  assert.equal(csb.audio, null);
  await srv.api(`/api/plan-templates/${t.data.template.id}`, { method: 'DELETE' });
});
