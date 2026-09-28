// Notes: created, edited, pinned first, pictures added / ordered / deleted to Trash and
// back, the whole note to Trash and back — and the unused-files scan keeps their pictures.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { startServer, tempDir, exists } from './helpers.js';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
let srv;
before(async () => { srv = await startServer({ dataDir: await tempDir() }); });
after(async () => { await srv?.stop(); });

test('notes: create, edit, pin, pictures, Trash and back', async () => {
  assert.deepEqual((await srv.api('/api/notes')).data.notes, []);
  let r = await srv.api('/api/notes', { method: 'POST', json: { title: 'Ideas for the reel' } });
  assert.equal(r.status, 201);
  const a = r.data.note;
  r = await srv.api('/api/notes', { method: 'POST', json: { title: 'Pricing' } });
  const b = r.data.note;
  r = await srv.api(`/api/notes/${a.id}`, { method: 'PATCH', json: { body: 'Open on the logo.\nThen type.', pinned: true, color: 'purple' } });
  assert.deepEqual([r.data.note.body, r.data.note.pinned, r.data.note.color], ['Open on the logo.\nThen type.', true, 'purple']);
  await srv.api(`/api/notes/${b.id}`, { method: 'PATCH', json: { title: 'Pricing 2027' } }); // changed last, but a is pinned
  assert.deepEqual((await srv.api('/api/notes')).data.notes.map((n) => n.id), [a.id, b.id]);

  // Pictures: two uploads (one without an extension — sniffed), a non-picture refused.
  const fd = new FormData();
  fd.append('images', new Blob([PNG], { type: 'image/png' }), 'moodboard.png');
  fd.append('images', new Blob([PNG], { type: 'image/png' }), 'pasted');
  r = await srv.api(`/api/notes/${a.id}/images`, { method: 'POST', body: fd });
  assert.equal(r.status, 201);
  const [i1, i2] = r.data.note.images;
  assert.ok(i1.file.startsWith('images/') && i2.file.endsWith('.png'));
  assert.ok(exists(path.join(srv.dataDir, 'note', a.id, i1.file)));
  assert.equal((await fetch(`${srv.base}/data/note/${a.id}/${i1.file}`)).status, 200);
  const bad = new FormData(); bad.append('images', new Blob(['x'], { type: 'text/plain' }), 'notes.txt');
  assert.equal((await srv.api(`/api/notes/${a.id}/images`, { method: 'POST', body: bad })).status, 400);
  r = await srv.api(`/api/notes/${a.id}`, { method: 'PATCH', json: { order: [i2.id, i1.id] } });
  assert.deepEqual(r.data.note.images.map((i) => i.id), [i2.id, i1.id]);

  // The unused-files scan leaves them alone.
  const old = new Date(Date.now() - 3600e3);
  await fsp.utimes(path.join(srv.dataDir, 'note', a.id, i1.file), old, old);
  const unused = (await srv.api('/api/maintenance/unused')).data.files.map((f) => f.rel);
  assert.ok(!unused.some((rel) => rel.startsWith('note/')), unused.join(', '));

  // A picture to Trash and back (same place).
  r = await srv.api(`/api/notes/${a.id}/images/${i2.id}`, { method: 'DELETE' });
  assert.ok(!exists(path.join(srv.dataDir, 'note', a.id, i2.file)));
  await srv.api(`/api/trash/${r.data.trashId}/restore`, { method: 'POST' });
  let note = (await srv.api(`/api/notes/${a.id}`)).data.note;
  assert.deepEqual(note.images.map((i) => i.id), [i2.id, i1.id]);
  assert.ok(exists(path.join(srv.dataDir, 'note', a.id, i2.file)));

  // Search finds a note by its text.
  const found = (await srv.api('/api/search?q=type')).data.results;
  assert.ok(found.some((x) => x.kind === 'note' && x.id === a.id));

  // An empty note can go without the Trash; one with anything in it stays.
  const empty = (await srv.api('/api/notes', { method: 'POST', json: {} })).data.note;
  assert.deepEqual((await srv.api(`/api/notes/${empty.id}?ifEmpty=1`, { method: 'DELETE' })).data, { ok: true, removed: true });
  assert.equal((await srv.api(`/api/notes/${empty.id}`)).status, 404);
  assert.deepEqual((await srv.api(`/api/notes/${b.id}?ifEmpty=1`, { method: 'DELETE' })).data, { ok: true, removed: false });
  assert.ok(!(await srv.api('/api/trash')).data.items.some((x) => x.kind === 'note'));

  // The whole note to Trash and back, pictures included.
  r = await srv.api(`/api/notes/${a.id}`, { method: 'DELETE' });
  assert.ok(!exists(path.join(srv.dataDir, 'note', a.id)));
  const t = (await srv.api('/api/trash')).data.items.find((x) => x.trashId === r.data.trashId);
  assert.deepEqual([t.title, t.subtitle], ['Ideas for the reel', 'Note']);
  await srv.api(`/api/trash/${r.data.trashId}/restore`, { method: 'POST' });
  note = (await srv.api(`/api/notes/${a.id}`)).data.note;
  assert.equal(note.images.length, 2);
  assert.ok(exists(path.join(srv.dataDir, 'note', a.id, i1.file)));
});
