// Core API behaviour against a library that mixes every historical data shape.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { startServer, tempDir, readJSON, exists } from './helpers.js';
import { seedLegacyLibrary, legacyDB, png } from './fixtures/legacy-library.js';

let srv;
before(async () => {
  const dir = await tempDir();
  await seedLegacyLibrary(dir);
  srv = await startServer({ dataDir: dir });
});
after(async () => { await srv?.stop(); });

test('every legacy project is listed, per type and overall', async () => {
  const { status, data } = await srv.api('/api/projects');
  assert.equal(status, 200);
  assert.equal(data.projects.length, legacyDB().projects.length);
  const logos = (await srv.api('/api/projects?type=logo')).data.projects;
  assert.deepEqual(logos.map((p) => p.id).sort(), ['logo1', 'logo2', 'logo3', 'logo4']);
  const brand = (await srv.api('/api/projects/brand1')).data.project;
  assert.equal(brand.assets.length, 2);
  assert.equal(brand.notes, 'Brand notes');
});

test('legacy files are served from /data', async () => {
  for (const url of ['/data/branding/brand1/a2.png', '/data/logo/logo2/dark.svg', '/data/plan/plan3/blocks/b3/mi.png']) {
    const res = await fetch(`${srv.base}${url}`);
    assert.equal(res.status, 200, url);
  }
});

test('galleries, plans, software and board load', async () => {
  const g = (await srv.api('/api/galleries?type=branding')).data.galleries;
  assert.deepEqual(g.map((x) => x.id), ['gal1']);

  const plans = (await srv.api('/api/plans')).data.plans;
  assert.equal(plans.length, 3);
  const plan2 = plans.find((p) => p.id === 'plan2');
  assert.deepEqual(plan2.blocks.map((b) => b.type), ['moodboard', 'text', 'todos']);
  assert.equal(plan2.blocks[0].images[0].file, 'moodboard/mb2/i2.png');
  assert.equal(plan2.blocks[1].content, 'Second info');
  assert.equal(plan2.milestones[0].title, 'Kickoff');

  const sw = (await srv.api('/api/software/sw1')).data.software;
  assert.equal(sw.avatarEmoji, '🎬');
  assert.deepEqual(sw.plugins.map((p) => p.name), ['Element 3D', 'My script']);
  assert.equal(sw.plugins[1].file, 's1_my.jsx');
  assert.equal(sw.expressionGroups.length, 1);
  assert.equal(sw.expressionGroups[0].items[0].code, 'wiggle(2, 20)');

  const board = (await srv.api('/api/board')).data.board;
  assert.equal(board.columns.length, 3);
});

test('search spans projects, plans and software', async () => {
  const r = (await srv.api('/api/search?q=acme')).data.results;
  assert.ok(r.some((x) => x.id === 'brand1'));
  const s = (await srv.api('/api/search?q=wiggle')).data.results;
  assert.ok(s.some((x) => x.id === 'sw1'));
});

test('create, edit, delete to trash and restore a project', async () => {
  const fd = new FormData();
  fd.append('type', 'imagegallery');
  fd.append('title', 'Pasted');
  fd.append('image', new Blob([png(40, 40, [9, 9, 9])], { type: 'image/png' }), 'x.png');
  const created = await srv.api('/api/projects', { method: 'POST', body: fd });
  assert.equal(created.status, 201);
  const { id } = created.data.project;
  assert.ok(exists(path.join(srv.dataDir, 'imagegallery', id, 'image.png')));

  const patched = await srv.api(`/api/projects/${id}`, { method: 'PATCH', json: { notes: 'hello', tags: ['a'] } });
  assert.equal(patched.data.project.notes, 'hello');

  const del = await srv.api(`/api/projects/${id}`, { method: 'DELETE' });
  assert.equal(del.status, 200);
  assert.ok(!exists(path.join(srv.dataDir, 'imagegallery', id)));
  assert.ok(exists(path.join(srv.dataDir, 'trash', del.data.trashId, 'image.png')));

  const trash = (await srv.api('/api/trash')).data.items;
  assert.ok(trash.some((t) => t.trashId === del.data.trashId));

  const restored = await srv.api(`/api/trash/${del.data.trashId}/restore`, { method: 'POST' });
  assert.equal(restored.status, 200);
  assert.ok(exists(path.join(srv.dataDir, 'imagegallery', id, 'image.png')));
  assert.equal((await srv.api(`/api/projects/${id}`)).data.project.notes, 'hello');
});

test('plan blocks: add, edit, move and remove', async () => {
  let plan = (await srv.api('/api/plans/plan3')).data.plan;
  const added = await srv.api('/api/plans/plan3/blocks', { method: 'POST', json: { type: 'table' } });
  assert.equal(added.status, 201);
  const bid = added.data.block.id;
  const edited = await srv.api(`/api/plans/plan3/blocks/${bid}`, { method: 'PATCH', json: { rows: [{ id: 'r', cells: { x: '1' } }] } });
  assert.equal(edited.status, 200);
  const moved = await srv.api(`/api/plans/plan3/blocks/${bid}/move`, { method: 'POST', json: { dir: 'up' } });
  plan = moved.data.plan;
  assert.equal(plan.blocks[plan.blocks.length - 2].id, bid);
  const removed = await srv.api(`/api/plans/plan3/blocks/${bid}`, { method: 'DELETE' });
  assert.ok(!removed.data.plan.blocks.some((b) => b.id === bid));
});

test('deleting a file from a files block moves it to trash and restore brings it back', async () => {
  const res = await srv.api('/api/plans/plan3/blocks/b2/files/fa', { method: 'DELETE' });
  assert.equal(res.status, 200);
  assert.ok(!exists(path.join(srv.dataDir, 'plan/plan3/blocks/b2/fa.pdf')));
  await srv.api(`/api/trash/${res.data.trashId}/restore`, { method: 'POST' });
  assert.ok(exists(path.join(srv.dataDir, 'plan/plan3/blocks/b2/fa.pdf')));
  const plan = (await srv.api('/api/plans/plan3')).data.plan;
  assert.equal(plan.blocks.find((b) => b.id === 'b2').files[0].id, 'fa');
});

test('board saves round-trip', async () => {
  const board = (await srv.api('/api/board')).data.board;
  board.columns[0].cards.push({ id: 'k1', title: 'Card', tags: [{ id: 't', label: 'x', color: 'red' }] });
  const put = await srv.api('/api/board', { method: 'PUT', json: { columns: board.columns } });
  assert.equal(put.status, 200);
  const again = (await srv.api('/api/board')).data.board;
  assert.equal(again.columns[0].cards[0].title, 'Card');
});

test('export → import round-trip restores the library', async () => {
  const zipRes = await fetch(`${srv.base}/api/export`);
  assert.equal(zipRes.status, 200);
  const zip = Buffer.from(await zipRes.arrayBuffer());

  // Import into a fresh, empty server.
  const other = await startServer();
  try {
    const fd = new FormData();
    fd.append('archive', new Blob([zip], { type: 'application/zip' }), 'lib.zip');
    const imp = await other.api('/api/import', { method: 'POST', body: fd });
    assert.equal(imp.status, 200, JSON.stringify(imp.data));
    const projects = (await other.api('/api/projects')).data.projects;
    assert.ok(projects.length >= legacyDB().projects.length);
    const a = await fsp.readFile(path.join(srv.dataDir, 'logo/logo2/dark.svg'));
    const b = await fsp.readFile(path.join(other.dataDir, 'logo/logo2/dark.svg'));
    assert.ok(a.equals(b));
    const db = await readJSON(path.join(other.dataDir, 'db.json'));
    assert.ok(db.software.some((s) => s.id === 'sw1'));
  } finally { await other.stop(); }
});
