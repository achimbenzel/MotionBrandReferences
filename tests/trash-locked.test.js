// Deleting while a file is locked (Windows: a video still playing, a virus
// scan): the delete succeeds all the same — no error 500 — the files stay put
// until the lock is gone and are moved into the Trash then; restoring or
// emptying the Trash meanwhile does the right thing.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { startServer, tempDir, exists } from './helpers.js';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });
let srv;
// Renames of anything under note/ fail with EPERM until data/.unlock exists.
before(async () => { srv = await startServer({ dataDir: await tempDir(), env: { FS_LOCKED: `${path.sep}note${path.sep}`, TRASH_RETRY_MS: '150' } }); });
after(async () => { await srv?.stop(); });

async function noteWithPicture(title) {
  const note = (await srv.api('/api/notes', { method: 'POST', json: { title } })).data.note;
  const fd = new FormData();
  fd.append('images', new Blob([PNG], { type: 'image/png' }), 'frame.png');
  const r = await srv.api(`/api/notes/${note.id}/images`, { method: 'POST', body: fd });
  return r.data.note;
}
const unlock = () => fsp.writeFile(path.join(srv.dataDir, '.unlock'), '');
const lock = () => fsp.rm(path.join(srv.dataDir, '.unlock'), { force: true });
const trashItem = async (trashId) => (await srv.api('/api/trash')).data.items.find((t) => t.trashId === trashId);

test('a locked folder: the delete still succeeds, the files follow once the lock is gone', async () => {
  const note = await noteWithPicture('Locked');
  const dir = path.join(srv.dataDir, 'note', note.id);
  const r = await srv.api(`/api/notes/${note.id}`, { method: 'DELETE' });
  assert.equal(r.status, 200, JSON.stringify(r.data)); // was: 500 EPERM, with the note already in the Trash
  assert.equal((await srv.api(`/api/notes/${note.id}`)).status, 404);
  assert.ok(exists(dir), 'the files wait where they were');
  // The Trash shows its picture from where it is now.
  const item = await trashItem(r.data.trashId);
  assert.ok(item.thumb.startsWith(`/data/note/${note.id}/`), item.thumb);
  assert.equal((await fetch(`${srv.base}${item.thumb}`)).status, 200);
  // The unused-files scan leaves waiting files alone.
  const old = new Date(Date.now() - 3600e3);
  await fsp.utimes(path.join(dir, note.images[0].file), old, old);
  assert.ok(!(await srv.api('/api/maintenance/unused')).data.files.some((f) => f.rel.startsWith(`note/${note.id}`)));

  await unlock();
  for (let i = 0; i < 40 && exists(dir); i += 1) await sleep(100);
  assert.ok(!exists(dir), 'moved once unlocked');
  assert.ok(exists(path.join(srv.dataDir, 'trash', r.data.trashId, note.images[0].file)));
  assert.ok((await trashItem(r.data.trashId)).thumb.startsWith(`/data/trash/${r.data.trashId}/`));
  // Restoring brings it back as usual.
  assert.equal((await srv.api(`/api/trash/${r.data.trashId}/restore`, { method: 'POST' })).status, 200);
  assert.ok(exists(path.join(dir, note.images[0].file)));
  await lock();
});

test('restored or emptied while still waiting: nothing is moved behind your back', async () => {
  const a = await noteWithPicture('Restored while waiting');
  const del = await srv.api(`/api/notes/${a.id}`, { method: 'DELETE' });
  assert.equal(del.status, 200);
  assert.equal((await srv.api(`/api/trash/${del.data.trashId}/restore`, { method: 'POST' })).status, 200);
  await unlock();
  await sleep(700); // the retry comes and goes
  assert.ok(exists(path.join(srv.dataDir, 'note', a.id, a.images[0].file)), 'still with the restored note');
  assert.equal((await srv.api(`/api/notes/${a.id}`)).data.note.images.length, 1);
  await lock();

  const b = await noteWithPicture('Emptied while waiting');
  const del2 = await srv.api(`/api/notes/${b.id}`, { method: 'DELETE' });
  assert.equal(del2.status, 200);
  await unlock(); // deleting for good removes the files where they wait
  assert.equal((await srv.api(`/api/trash/${del2.data.trashId}`, { method: 'DELETE' })).status, 200);
  assert.ok(!exists(path.join(srv.dataDir, 'note', b.id)));
  await lock();

  // A single picture (not the whole note) the same way.
  const c = await noteWithPicture('One picture');
  const r = await srv.api(`/api/notes/${c.id}/images/${c.images[0].id}`, { method: 'DELETE' });
  assert.equal(r.status, 200);
  assert.equal(r.data.note.images.length, 0);
  await unlock();
  for (let i = 0; i < 40 && exists(path.join(srv.dataDir, 'note', c.id, c.images[0].file)); i += 1) await sleep(100);
  assert.ok(exists(path.join(srv.dataDir, 'trash', r.data.trashId, c.images[0].file)));
  await lock();
});
