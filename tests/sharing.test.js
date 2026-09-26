// Work ↔ Reference: YouTube / Vimeo links, "Add to plan", archiving a plan
// into the library, and the Inbox (share from a phone).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { startServer, tempDir, exists } from './helpers.js';
import { seedLegacyLibrary, png } from './fixtures/legacy-library.js';
import { parseVideoLink } from '../server/videoLinks.js';

let srv;
before(async () => {
  const dir = await tempDir();
  await seedLegacyLibrary(dir);
  srv = await startServer({ dataDir: dir, env: { LINK_LOOKUP: 'off' } });
});
after(async () => { await srv?.stop(); });

const newPlan = async (name) => {
  const { status, data } = await srv.api('/api/plans', { method: 'POST', json: { name } });
  assert.equal(status, 201, JSON.stringify(data));
  return data.plan;
};
const imageBlob = () => new Blob([png(8, 8, [255, 80, 0])], { type: 'image/png' });

test('video links: YouTube and Vimeo forms are recognised, others are not', () => {
  for (const u of ['https://youtu.be/dQw4w9WgXcQ', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=30s', 'https://m.youtube.com/shorts/dQw4w9WgXcQ',
    'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ']) {
    assert.deepEqual(parseVideoLink(u), { provider: 'youtube', id: 'dQw4w9WgXcQ', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' }, u);
  }
  assert.deepEqual(parseVideoLink('https://vimeo.com/76979871'), { provider: 'vimeo', id: '76979871', hash: null, url: 'https://vimeo.com/76979871' });
  assert.equal(parseVideoLink('https://player.vimeo.com/video/76979871?h=abc123def0').hash, 'abc123def0');
  for (const u of ['https://example.com/watch?v=dQw4w9WgXcQ', 'javascript:alert(1)', 'https://youtube.com/watch?v=short', '']) {
    assert.equal(parseVideoLink(u), null, u);
  }
});

test('a motion reference can be a YouTube / Vimeo link instead of a file', async () => {
  let fd = new FormData();
  fd.append('type', 'motion');
  fd.append('url', 'https://youtu.be/dQw4w9WgXcQ');
  fd.append('title', '');
  let r = await srv.api('/api/projects', { method: 'POST', body: fd });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  const p = r.data.project;
  assert.equal(p.source, 'link');
  assert.equal(p.provider, 'youtube');
  assert.equal(p.videoId, 'dQw4w9WgXcQ');
  assert.equal(p.title, 'YouTube video'); // no lookup (offline) → a plain name
  assert.equal(p.video, undefined);
  assert.deepEqual([p.frames, p.markers], [[], []]);

  fd = new FormData();
  fd.append('type', 'motion');
  fd.append('url', 'https://vimeo.com/76979871/abcdef1234');
  fd.append('title', 'Stripe launch');
  fd.append('duration', '63.5');
  r = await srv.api('/api/projects', { method: 'POST', body: fd });
  assert.equal(r.data.project.title, 'Stripe launch');
  assert.equal(r.data.project.videoHash, 'abcdef1234');
  assert.equal(r.data.project.duration, 63.5);
  // Moments and sections work on links like on files.
  const m = await srv.api(`/api/projects/${r.data.project.id}`, { method: 'PATCH', json: { markers: [{ t: 3, label: 'Logo reveal' }] } });
  assert.equal(m.data.project.markers[0].label, 'Logo reveal');

  fd = new FormData();
  fd.append('type', 'motion');
  fd.append('url', 'https://example.com/video');
  r = await srv.api('/api/projects', { method: 'POST', body: fd });
  assert.equal(r.status, 400);
  assert.equal(r.data.error, 'video_required');
});

test('add to plan: library items go into the plan’s References, once', async () => {
  const plan = await newPlan('Refs test');
  assert.ok(!plan.blocks.some((b) => b.type === 'refs'));
  let r = await srv.api(`/api/plans/${plan.id}/refs`, { method: 'POST', json: { refKind: 'project', refId: 'brand1' } });
  assert.equal(r.status, 201);
  assert.equal(r.data.added, true);
  const block = r.data.plan.blocks.find((b) => b.id === r.data.blockId);
  assert.equal(block.type, 'refs');
  assert.deepEqual(block.items.map((i) => [i.refKind, i.refId, i.title, i.thumb]), [['project', 'brand1', 'Acme Brand', '/data/branding/brand1/a2.png']]);

  r = await srv.api(`/api/plans/${plan.id}/refs`, { method: 'POST', json: { refKind: 'project', refId: 'brand1' } });
  assert.equal(r.status, 200);
  assert.equal(r.data.added, false);
  r = await srv.api(`/api/plans/${plan.id}/refs`, { method: 'POST', json: { refKind: 'gallery', refId: 'gal1' } });
  assert.equal(r.status, 201);
  assert.equal(r.data.blockId, block.id); // same block
  assert.equal(r.data.plan.blocks.find((b) => b.id === block.id).items[1].subtitle, 'Gallery · Branding');

  assert.equal((await srv.api(`/api/plans/${plan.id}/refs`, { method: 'POST', json: { refKind: 'project', refId: 'nope' } })).status, 400);
  assert.equal((await srv.api('/api/plans/nope/refs', { method: 'POST', json: { refKind: 'project', refId: 'brand1' } })).status, 404);
});

test('archive a plan: final video, chosen images / PDFs and palette become references (copies)', async () => {
  const plan = await newPlan('Nova launch');
  await srv.api(`/api/plans/${plan.id}`, { method: 'PATCH', json: { client: 'Nova' } });
  const addBlock = async (type) => (await srv.api(`/api/plans/${plan.id}/blocks`, { method: 'POST', json: { type } })).data.block;
  const review = await addBlock('review');
  const mood = await addBlock('moodboard');
  const files = await addBlock('files');
  const palette = await addBlock('palette');

  // Review: one uploaded version.
  let fd = new FormData();
  fd.append('files', new Blob([Buffer.from('fake-webm-bytes')], { type: 'video/webm' }), 'final.webm');
  const up = await srv.api(`/api/plans/${plan.id}/blocks/${review.id}/uploads`, { method: 'POST', body: fd });
  const vfile = up.data.files[0];
  await srv.api(`/api/plans/${plan.id}/blocks/${review.id}`, { method: 'PATCH', json: { versions: [{ id: 'v1', file: vfile.file, name: vfile.name, label: 'v1', approved: true }] } });
  // Moodboard: two images. Files: a PDF and a zip (never archived as branding).
  fd = new FormData();
  fd.append('files', imageBlob(), 'frame-a.png');
  fd.append('files', imageBlob(), 'frame-b.png');
  let r = await srv.api(`/api/plans/${plan.id}/blocks/${mood.id}/files`, { method: 'POST', body: fd });
  const [imgA, imgB] = r.data.plan.blocks.find((b) => b.id === mood.id).images;
  fd = new FormData();
  fd.append('files', new Blob([Buffer.from('%PDF-1.4 fake')], { type: 'application/pdf' }), 'guidelines.pdf');
  fd.append('files', new Blob([Buffer.from('PK zip')], { type: 'application/zip' }), 'sources.zip');
  r = await srv.api(`/api/plans/${plan.id}/blocks/${files.id}/files`, { method: 'POST', body: fd });
  const [pdf, zip] = r.data.plan.blocks.find((b) => b.id === files.id).files;
  await srv.api(`/api/plans/${plan.id}/blocks/${palette.id}`, { method: 'PATCH', json: { items: [{ id: 's1', hex: '#FF5000', name: 'Nova orange' }] } });

  // Nothing chosen → refused. A picture as "the video" → refused.
  assert.equal((await srv.api(`/api/plans/${plan.id}/archive`, { method: 'POST', json: {} })).status, 400);
  assert.equal((await srv.api(`/api/plans/${plan.id}/archive`, { method: 'POST', json: { motion: { blockId: mood.id, itemId: imgA.id } } })).status, 400);

  r = await srv.api(`/api/plans/${plan.id}/archive`, {
    method: 'POST',
    json: {
      tags: ['Nova', 'Own work'], year: '2026', archive: true,
      motion: { blockId: review.id, itemId: 'v1', title: 'Nova launch film', duration: 30, width: 1920, height: 1080 },
      branding: { title: 'Nova identity', items: [{ blockId: mood.id, itemId: imgA.id }, { blockId: files.id, itemId: pdf.id }, { blockId: files.id, itemId: zip.id }, { blockId: 'x', itemId: 'y' }] },
      color: { title: 'Nova palette', colors: [{ name: 'Nova orange', hex: '#ff5000', rgb: { r: 255, g: 80, b: 0 } }, { name: 'Bad', hex: 'red' }] },
    },
  });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  const { plan: archived, projects } = r.data;
  assert.deepEqual(projects.map((p) => p.type), ['motion', 'branding', 'color']);
  const [motion, branding, color] = projects;
  assert.equal(motion.title, 'Nova launch film');
  assert.equal(motion.video, 'video.webm');
  assert.deepEqual([motion.duration, motion.width, motion.height], [30, 1920, 1080]);
  assert.deepEqual(motion.tags, ['Nova', 'Own work']);
  assert.equal(motion.fromPlan, plan.id);
  assert.match(motion.notes, /Nova launch/);
  assert.deepEqual(branding.assets.map((a) => a.kind), ['image', 'pdf']); // the zip and the unknown item are left out
  assert.equal(branding.thumb, branding.assets[0].file);
  assert.deepEqual(color.colors.map((c) => c.hex), ['#FF5000']);
  assert.equal(archived.status, 'archived');
  assert.deepEqual(archived.archivedAs.map((a) => a.type), ['motion', 'branding', 'color']);

  // The files are copies: the library serves them and the plan keeps its own.
  assert.equal((await fetch(`${srv.base}/data/motion/${motion.id}/video.webm`)).status, 200);
  assert.equal((await fetch(`${srv.base}/data/branding/${branding.id}/${branding.assets[1].file}`)).status, 200);
  assert.equal((await fetch(`${srv.base}/data/plan/${plan.id}/${vfile.file}`)).status, 200);
  assert.equal((await fetch(`${srv.base}/data/plan/${plan.id}/${imgB.file}`)).status, 200);
  const lib = await srv.api('/api/projects?type=motion');
  assert.ok(lib.data.projects.some((p) => p.id === motion.id));
});

test('inbox: files, links and notes arrive; a link inside shared text is found', async () => {
  assert.deepEqual((await srv.api('/api/inbox')).data.items, []); // older libraries have no inbox yet

  let fd = new FormData();
  fd.append('files', imageBlob(), 'screenshot.png');
  fd.append('files', new Blob([Buffer.from('%PDF-1.4')], { type: 'application/pdf' }), 'deck.pdf');
  fd.append('title', 'Behance shot');
  let r = await srv.api('/api/inbox', { method: 'POST', body: fd });
  assert.equal(r.status, 201);
  assert.deepEqual(r.data.items.map((i) => [i.kind, i.name, i.title, i.via]), [['file', 'screenshot.png', 'Behance shot', 'app'], ['file', 'deck.pdf', 'Behance shot', 'app']]);
  const shot = r.data.items[0];
  assert.equal((await fetch(`${srv.base}/data/inbox/${shot.id}/${shot.file}`)).status, 200);

  fd = new FormData();
  fd.append('text', 'Look at this https://vimeo.com/76979871, so good');
  r = await srv.api('/api/inbox', { method: 'POST', body: fd });
  assert.deepEqual(r.data.items.map((i) => [i.kind, i.url, i.text, i.provider]), [['link', 'https://vimeo.com/76979871', 'Look at this so good', 'vimeo']]);
  fd = new FormData();
  fd.append('text', 'Idea: end card with the logo sting');
  r = await srv.api('/api/inbox', { method: 'POST', body: fd });
  assert.equal(r.data.items[0].kind, 'text');
  fd = new FormData();
  fd.append('url', 'javascript:alert(1)');
  assert.equal((await srv.api('/api/inbox', { method: 'POST', body: fd })).status, 400);

  const list = (await srv.api('/api/inbox')).data.items;
  assert.deepEqual(list.map((i) => i.kind), ['text', 'link', 'file', 'file']); // newest first, files in shared order
});

test('share target: a plain form POST is accepted unless it comes from another site', async () => {
  const post = (headers) => {
    const fd = new FormData();
    fd.append('title', 'Shared page');
    fd.append('text', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    return fetch(`${srv.base}/api/inbox/share`, { method: 'POST', body: fd, headers, redirect: 'manual' });
  };
  let r = await post({ 'Sec-Fetch-Site': 'none' });
  assert.equal(r.status, 303);
  assert.equal(r.headers.get('location'), '/inbox?shared=1');
  r = await post({ 'Sec-Fetch-Site': 'cross-site' });
  assert.equal(r.status, 403);
  r = await post({ 'Sec-Fetch-Site': 'same-site' });
  assert.equal(r.status, 403);
  // The normal API still needs the header, share or not.
  const plain = await fetch(`${srv.base}/api/inbox`, { method: 'POST', body: new FormData(), headers: { 'Sec-Fetch-Site': 'none' } });
  assert.equal(plain.status, 403);
  const items = (await srv.api('/api/inbox')).data.items;
  assert.equal(items[0].via, 'share');
  assert.equal(items[0].provider, 'youtube');
  assert.equal(items[0].title, 'Shared page');
});

test('inbox → plan: images to a moodboard, links to links, notes to text; the item leaves the inbox', async () => {
  const plan = await newPlan('Inbox target');
  const items = (await srv.api('/api/inbox')).data.items;
  const img = items.find((i) => i.name === 'screenshot.png');
  const pdf = items.find((i) => i.name === 'deck.pdf');
  const link = items.find((i) => i.provider === 'vimeo');
  const note = items.find((i) => i.kind === 'text');

  let r = await srv.api(`/api/inbox/${img.id}/to-plan`, { method: 'POST', json: { planId: plan.id } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.blockType, 'moodboard');
  const board = r.data.plan.blocks.find((b) => b.id === r.data.blockId);
  assert.equal(board.images.length, 1);
  assert.equal((await fetch(`${srv.base}/data/plan/${plan.id}/${board.images[0].file}`)).status, 200);
  assert.ok(!exists(path.join(srv.dataDir, 'inbox', img.id)));

  r = await srv.api(`/api/inbox/${pdf.id}/to-plan`, { method: 'POST', json: { planId: plan.id } });
  assert.equal(r.data.blockType, 'files'); // no PDF block in this plan
  assert.equal(r.data.plan.blocks.find((b) => b.id === r.data.blockId).files[0].name, 'deck.pdf');
  r = await srv.api(`/api/inbox/${link.id}/to-plan`, { method: 'POST', json: { planId: plan.id } });
  assert.deepEqual(r.data.plan.blocks.find((b) => b.id === r.data.blockId).items.map((i) => i.url), ['https://vimeo.com/76979871']);
  r = await srv.api(`/api/inbox/${note.id}/to-plan`, { method: 'POST', json: { planId: plan.id } });
  assert.match(r.data.plan.blocks.find((b) => b.id === r.data.blockId).content, /end card/);

  const left = (await srv.api('/api/inbox')).data.items.map((i) => i.id);
  assert.ok(![img.id, pdf.id, link.id, note.id].some((id) => left.includes(id)));
  assert.equal((await srv.api(`/api/inbox/${img.id}/to-plan`, { method: 'POST', json: { planId: plan.id } })).status, 404);
});

test('inbox delete goes to Trash (restorable); "used" deletes for good', async () => {
  const fd = new FormData();
  fd.append('files', imageBlob(), 'a.png');
  fd.append('files', imageBlob(), 'b.png');
  const [a, b] = (await srv.api('/api/inbox', { method: 'POST', body: fd })).data.items;

  const del = await srv.api(`/api/inbox/${a.id}`, { method: 'DELETE' });
  assert.ok(del.data.trashId);
  assert.equal((await fetch(`${srv.base}/data/inbox/${a.id}/${a.file}`)).status, 404);
  const trash = (await srv.api('/api/trash')).data.items.find((t) => t.trashId === del.data.trashId);
  assert.deepEqual([trash.kind, trash.title, trash.subtitle], ['inbox', 'a.png', 'Inbox']);
  assert.ok(trash.thumb);
  await srv.api(`/api/trash/${del.data.trashId}/restore`, { method: 'POST' });
  assert.ok((await srv.api('/api/inbox')).data.items.some((i) => i.id === a.id));
  assert.equal((await fetch(`${srv.base}/data/inbox/${a.id}/${a.file}`)).status, 200);

  const used = await srv.api(`/api/inbox/${b.id}?used=1`, { method: 'DELETE' });
  assert.equal(used.data.trashId, null);
  assert.ok(!exists(path.join(srv.dataDir, 'inbox', b.id)));
  assert.ok(!(await srv.api('/api/trash')).data.items.some((t) => t.title === 'b.png'));
  assert.equal((await srv.api('/api/inbox/nope', { method: 'DELETE' })).status, 404);
});
