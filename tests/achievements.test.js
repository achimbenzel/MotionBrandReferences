// Achievements: your own, the starter set, unlocking by the numbers (biggest
// deal, followers, delivered projects, posts), pictures, Trash and back.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { startServer, tempDir, exists } from './helpers.js';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
let srv;
before(async () => { srv = await startServer({ dataDir: await tempDir() }); });
after(async () => { await srv?.stop(); });

test('achievements: own ones, the starter set, unlocking by the numbers', async () => {
  let r = await srv.api('/api/achievements');
  assert.deepEqual([r.data.achievements, r.data.metrics.deal, r.data.stats.followers.instagram], [[], 0, 0]);
  assert.ok(r.data.ideas.length > 3);

  // Your own: a quest with a symbol, reached on a day you pick.
  r = await srv.api('/api/achievements', { method: 'POST', json: { group: 'Special Quests', title: 'Dienstreise', rarity: 'quest', icon: { type: 'symbol', symbol: 'car' }, achievedAt: '2025-07-17', rarity2: 'x' } });
  assert.equal(r.status, 201);
  const trip = r.data.achievement;
  assert.deepEqual([trip.rarity, trip.icon.type, trip.icon.symbol, trip.achievedAt], ['quest', 'symbol', 'car', '2025-07-17']);
  r = await srv.api(`/api/achievements/${trip.id}`, { method: 'PATCH', json: { rarity: 'legendary', achievedAt: 'soon' } });
  assert.deepEqual([r.data.achievement.rarity, r.data.achievement.achievedAt], ['quest', '']);

  // The starter set: its groups, the dates from the picture — and not twice.
  r = await srv.api('/api/achievements/starter', { method: 'POST' });
  assert.equal(r.status, 201);
  const set = r.data.achievements;
  assert.ok(r.data.added >= 40);
  assert.deepEqual([...new Set(set.map((a) => a.group))].sort(), ['Content', 'Instagram', 'Kundenstamm', 'Special Quests', 'Umsatz']);
  const deal500 = set.find((a) => a.title === 'Der 500€-Deal');
  assert.deepEqual([deal500.metric, deal500.target, deal500.rarity, deal500.achievedAt, deal500.icon.text], ['deal', 500, 'stone', '2024-10-21', '500']);
  assert.equal(set.find((a) => a.title === '2K Follower erreicht').achievedAt, '2024-02-21');
  assert.equal((await srv.api('/api/achievements/starter', { method: 'POST' })).data.added, 0); // a second time adds nothing
  const count = (await srv.api('/api/achievements')).data.achievements.length;

  // Followers you keep up to date: 5K unlocks today (10K not yet); reached ones stay reached.
  r = await srv.api('/api/achievement-stats', { method: 'PATCH', json: { followers: { instagram: 5400 }, earlier: { projects: 99 } } });
  const five = r.data.achievements.find((a) => a.title === '5K Follower erreicht');
  const ten = r.data.achievements.find((a) => a.title === '10K Follower erreicht');
  assert.deepEqual([five.achievedAt, ten.achievedAt, r.data.metrics['followers:instagram']], [today(), '', 5400]);
  assert.ok(r.data.unlocked.includes(five.id));
  r = await srv.api('/api/achievement-stats', { method: 'PATCH', json: { followers: { instagram: 10 } } });
  assert.equal(r.data.achievements.find((a) => a.id === five.id).achievedAt, today());

  // The biggest deal: an invoice over 3,000 unlocks the 3K deal; a delivered client project is the 100th.
  const client = (await srv.api('/api/clients', { method: 'POST', json: { name: 'Acme' } })).data.client;
  const fd = new FormData(); fd.append('files', new Blob(['%PDF-1.4'], { type: 'application/pdf' }), 'inv.pdf'); fd.append('amount', '3200');
  await srv.api(`/api/clients/${client.id}/invoices`, { method: 'POST', body: fd });
  const plan = (await srv.api('/api/plans', { method: 'POST', json: { name: 'Reel', clientId: client.id } })).data.plan;
  await srv.api(`/api/plans/${plan.id}`, { method: 'PATCH', json: { status: 'delivered' } });
  r = await srv.api('/api/achievements');
  const byTitle = (t) => r.data.achievements.find((a) => a.title === t);
  assert.deepEqual([r.data.metrics.deal, r.data.metrics.projects], [3200, 100]);
  assert.equal(byTitle('Der 3.000€-Deal').achievedAt, today());
  assert.equal(byTitle('Der 5.000€-Deal').achievedAt, '');
  assert.equal(byTitle('100 Kunden betreut').achievedAt, today());
  assert.ok(r.data.unlocked.length >= 2);
  assert.deepEqual((await srv.api('/api/achievements')).data.unlocked, []); // only once

  // A posted content item counts too.
  const post = (await srv.api('/api/content', { method: 'POST', json: { title: 'First reel', status: 'posted' } })).data.item;
  assert.equal(post.status, 'posted');
  r = await srv.api('/api/achievements');
  assert.equal(r.data.achievements.find((a) => a.title === 'Der erste Post').achievedAt, today());

  // Icon picture and sticker; the whole achievement to Trash and back.
  const pic = new FormData(); pic.append('image', new Blob([PNG], { type: 'image/png' }), 'parookaville.png');
  r = await srv.api(`/api/achievements/${trip.id}/image?slot=sticker`, { method: 'POST', body: pic });
  assert.match(r.data.achievement.sticker, /^sticker-.+\.png$/);
  assert.equal((await fetch(`${srv.base}/data/achievement/${trip.id}/${r.data.achievement.sticker}`)).status, 200);
  r = await srv.api(`/api/achievements/${trip.id}/image?slot=icon`, { method: 'POST', json: { source: { kind: 'achievement', id: 'x' } } });
  assert.equal(r.status, 400);
  r = await srv.api(`/api/achievements/${trip.id}`, { method: 'DELETE' });
  assert.ok(!exists(path.join(srv.dataDir, 'achievement', trip.id)));
  assert.equal((await srv.api('/api/achievements')).data.achievements.length, count - 1);
  await srv.api(`/api/trash/${r.data.trashId}/restore`, { method: 'POST' });
  const back = (await srv.api('/api/achievements')).data.achievements.find((a) => a.id === trip.id);
  assert.ok(back.sticker && exists(path.join(srv.dataDir, 'achievement', trip.id, back.sticker)));
});
