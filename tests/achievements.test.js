// Achievements: your own, a series at once, unlocking by the numbers (biggest
// deal, followers, clients, delivered projects, posts), pictures, Trash and back.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { startServer, tempDir, exists } from './helpers.js';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
let srv;
before(async () => { srv = await startServer({ dataDir: await tempDir() }); });
after(async () => { await srv?.stop(); });

test('achievements: own ones, a series, unlocking by the numbers', async () => {
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

  // A series on one number, in one go: Instagram followers 100 … 5K, each its own rarity.
  const K = (n) => (n >= 1000 ? `${n / 1000}K` : String(n));
  const series = (group, metric, steps, title) => steps.map(([n, rarity]) => ({ group, metric, target: n, rarity, title: title(n), icon: { type: 'text', text: K(n) } }));
  r = await srv.api('/api/achievements/batch', { method: 'POST', json: { items: series('Instagram', 'followers:instagram', [[100, 'stone'], [500, 'bronze'], [1000, 'silver'], [2000, 'gold'], [5000, 'emerald']], (n) => `${K(n)} Follower`) } });
  assert.equal(r.status, 201);
  assert.equal(r.data.added, 5);
  const ig = r.data.achievements.filter((a) => a.group === 'Instagram');
  assert.deepEqual(ig.map((a) => [a.title, a.order, a.rarity]), [['100 Follower', 0, 'stone'], ['500 Follower', 1, 'bronze'], ['1K Follower', 2, 'silver'], ['2K Follower', 3, 'gold'], ['5K Follower', 4, 'emerald']]);
  assert.equal((await srv.api('/api/achievements/batch', { method: 'POST', json: { items: [] } })).status, 400);
  await srv.api('/api/achievements/batch', { method: 'POST', json: { items: [
    ...series('Umsatz', 'deal', [[1000, 'stone'], [3000, 'bronze'], [5000, 'silver']], (n) => `Der ${K(n)}€-Deal`),
    ...series('Kunden', 'clients', [[1, 'stone'], [3, 'bronze']], (n) => `${n} Kunden`),
    ...series('Projekte', 'projects', [[1, 'stone'], [100, 'mythic']], (n) => `${n} Projekte`),
    ...series('Content', 'posts', [[1, 'stone']], () => 'Der erste Post'),
  ] } });
  const count = (await srv.api('/api/achievements')).data.achievements.length;
  assert.equal(count, 1 + 5 + 8);

  // Followers you keep up to date: 2,900 unlocks everything up to 2K today (5K not yet);
  // reached ones stay reached.
  r = await srv.api('/api/achievement-stats', { method: 'PATCH', json: { followers: { instagram: 2900 }, earlier: { projects: 95 } } });
  const got = (t) => r.data.achievements.find((a) => a.title === t).achievedAt;
  assert.deepEqual(['100 Follower', '500 Follower', '1K Follower', '2K Follower', '5K Follower'].map(got), [today(), today(), today(), today(), '']);
  assert.equal(r.data.unlocked.length, 5); // …and the first client project (95 before the app)
  assert.equal(r.data.metrics['followers:instagram'], 2900);
  r = await srv.api('/api/achievement-stats', { method: 'PATCH', json: { followers: { instagram: 10 } } });
  assert.equal(got('2K Follower'), today());

  // Clients and client projects are counted apart: 95 projects before the app + a delivered one.
  const client = (await srv.api('/api/clients', { method: 'POST', json: { name: 'Acme' } })).data.client;
  const fd = new FormData(); fd.append('files', new Blob(['%PDF-1.4'], { type: 'application/pdf' }), 'inv.pdf'); fd.append('amount', '3200');
  await srv.api(`/api/clients/${client.id}/invoices`, { method: 'POST', body: fd });
  const plan = (await srv.api('/api/plans', { method: 'POST', json: { name: 'Reel', clientId: client.id } })).data.plan;
  await srv.api(`/api/plans/${plan.id}`, { method: 'PATCH', json: { status: 'delivered' } });
  r = await srv.api('/api/achievements');
  assert.deepEqual([r.data.metrics.deal, r.data.metrics.clients, r.data.metrics.projects], [3200, 1, 96]);
  assert.deepEqual([r.data.app.deal, r.data.app.clients, r.data.app.projects, r.data.stats.earlier.projects], [3200, 1, 1, 95]); // the parts
  assert.deepEqual(['Der 3K€-Deal', 'Der 5K€-Deal', '1 Kunden', '3 Kunden', '1 Projekte', '100 Projekte'].map(got), [today(), '', today(), '', today(), '']);
  assert.ok(r.data.unlocked.length >= 3);
  assert.deepEqual((await srv.api('/api/achievements')).data.unlocked, []); // only once

  // A posted content item counts too.
  const post = (await srv.api('/api/content', { method: 'POST', json: { title: 'First reel', status: 'posted' } })).data.item;
  assert.equal(post.status, 'posted');
  r = await srv.api('/api/achievements');
  assert.equal(got('Der erste Post'), today());

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
