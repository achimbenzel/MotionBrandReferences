// Stored pictures made smaller afterwards: found (the big ones a record uses),
// swapped for the smaller version under a new name (the record and /data/
// links follow), the originals in one Trash item that puts everything back.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { startServer, tempDir, exists } from './helpers.js';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBPVP8 '), Buffer.alloc(2000, 7)]);
let srv;
before(async () => { srv = await startServer({ dataDir: await tempDir() }); });
after(async () => { await srv?.stop(); });

test('stored pictures: the big ones listed, one made smaller (names follow), the originals back from the Trash', async () => {
  const fd = new FormData();
  fd.append('type', 'imagegallery'); fd.append('title', 'Big poster');
  fd.append('image', new Blob([PNG], { type: 'image/png' }), 'poster.png');
  const ref = (await srv.api('/api/projects', { method: 'POST', body: fd })).data.project;
  const orig = path.join(srv.dataDir, 'imagegallery', ref.id, ref.image);
  await fsp.writeFile(orig, Buffer.concat([PNG, Buffer.alloc(300 * 1024, 1)])); // a big picture
  // A small one isn't listed; a project's text links to the big one by its /data/ URL.
  const plan = (await srv.api('/api/plans', { method: 'POST', json: { name: 'Links' } })).data.plan;
  const url = `/data/imagegallery/${ref.id}/${ref.image}`;
  const block = (await srv.api(`/api/plans/${plan.id}/blocks`, { method: 'POST', json: { type: 'text' } })).data.block;
  await srv.api(`/api/plans/${plan.id}/blocks/${block.id}`, { method: 'PATCH', json: { content: `See ![poster](${url})` } });

  let r = await srv.api('/api/maintenance/pictures?min=100');
  const rel = `imagegallery/${ref.id}/${ref.image}`;
  assert.deepEqual(r.data.items.map((x) => [x.rel, x.area, x.owner]), [[rel, 'refs', 'Big poster']]);
  assert.ok(r.data.bytes > 300 * 1024);

  // Refused: not smaller, not a picture, outside the library, no batch.
  const send = (file, name, relPath = rel, batch = 'batch123') => {
    const f = new FormData(); f.append('rel', relPath); f.append('batch', batch); f.append('file', new Blob([file]), name);
    return srv.api('/api/maintenance/pictures/replace', { method: 'POST', body: f });
  };
  assert.equal((await send(Buffer.concat([WEBP, Buffer.alloc(400 * 1024)]), 'x.webp')).status, 400);
  assert.equal((await send(Buffer.from('hello'), 'x.webp')).status, 400);
  assert.equal((await send(WEBP, 'x.webp', '../db.json')).status, 400);
  assert.equal((await send(WEBP, 'x.webp', rel, '')).status, 400);

  r = await send(WEBP, 'poster.webp');
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const next = r.data.rel;
  assert.equal(next, `imagegallery/${ref.id}/image-s.webp`);
  const p = (await srv.api(`/api/projects/${ref.id}`)).data.project;
  assert.deepEqual([p.image, p.thumb], ['image-s.webp', 'image-s.webp']);
  assert.ok(exists(path.join(srv.dataDir, next)) && !exists(orig));
  let content = (await srv.api(`/api/plans/${plan.id}`)).data.plan.blocks.find((b) => b.id === block.id).content;
  assert.match(content, /image-s\.webp/);
  const item = (await srv.api('/api/trash')).data.items.find((t) => t.trashId === 'batch123');
  assert.match(item.title, /1 picture before they were made smaller/);
  assert.equal((await send(WEBP, 'poster.webp')).status, 404); // it's gone now

  // Undo: the original back, and every name for it.
  r = await srv.api('/api/trash/batch123/restore', { method: 'POST' });
  assert.equal(r.status, 200);
  const back = (await srv.api(`/api/projects/${ref.id}`)).data.project;
  assert.deepEqual([back.image, back.thumb], [ref.image, ref.image]);
  assert.ok(exists(orig) && !exists(path.join(srv.dataDir, next)));
  content = (await srv.api(`/api/plans/${plan.id}`)).data.plan.blocks.find((b) => b.id === block.id).content;
  assert.ok(content.includes(url));
});
