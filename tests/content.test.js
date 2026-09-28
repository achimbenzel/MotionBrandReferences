// Content: posts planned for social media — created, edited, marked posted,
// pictures / videos added (also from the app), removed to Trash and back,
// duplicated, the whole post to Trash and back; found by search.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { startServer, tempDir, exists } from './helpers.js';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
let srv;
before(async () => { srv = await startServer({ dataDir: await tempDir() }); });
after(async () => { await srv?.stop(); });

test('content: plan a post, add media, post it, Trash and back', async () => {
  let r = await srv.api('/api/content', { method: 'POST', json: { title: 'Logo reveal breakdown', platforms: ['instagram', 'tiktok', 'myspace'], format: 'reel' } });
  assert.equal(r.status, 201);
  const c = r.data.item;
  assert.deepEqual([c.platforms, c.format, c.status, c.date], [['instagram', 'tiktok'], 'reel', 'idea', '']);

  r = await srv.api(`/api/content/${c.id}`, { method: 'PATCH', json: { hook: 'Wait for the last frame', caption: 'How I animated it', hashtags: '#motiondesign #logo', date: '2026-10-02', time: '18:30', format: 'nope', status: 'scheduled' } });
  assert.deepEqual([r.data.item.hook, r.data.item.date, r.data.item.time, r.data.item.format, r.data.item.status], ['Wait for the last frame', '2026-10-02', '18:30', 'reel', 'scheduled']);

  // Pictures and a video; something else is refused.
  const fd = new FormData();
  fd.append('media', new Blob([PNG], { type: 'image/png' }), 'cover.png');
  fd.append('media', new Blob([Buffer.from('fakevideo')], { type: 'video/mp4' }), 'clip.mp4');
  r = await srv.api(`/api/content/${c.id}/media`, { method: 'POST', body: fd });
  assert.equal(r.status, 201);
  const [img, vid] = r.data.item.media;
  assert.deepEqual([img.kind, vid.kind], ['image', 'video']);
  assert.equal((await fetch(`${srv.base}/data/content/${c.id}/${img.file}`)).status, 200);
  const bad = new FormData(); bad.append('media', new Blob(['x'], { type: 'text/plain' }), 'notes.txt');
  assert.equal((await srv.api(`/api/content/${c.id}/media`, { method: 'POST', body: bad })).status, 400);

  // …from the app: its own picture again (as a source), onto a second post.
  const other = (await srv.api('/api/content', { method: 'POST', json: { title: 'Carousel', format: 'carousel', platforms: ['instagram'] } })).data.item;
  r = await srv.api(`/api/content/${other.id}/media`, { method: 'POST', json: { source: { kind: 'content', contentId: c.id, itemId: img.id } } });
  assert.equal(r.status, 201);
  assert.equal(r.data.item.media.length, 1);

  // Posted: planned for a later day, so it went out today; metrics can be kept.
  await srv.api(`/api/content/${c.id}`, { method: 'PATCH', json: { date: '2999-01-01' } });
  r = await srv.api(`/api/content/${c.id}`, { method: 'PATCH', json: { status: 'posted', metrics: { views: 12000, likes: '800', bogus: 3 } } });
  assert.equal(r.data.item.status, 'posted');
  assert.ok(r.data.item.postedAt > 0);
  const d = new Date();
  assert.equal(r.data.item.date, `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
  assert.deepEqual([r.data.item.metrics.views, r.data.item.metrics.likes, r.data.item.metrics.shares, 'bogus' in r.data.item.metrics], [12000, 800, null, false]);

  // A video to Trash and back in its place.
  r = await srv.api(`/api/content/${c.id}/media/${vid.id}`, { method: 'DELETE' });
  assert.ok(!exists(path.join(srv.dataDir, 'content', c.id, vid.file)));
  await srv.api(`/api/trash/${r.data.trashId}/restore`, { method: 'POST' });
  assert.deepEqual((await srv.api(`/api/content/${c.id}`)).data.item.media.map((m) => m.id), [img.id, vid.id]);

  // A copy: same idea, fresh (no date, no numbers, an idea again), its own files.
  r = await srv.api(`/api/content/${c.id}/duplicate`, { method: 'POST' });
  const copy = r.data.item;
  assert.deepEqual([copy.status, copy.date, copy.metrics.views, copy.media.length], ['idea', '', null, 2]);
  assert.ok(exists(path.join(srv.dataDir, 'content', copy.id, copy.media[0].file)));

  // Search finds it; the whole post to Trash and back.
  assert.ok((await srv.api('/api/search?q=breakdown')).data.results.some((x) => x.kind === 'content' && x.id === c.id));
  r = await srv.api(`/api/content/${c.id}`, { method: 'DELETE' });
  assert.ok(!exists(path.join(srv.dataDir, 'content', c.id)));
  await srv.api(`/api/trash/${r.data.trashId}/restore`, { method: 'POST' });
  assert.equal((await srv.api(`/api/content/${c.id}`)).data.item.media.length, 2);
  assert.ok(exists(path.join(srv.dataDir, 'content', c.id, img.file)));

  // The unused-files scan leaves the media alone.
  const unused = (await srv.api('/api/maintenance/unused')).data.files.map((f) => f.rel);
  assert.ok(!unused.some((rel) => rel.startsWith('content/')), unused.join(', '));
});
