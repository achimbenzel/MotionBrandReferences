// Mockups: saved 3D scenes, their screen content (upload or from the
// library), duplicates, Trash, and imported 3D models.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { startServer, tempDir, exists } from './helpers.js';
import { seedLegacyLibrary, png } from './fixtures/legacy-library.js';

let srv;
before(async () => {
  const dir = await tempDir();
  await seedLegacyLibrary(dir);
  srv = await startServer({ dataDir: dir });
});
after(async () => { await srv?.stop(); });

const served = async (m, file) => (await fetch(`${srv.base}/data/mockup/${m.id}/${file}`)).status;

test('scenes: created with defaults, settings sanitised, content and thumb stay server-owned', async () => {
  let r = await srv.api('/api/mockups', { method: 'POST', json: { name: 'Hero', device: 'macbook', content: { file: 'x.png' } } });
  assert.equal(r.status, 201);
  const m = r.data.mockup;
  assert.deepEqual([m.name, m.device, m.frame, m.fit, m.shadow, m.content, m.background.mode], ['Hero', 'macbook', '16:9', 'cover', true, null, 'gradient']);

  r = await srv.api(`/api/mockups/${m.id}`, {
    method: 'PATCH',
    json: { lid: 400, device: 'toaster', frame: '4:5', landscape: true, background: { mode: 'color', color: '#FF0000', color2: 'nope' },
      camera: { preset: 'three-quarter', position: [1, 2, 'x'], target: [0, 1, 0], fov: 500 }, content: { file: 'evil.png' }, thumb: '../../db.json', shadow: false },
  });
  const p = r.data.mockup;
  assert.deepEqual([p.lid, p.device, p.frame, p.landscape, p.shadow], [180, 'iphone', '4:5', true, false]);
  assert.deepEqual(p.background, { mode: 'color', color: '#FF0000', color2: '#2A2A33' });
  assert.deepEqual(p.camera, { preset: 'three-quarter', position: null, target: [0, 1, 0], fov: 90 });
  assert.deepEqual([p.content, p.thumb], [null, null]);

  const list = await srv.api('/api/mockups');
  assert.equal(list.data.mockups[0].id, m.id);
  assert.deepEqual(list.data.models, []);
});

test('screen content: upload an image or video, or take one from the library by id', async () => {
  const m = (await srv.api('/api/mockups', { method: 'POST', json: { device: 'iphone' } })).data.mockup;
  let fd = new FormData();
  fd.append('file', new Blob([png(9, 19, [10, 120, 255])], { type: 'image/png' }), 'screen.png');
  let r = await srv.api(`/api/mockups/${m.id}/content`, { method: 'POST', body: fd });
  assert.equal(r.status, 200);
  const first = r.data.mockup.content;
  assert.deepEqual([first.kind, first.name], ['image', 'screen.png']);
  assert.equal(await served(m, first.file), 200);

  fd = new FormData();
  fd.append('file', new Blob([Buffer.from('%PDF')], { type: 'application/pdf' }), 'deck.pdf');
  assert.equal((await srv.api(`/api/mockups/${m.id}/content`, { method: 'POST', body: fd })).status, 400);

  // A Motion reference's video replaces it (and the old file goes).
  r = await srv.api(`/api/mockups/${m.id}/content/import`, { method: 'POST', json: { source: { kind: 'project', projectId: 'mot1' } } });
  assert.equal(r.data.mockup.content.kind, 'video');
  assert.equal(await served(m, first.file), 404);
  // One of its frames, a plan's moodboard image, a branding image asset.
  r = await srv.api(`/api/mockups/${m.id}/content/import`, { method: 'POST', json: { source: { kind: 'project', projectId: 'mot1', itemId: 'f1' } } });
  assert.equal(r.data.mockup.content.kind, 'image');
  r = await srv.api(`/api/mockups/${m.id}/content/import`, { method: 'POST', json: { source: { kind: 'plan', planId: 'plan3', blockId: 'b3', itemId: 'mi' } } });
  assert.equal(r.data.mockup.content.kind, 'image');
  r = await srv.api(`/api/mockups/${m.id}/content/import`, { method: 'POST', json: { source: { kind: 'project', projectId: 'brand1', itemId: 'a2' } } });
  assert.equal(await served(m, r.data.mockup.content.file), 200);
  // Not a picture / video, or unknown → refused.
  for (const source of [{ kind: 'project', projectId: 'brand1', itemId: 'a1' }, { kind: 'plan', planId: 'plan3', blockId: 'b2', itemId: 'fa' }, { kind: 'file', path: '../db.json' }]) {
    assert.equal((await srv.api(`/api/mockups/${m.id}/content/import`, { method: 'POST', json: { source } })).status, 400, JSON.stringify(source));
  }
  r = await srv.api(`/api/mockups/${m.id}/content`, { method: 'DELETE' });
  assert.equal(r.data.mockup.content, null);
});

test('thumb, duplicate, delete to Trash and restore', async () => {
  const m = (await srv.api('/api/mockups', { method: 'POST', json: { name: 'Original', device: 'ipad' } })).data.mockup;
  let fd = new FormData();
  fd.append('file', new Blob([png(4, 3, [200, 0, 0])], { type: 'image/png' }), 's.png');
  await srv.api(`/api/mockups/${m.id}/content`, { method: 'POST', body: fd });
  fd = new FormData();
  fd.append('thumb', new Blob([png(8, 5, [0, 200, 0])], { type: 'image/png' }), 'thumb.png');
  const withThumb = (await srv.api(`/api/mockups/${m.id}/thumb`, { method: 'POST', body: fd })).data.mockup;
  assert.ok(withThumb.thumb.startsWith('thumb-'));

  const copy = (await srv.api(`/api/mockups/${m.id}/duplicate`, { method: 'POST' })).data.mockup;
  assert.equal(copy.name, 'Original copy');
  assert.notEqual(copy.id, m.id);
  assert.equal(await served(copy, withThumb.content.file), 200);

  const del = await srv.api(`/api/mockups/${m.id}`, { method: 'DELETE' });
  assert.equal(await served(m, withThumb.thumb), 404);
  const t = (await srv.api('/api/trash')).data.items.find((x) => x.trashId === del.data.trashId);
  assert.deepEqual([t.kind, t.title, t.subtitle], ['mockup', 'Original', 'Mockup']);
  assert.ok(t.thumb);
  await srv.api(`/api/trash/${del.data.trashId}/restore`, { method: 'POST' });
  assert.equal(await served(m, withThumb.content.file), 200);
  assert.ok((await srv.api(`/api/mockups/${m.id}`)).status === 200);
});

test('3D models: import .glb / .usdz, pick the screen mesh, delete to Trash', async () => {
  let fd = new FormData();
  fd.append('model', new Blob([Buffer.from('glTF-binary-bytes')], { type: 'model/gltf-binary' }), 'iPhone 17 Pro.glb');
  let r = await srv.api('/api/mockup-models', { method: 'POST', body: fd });
  assert.equal(r.status, 201);
  const model = r.data.model;
  assert.deepEqual([model.name, model.file, model.format], ['iPhone 17 Pro', 'model.glb', 'glb']);
  assert.equal((await fetch(`${srv.base}/data/mockup-model/${model.id}/model.glb`)).status, 200);

  fd = new FormData();
  fd.append('model', new Blob([Buffer.from('PK')]), 'mac.usdz');
  fd.append('name', 'MacBook Pro');
  assert.equal((await srv.api('/api/mockup-models', { method: 'POST', body: fd })).data.model.format, 'usdz');
  fd = new FormData();
  fd.append('model', new Blob([Buffer.from('x')]), 'thing.obj');
  assert.equal((await srv.api('/api/mockup-models', { method: 'POST', body: fd })).status, 400);

  r = await srv.api(`/api/mockup-models/${model.id}`, { method: 'PATCH', json: { screenMesh: 'Screen_Glass', screenTurn: 90, screenFlip: true, file: 'x' } });
  assert.deepEqual([r.data.model.screenMesh, r.data.model.screenTurn, r.data.model.screenFlip, r.data.model.file], ['Screen_Glass', 90, true, 'model.glb']);
  r = await srv.api(`/api/mockup-models/${model.id}`, { method: 'PATCH', json: { screenTurn: 45 } });
  assert.equal(r.data.model.screenTurn, 0);

  const scene = (await srv.api('/api/mockups', { method: 'POST', json: { device: 'custom', modelId: model.id } })).data.mockup;
  assert.deepEqual([scene.device, scene.modelId], ['custom', model.id]);

  const del = await srv.api(`/api/mockup-models/${model.id}`, { method: 'DELETE' });
  assert.ok(!exists(path.join(srv.dataDir, 'mockup-model', model.id)));
  assert.equal((await srv.api('/api/trash')).data.items.find((x) => x.trashId === del.data.trashId).subtitle, '3D model (mockups)');
  await srv.api(`/api/trash/${del.data.trashId}/restore`, { method: 'POST' });
  assert.ok((await srv.api('/api/mockups')).data.models.some((x) => x.id === model.id));
});

test('several devices per scene: items with their own screens; older single-device scenes read as one', async () => {
  // A scene saved before several devices existed (top-level device fields only).
  const legacy = (await srv.api('/api/mockups', { method: 'POST', json: { device: 'ipad', color: 'silver', landscape: true } })).data.mockup;
  assert.equal(legacy.items.length, 1);
  assert.deepEqual([legacy.items[0].device, legacy.items[0].color, legacy.items[0].landscape], ['ipad', 'silver', true]);
  assert.deepEqual(legacy.items[0].adjust, { scale: 1, x: 0, y: 0 });
  assert.equal(legacy.animation.preset, 'none');

  const main = legacy.items[0].id;
  let fd = new FormData();
  fd.append('file', new Blob([png(6, 4, [1, 2, 3])], { type: 'image/png' }), 'first.png');
  await srv.api(`/api/mockups/${legacy.id}/content`, { method: 'POST', body: fd });

  // Add a phone in front that shows the same picture, and a MacBook; content from the client is ignored.
  let r = await srv.api(`/api/mockups/${legacy.id}`, {
    method: 'PATCH',
    json: {
      items: [
        { id: main, device: 'ipad', color: 'silver', landscape: true, x: -20, adjust: { scale: 1.5, x: 0.1, y: -9 } },
        { id: 'p2', device: 'iphone', contentFrom: main, x: 18, z: 10, rotY: -20 },
        { id: 'm3', device: 'macbook', content: { file: 'evil.png' }, lid: 500 },
      ],
      animation: { preset: 'turntable', duration: 99, easing: 'linear' },
    },
  });
  let m = r.data.mockup;
  assert.deepEqual(m.items.map((it) => it.device), ['ipad', 'iphone', 'macbook']);
  assert.equal(m.items[1].content.file, m.items[0].content.file);
  assert.equal(m.items[2].content, null);
  assert.deepEqual(m.items[0].adjust, { scale: 1.5, x: 0.1, y: -3 });
  assert.deepEqual([m.items[1].x, m.items[1].z, m.items[1].rotY, m.items[2].lid], [18, 10, -20, 180]);
  assert.deepEqual(m.animation, { preset: 'turntable', duration: 60, easing: 'linear', camera: [] });
  assert.equal(m.device, 'ipad'); // the first device, mirrored for simple readers

  // Replacing the picture on one device keeps the shared file for the other…
  const shared = m.items[0].content.file;
  fd = new FormData();
  fd.append('file', new Blob([png(3, 3, [9, 9, 9])], { type: 'image/png' }), 'phone.png');
  r = await srv.api(`/api/mockups/${legacy.id}/content?item=p2`, { method: 'POST', body: fd });
  m = r.data.mockup;
  assert.equal(m.items[1].content.name, 'phone.png');
  assert.equal(m.items[0].content.file, shared);
  assert.equal(await served(m, shared), 200);
  // …and removing it from the last device that shows it deletes the file.
  r = await srv.api(`/api/mockups/${legacy.id}/content?item=${main}`, { method: 'DELETE' });
  assert.equal(r.data.mockup.items[0].content, null);
  assert.equal(await served(m, shared), 404);
  assert.equal((await srv.api(`/api/mockups/${legacy.id}/content?item=nope`, { method: 'DELETE' })).status, 404);

  // Single-device fields still change the first device.
  r = await srv.api(`/api/mockups/${legacy.id}`, { method: 'PATCH', json: { color: 'spacegray' } });
  assert.deepEqual([r.data.mockup.items[0].color, r.data.mockup.items.length], ['spacegray', 3]);
});

test('timeline, hinge, sound, light: keyframes sorted and bounded, legacy shadow read as a light setting', async () => {
  const m = (await srv.api('/api/mockups', { method: 'POST', json: { device: 'custom', shadow: false } })).data.mockup;
  assert.deepEqual(m.light, { setup: 'studio', rotation: 0, exposure: 1, shadow: 'none', strength: 0.6, hdri: '', blur: 0.35 });
  const main = m.items[0].id;
  const r = await srv.api(`/api/mockups/${m.id}`, {
    method: 'PATCH',
    json: {
      light: { setup: 'golden', rotation: 45, exposure: 9, shadow: 'both' },
      animation: { duration: 8, camera: [{ t: 5, position: [1, 2, 3] }, { t: 1, position: [0, 1, 9], target: [0, 1, 0], fov: 40 }, { t: 2, position: 'nope' }] },
      items: [{ id: main, device: 'custom', hingeAngle: -25, keys: { hinge: [{ t: 3, v: 20 }, { t: 0, v: -60 }, { t: 'x', v: 1 }] }, videoStart: 12.5, sound: true, volume: 3 }],
    },
  });
  const s = r.data.mockup;
  assert.deepEqual(s.light, { setup: 'golden', rotation: 45, exposure: 3, shadow: 'both', strength: 0.6, hdri: '', blur: 0.35 });
  assert.deepEqual(s.animation.camera.map((k) => k.t), [1, 5]);
  assert.deepEqual(s.animation.camera[0], { t: 1, position: [0, 1, 9], target: [0, 1, 0], fov: 40 });
  const it = s.items[0];
  assert.deepEqual([it.hingeAngle, it.videoStart, it.sound, it.volume], [-25, 12.5, true, 1]);
  assert.deepEqual(it.keys.hinge, [{ t: 0, v: -60 }, { t: 3, v: 20 }]);

  // Imported models remember their hinge.
  const fd = new FormData();
  fd.append('model', new Blob([Buffer.from('glTF')]), 'MacBook Pro.glb');
  const model = (await srv.api('/api/mockup-models', { method: 'POST', body: fd })).data.model;
  let mr = await srv.api(`/api/mockup-models/${model.id}`, { method: 'PATCH', json: { hinge: { node: 'Rotate_Screen001', axis: 'q', invert: true } } });
  assert.deepEqual(mr.data.model.hinge, { node: 'Rotate_Screen001', axis: 'x', invert: true });
  mr = await srv.api(`/api/mockup-models/${model.id}`, { method: 'PATCH', json: { hinge: false } });
  assert.equal(mr.data.model.hinge, false);
});

test('2D mockups: texts / numbers / switches sanitised, pictures in named slots, server-owned', async () => {
  let r = await srv.api('/api/mockups', {
    method: 'POST',
    json: { kind: '2d', name: 'Launch post', frame: 'auto', d2: { type: 'ig-post', theme: 'dark', text: { username: 'orbit', caption: 'Hello', 'bad key!': 'x' }, nums: { likes: '1200', nope: 'x' }, flags: { verified: true, liked: 'yes' }, slots: { media: { file: 'evil.png' } } } },
  });
  const m = r.data.mockup;
  assert.deepEqual([m.kind, m.frame, m.d2.type, m.d2.theme], ['2d', 'auto', 'ig-post', 'dark']);
  assert.deepEqual(m.d2.text, { username: 'orbit', caption: 'Hello' });
  assert.deepEqual([m.d2.nums, m.d2.flags, m.d2.slots], [{ likes: 1200 }, { verified: true }, {}]);

  let fd = new FormData();
  fd.append('file', new Blob([png(8, 8, [5, 5, 5])], { type: 'image/png' }), 'shot.png');
  r = await srv.api(`/api/mockups/${m.id}/content?slot=media-0`, { method: 'POST', body: fd });
  const slot = r.data.mockup.d2.slots['media-0'];
  assert.deepEqual([slot.kind, slot.name, slot.adjust], ['image', 'shot.png', { scale: 1, x: 0, y: 0 }]);
  assert.equal(await served(m, slot.file), 200);
  fd = new FormData();
  fd.append('file', new Blob([png(8, 8, [5, 5, 5])], { type: 'image/png' }), 'x.png');
  assert.equal((await srv.api(`/api/mockups/${m.id}/content?slot=../evil`, { method: 'POST', body: fd })).status, 404);

  // Texts change; slots keep their file, only their size / position can be set.
  r = await srv.api(`/api/mockups/${m.id}`, { method: 'PATCH', json: { d2: { text: { username: 'orbit.app' }, padding: 2, slots: { 'media-0': { file: 'other.png', adjust: { scale: 2, x: 0.1, y: 0 } } } } } });
  const p = r.data.mockup.d2;
  assert.deepEqual([p.text.username, p.padding, p.slots['media-0'].file, p.slots['media-0'].adjust.scale], ['orbit.app', 0.45, slot.file, 2]);
  r = await srv.api(`/api/mockups/${m.id}/content?slot=media-0`, { method: 'DELETE' });
  assert.deepEqual(r.data.mockup.d2.slots, {});
  assert.equal(await served(m, slot.file), 404);
});

test('your own HDRIs: .hdr / .exr / panorama imported with a preview, picked as the light, deleted to Trash', async () => {
  let fd = new FormData();
  fd.append('hdri', new Blob([Buffer.from('#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y 1 +X 2\n')]), 'Studio Loft 4k.hdr');
  let r = await srv.api('/api/mockup-hdris', { method: 'POST', body: fd });
  assert.equal(r.status, 201);
  const h = r.data.hdri;
  assert.deepEqual([h.name, h.file, h.format, h.thumb], ['Studio Loft 4k', 'env.hdr', 'hdr', null]);
  assert.equal((await fetch(`${srv.base}/data/mockup-hdri/${h.id}/env.hdr`)).status, 200);
  fd = new FormData();
  fd.append('hdri', new Blob([png(4, 2, [200, 180, 150])], { type: 'image/png' }), 'beach.png');
  assert.equal((await srv.api('/api/mockup-hdris', { method: 'POST', body: fd })).data.hdri.format, 'png');
  fd = new FormData();
  fd.append('hdri', new Blob([Buffer.from('x')]), 'room.pdf');
  assert.equal((await srv.api('/api/mockup-hdris', { method: 'POST', body: fd })).status, 400);

  fd = new FormData();
  fd.append('thumb', new Blob([png(8, 4, [1, 2, 3])], { type: 'image/png' }), 'thumb.png');
  r = await srv.api(`/api/mockup-hdris/${h.id}/thumb`, { method: 'POST', body: fd });
  assert.match(r.data.hdri.thumb, /^thumb-.*\.png$/);
  r = await srv.api(`/api/mockup-hdris/${h.id}`, { method: 'PATCH', json: { name: 'Loft', file: '../x' } });
  assert.deepEqual([r.data.hdri.name, r.data.hdri.file], ['Loft', 'env.hdr']);
  assert.ok((await srv.api('/api/mockups')).data.hdris.some((x) => x.id === h.id));

  const scene = (await srv.api('/api/mockups', { method: 'POST', json: { light: { setup: 'hdri', hdri: h.id, blur: 0 } } })).data.mockup;
  assert.deepEqual([scene.light.setup, scene.light.hdri, scene.light.blur], ['hdri', h.id, 0]);

  const del = await srv.api(`/api/mockup-hdris/${h.id}`, { method: 'DELETE' });
  assert.ok(!exists(path.join(srv.dataDir, 'mockup-hdri', h.id)));
  assert.equal((await srv.api('/api/trash')).data.items.find((x) => x.trashId === del.data.trashId).subtitle, 'HDRI (mockup light)');
  await srv.api(`/api/trash/${del.data.trashId}/restore`, { method: 'POST' });
  assert.ok((await srv.api('/api/mockups')).data.hdris.some((x) => x.id === h.id));
  assert.ok(exists(path.join(srv.dataDir, 'mockup-hdri', h.id, 'env.hdr')));
});

test('a plan\'s profile picture / banner onto a screen — also older ones saved as .img', async () => {
  const plan = (await srv.api('/api/plans', { method: 'POST', json: { name: 'Avatar plan' } })).data.plan;
  let fd = new FormData();
  fd.append('avatar', new Blob([png(6, 6, [255, 0, 0])], { type: 'image/png' }), 'avatar.img'); // how older versions named it
  assert.match((await srv.api(`/api/plans/${plan.id}/avatar`, { method: 'POST', body: fd })).data.plan.avatar, /\.img$/);
  const m = (await srv.api('/api/mockups', { method: 'POST', json: { kind: '2d', d2: { type: 'ig-post' } } })).data.mockup;
  let r = await srv.api(`/api/mockups/${m.id}/content/import?slot=avatar`, { method: 'POST', json: { source: { kind: 'plan', planId: plan.id, itemId: '@avatar' } } });
  assert.equal(r.status, 200);
  const slot = r.data.mockup.d2.slots.avatar;
  assert.equal(slot.kind, 'image');
  assert.match(slot.file, /\.png$/);
  assert.equal(await served(m, slot.file), 200);
  // No banner yet → refused.
  r = await srv.api(`/api/mockups/${m.id}/content/import?slot=banner`, { method: 'POST', json: { source: { kind: 'plan', planId: plan.id, itemId: '@banner' } } });
  assert.equal(r.status, 400);
  // New uploads keep their real extension.
  fd = new FormData();
  fd.append('banner', new Blob([png(12, 4, [0, 0, 255])], { type: 'image/png' }), 'banner.png');
  assert.match((await srv.api(`/api/plans/${plan.id}/banner`, { method: 'POST', body: fd })).data.plan.banner, /\.png$/);
});
