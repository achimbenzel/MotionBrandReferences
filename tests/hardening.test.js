// Security guards, error handling and legacy-shape fixes.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { startServer, tempDir, readJSON, exists } from './helpers.js';
import { seedLegacyLibrary } from './fixtures/legacy-library.js';

let srv;
before(async () => {
  const dir = await tempDir();
  await seedLegacyLibrary(dir);
  srv = await startServer({ dataDir: dir });
});
after(async () => { await srv?.stop(); });

// Raw request with a chosen Host header (fetch won't let us set it).
function rawGet(base, p, host) {
  const u = new URL(base);
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: u.hostname, port: u.port, path: p, headers: { Host: host } }, (res) => {
      res.resume(); res.on('end', () => resolve(res.statusCode));
    });
    req.on('error', reject); req.end();
  });
}

test('db.json, its backups and tmp are never served', async () => {
  for (const p of ['/data/db.json', '/data/db.json.bak', '/data/backups/', '/data/tmp/x',
    '/data/%64b.json', '/data/plan/../db.json', '/data/plan/%2e%2e/db.json', '/data/DB.JSON']) {
    const res = await fetch(`${srv.base}${p}`);
    assert.ok(res.status === 404 || res.status === 400, `${p} → ${res.status}`);
  }
});

test('library files carry nosniff, and SVGs are sandboxed', async () => {
  const res = await fetch(`${srv.base}/data/logo/logo3/logo.svg`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(res.headers.get('content-security-policy'), 'sandbox');
});

test('no CORS: other origins get no Access-Control-Allow-Origin', async () => {
  const res = await fetch(`${srv.base}/api/software`, { headers: { Origin: 'https://evil.example' } });
  assert.equal(res.headers.get('access-control-allow-origin'), null);
});

test('state-changing API calls need the CSRF header', async () => {
  const bare = await fetch(`${srv.base}/api/galleries`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'logo', name: 'x' }),
  });
  assert.equal(bare.status, 403);
  const form = new FormData(); form.append('type', 'logo');
  const formPost = await fetch(`${srv.base}/api/projects`, { method: 'POST', body: form });
  assert.equal(formPost.status, 403);
  const ok = await srv.api('/api/galleries', { method: 'POST', json: { type: 'logo', name: 'x' } });
  assert.equal(ok.status, 201);
});

test('host allowlist blocks DNS-rebinding hosts but allows local / tailnet names', async () => {
  assert.equal(await rawGet(srv.base, '/api/plans', 'evil.example.com'), 403);
  assert.equal(await rawGet(srv.base, '/api/plans', 'evil.example.com:4300'), 403);
  for (const h of ['localhost:4300', '127.0.0.1', '[::1]:4300', '100.101.102.103', 'vps', 'vps.tail1234.ts.net', 'macbook.local', 'nas.fritz.box']) {
    assert.equal(await rawGet(srv.base, '/api/plans', h), 200, h);
  }
});

test('unknown API routes answer JSON 404', async () => {
  const r = await srv.api('/api/nope');
  assert.equal(r.status, 404);
  assert.equal(r.data.error, 'not_found');
});

test('first-version plans keep their moodboard images', async () => {
  const plan = (await srv.api('/api/plans/plan1')).data.plan;
  const mb = plan.blocks.find((b) => b.type === 'moodboard');
  assert.ok(mb, 'moodboard block exists');
  assert.equal(mb.images[0].file, 'moodboard/m1.png');
  assert.equal(plan.blocks.find((b) => b.type === 'text').content, 'Plan info text');
});

test('legacy blocks keep stable ids, so they can be edited before any other save', async () => {
  const dir = await tempDir();
  await seedLegacyLibrary(dir);
  const s = await startServer({ dataDir: dir });
  try {
    const a = (await s.api('/api/plans/plan2')).data.plan;
    const b = (await s.api('/api/plans/plan2')).data.plan;
    assert.deepEqual(a.blocks.map((x) => x.id), b.blocks.map((x) => x.id));
    const text = a.blocks.find((x) => x.type === 'text');
    const r = await s.api(`/api/plans/plan2/blocks/${text.id}`, { method: 'PATCH', json: { content: 'edited' } });
    assert.equal(r.status, 200);
    const sw1 = (await s.api('/api/software/sw1')).data.software;
    const sw2 = (await s.api('/api/software/sw1')).data.software;
    assert.equal(sw1.expressionGroups[0].id, sw2.expressionGroups[0].id);
  } finally { await s.stop(); }
});

test('deleting a block moves it (and its files) to trash; restore puts it back in place', async () => {
  const del = await srv.api('/api/plans/plan3/blocks/b3', { method: 'DELETE' });
  assert.equal(del.status, 200);
  assert.ok(!del.data.plan.blocks.some((b) => b.id === 'b3'));
  assert.ok(!exists(path.join(srv.dataDir, 'plan/plan3/blocks/b3/mi.png')));
  const trash = (await srv.api('/api/trash')).data.items;
  const item = trash.find((t) => t.trashId === del.data.trashId);
  assert.equal(item.kind, 'block');
  assert.match(item.thumb, /mi\.png$/);
  const res = await srv.api(`/api/trash/${del.data.trashId}/restore`, { method: 'POST' });
  assert.equal(res.status, 200);
  const plan = (await srv.api('/api/plans/plan3')).data.plan;
  assert.equal(plan.blocks[2].id, 'b3');
  assert.ok(exists(path.join(srv.dataDir, 'plan/plan3/blocks/b3/mi.png')));
});

test('a failed write returns a JSON error and the server keeps running', async () => {
  const dir = await tempDir();
  await seedLegacyLibrary(dir);
  const s = await startServer({ dataDir: dir });
  try {
    // Make db.json impossible to replace: a directory in its place.
    await fsp.rename(path.join(dir, 'db.json'), path.join(dir, 'db.real.json'));
    await fsp.mkdir(path.join(dir, 'db.json'));
    const r = await s.api('/api/galleries', { method: 'POST', json: { type: 'logo', name: 'y' } });
    assert.ok(r.status >= 500, `status ${r.status}`);
    assert.equal(typeof r.data.error, 'string');
    assert.equal(s.child.exitCode, null, 'server still alive');
    // Put things back → writes work again (the queue wasn't poisoned).
    await fsp.rmdir(path.join(dir, 'db.json'));
    await fsp.rename(path.join(dir, 'db.real.json'), path.join(dir, 'db.json'));
    const ok = await s.api('/api/galleries', { method: 'POST', json: { type: 'logo', name: 'z' } });
    assert.equal(ok.status, 201);
  } finally { await s.stop(); }
});

test('unreadable database files → 503, and nothing gets overwritten with an empty library', async () => {
  const dir = await tempDir();
  await seedLegacyLibrary(dir);
  const s = await startServer({ dataDir: dir });
  try {
    for (const f of ['db.json', 'db.json.bak']) await fsp.writeFile(path.join(dir, f), '{ corrupt');
    await fsp.rm(path.join(dir, 'backups'), { recursive: true, force: true });
    const r = await s.api('/api/galleries', { method: 'POST', json: { type: 'logo', name: 'q' } });
    assert.equal(r.status, 503);
    assert.equal(r.data.error, 'db_unavailable');
    assert.equal(await fsp.readFile(path.join(dir, 'db.json'), 'utf8'), '{ corrupt');
  } finally { await s.stop(); }
});

test('a corrupt db.json self-heals from the .bak mirror', async () => {
  const dir = await tempDir();
  await seedLegacyLibrary(dir);
  const s = await startServer({ dataDir: dir });
  try {
    await s.api('/api/galleries', { method: 'POST', json: { type: 'logo', name: 'mirror me' } }); // writes .bak
    await fsp.writeFile(path.join(dir, 'db.json'), '{ corrupt');
    const g = (await s.api('/api/galleries?type=logo')).data.galleries;
    assert.ok(g.some((x) => x.name === 'mirror me'));
    assert.ok((await readJSON(path.join(dir, 'db.json'))).galleries.length > 0);
  } finally { await s.stop(); }
});

test('upload errors answer clearly and leave no tmp files behind', async () => {
  const dir = await tempDir();
  const s = await startServer({ dataDir: dir, env: { MAX_UPLOAD_MB: '1' } });
  const tmpEmpty = async () => {
    await new Promise((res) => setTimeout(res, 150));
    assert.deepEqual(await fsp.readdir(path.join(dir, 'tmp')), []);
  };
  try {
    const fd = new FormData();
    fd.append('type', 'motion');
    fd.append('thumb', new Blob([Buffer.alloc(1000)]), 't.webp'); // a file, but no video
    const r = await s.api('/api/projects', { method: 'POST', body: fd });
    assert.equal(r.status, 400);
    assert.equal(r.data.error, 'video_required');
    await tmpEmpty();

    const big = new FormData();
    big.append('type', 'imagegallery');
    big.append('image', new Blob([Buffer.alloc(2 * 1024 * 1024)]), 'big.png');
    const r2 = await s.api('/api/projects', { method: 'POST', body: big });
    assert.equal(r2.status, 413);
    assert.match(r2.data.message, /too large/);
    await tmpEmpty();
    assert.equal((await s.api('/api/projects')).data.projects.length, 0);
  } finally { await s.stop(); }
});
