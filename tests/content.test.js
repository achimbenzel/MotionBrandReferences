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

test('content: idea notes, reel beats, checklist, own text per platform, cover — additive', async () => {
  // An older post (none of the new fields) reads with empty ones.
  let r = await srv.api('/api/content', { method: 'POST', json: { title: 'Kinetic type', platforms: ['instagram', 'x'], notes: 'Seen at Buck' } });
  const c = r.data.item;
  assert.deepEqual([c.notes, c.beats, c.checks, c.captions, c.coverId], ['Seen at Buck', [], [], {}, null]);

  r = await srv.api(`/api/content/${c.id}`, {
    method: 'PATCH',
    json: {
      beats: [{ kind: 'hook', text: 'Logo slams in', screen: 'Wait for it', sec: 1.25 }, { kind: 'nope', text: 'Breakdown', sec: 9999 }, 'junk', { kind: 'cta', text: 'Follow', sec: -3 }],
      checks: ['subtitles', 'sound', 'subtitles', 'Bad Key!', 7],
      captions: { x: 'Short one for X', tiktok: '   ', myspace: 'no', instagram: 42 },
    },
  });
  const it = r.data.item;
  assert.deepEqual(it.beats.map((b) => [b.kind, b.text, b.screen, b.sec]), [['hook', 'Logo slams in', 'Wait for it', 1.3], ['body', 'Breakdown', '', 600], ['cta', 'Follow', '', 0]]);
  assert.ok(it.beats.every((b) => typeof b.id === 'string' && b.id));
  assert.deepEqual(it.checks, ['subtitles', 'sound']);
  assert.deepEqual(it.captions, { x: 'Short one for X' });

  // The cover: one of its pictures (an unknown one is refused); gone with the picture, back with Undo.
  const fd = new FormData();
  fd.append('media', new Blob([PNG], { type: 'image/png' }), 'a.png');
  fd.append('media', new Blob([PNG], { type: 'image/png' }), 'b.png');
  const [, second] = (await srv.api(`/api/content/${c.id}/media`, { method: 'POST', body: fd })).data.item.media;
  assert.equal((await srv.api(`/api/content/${c.id}`, { method: 'PATCH', json: { coverId: 'nope' } })).data.item.coverId, null);
  assert.equal((await srv.api(`/api/content/${c.id}`, { method: 'PATCH', json: { coverId: second.id } })).data.item.coverId, second.id);
  r = await srv.api(`/api/content/${c.id}/media/${second.id}`, { method: 'DELETE' });
  assert.equal(r.data.item.coverId, null);
  await srv.api(`/api/trash/${r.data.trashId}/restore`, { method: 'POST' });
  assert.equal((await srv.api(`/api/content/${c.id}`)).data.item.coverId, second.id);

  // Back to the caption for X: the whole set is sent; a copy keeps it all (and its own cover).
  r = await srv.api(`/api/content/${c.id}`, { method: 'PATCH', json: { captions: {} } });
  assert.deepEqual(r.data.item.captions, {});
  const copy = (await srv.api(`/api/content/${c.id}/duplicate`, { method: 'POST' })).data.item;
  assert.deepEqual([copy.notes, copy.beats.length, copy.checks], ['Seen at Buck', 3, ['subtitles', 'sound']]);
  assert.equal(copy.media.findIndex((m) => m.id === copy.coverId), 1);

  // Found by what's only in a beat; a post with just a beat isn't "empty".
  assert.ok((await srv.api('/api/search?q=slams')).data.results.some((x) => x.id === c.id));
  const beatOnly = (await srv.api('/api/content', { method: 'POST', json: {} })).data.item;
  await srv.api(`/api/content/${beatOnly.id}`, { method: 'PATCH', json: { beats: [{ kind: 'hook', text: 'Just a hook' }] } });
  assert.equal((await srv.api(`/api/content/${beatOnly.id}?ifEmpty=1`, { method: 'DELETE' })).data.removed, false);

  // How you appear in the previews: a name and a clean handle.
  r = await srv.api('/api/settings', { method: 'PATCH', json: { contentProfile: { name: 'Achim', handle: '@@achim.motion!' } } });
  assert.deepEqual(r.data.settings.contentProfile, { name: 'Achim', handle: 'achim.motion' });
});
