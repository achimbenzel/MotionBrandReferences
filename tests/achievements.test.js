// Achievements: your own, a series at once, the Special Quests pack, unlocking
// by the numbers you type in (followers, deals, clients, projects, posts),
// pictures, Trash and back.
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
  assert.equal((await srv.api('/api/achievements')).data.achievements.length, 1 + 5 + 8);

  // The Special Quests pack: quest and dream quest pairs with their descriptions — and not twice.
  r = await srv.api('/api/achievements/starter', { method: 'POST' });
  assert.equal(r.status, 201);
  assert.equal(r.data.added, 12);
  const quests = r.data.achievements.filter((a) => a.group === 'Special Quests');
  assert.equal(quests.length, 13); // + the Dienstreise of your own (no description)
  const album = quests.find((a) => a.title === 'Album Cover Design' && a.rarity === 'dream');
  assert.deepEqual([album.description, album.icon.type, album.icon.symbol], ['Album Cover für Musiker/Band, die ich selber gerne höre.', 'symbol', 'image']);
  assert.equal(quests.find((a) => a.title === 'Dienstreise' && a.rarity === 'quest' && a.description).achievedAt, '2025-07-17');
  assert.equal(r.data.pack.length, 12);
  assert.equal((await srv.api('/api/achievements/starter', { method: 'POST' })).data.added, 0);
  const count = (await srv.api('/api/achievements')).data.achievements.length;

  // Followers you keep up to date: 2,900 unlocks everything up to 2K today (5K not yet);
  // reached ones stay reached.
  r = await srv.api('/api/achievement-stats', { method: 'PATCH', json: { followers: { instagram: 2900 } } });
  const got = (t) => r.data.achievements.find((a) => a.title === t).achievedAt;
  assert.deepEqual(['100 Follower', '500 Follower', '1K Follower', '2K Follower', '5K Follower'].map(got), [today(), today(), today(), today(), '']);
  assert.equal(r.data.unlocked.length, 4);
  assert.equal(r.data.metrics['followers:instagram'], 2900);
  r = await srv.api('/api/achievement-stats', { method: 'PATCH', json: { followers: { instagram: 10 } } });
  assert.equal(got('2K Follower'), today());

  // Nothing is counted from the app: a client, an invoice, a delivered project and a posted
  // post change none of the numbers…
  const client = (await srv.api('/api/clients', { method: 'POST', json: { name: 'Acme' } })).data.client;
  const fd = new FormData(); fd.append('files', new Blob(['%PDF-1.4'], { type: 'application/pdf' }), 'inv.pdf'); fd.append('amount', '3200');
  await srv.api(`/api/clients/${client.id}/invoices`, { method: 'POST', body: fd });
  const plan = (await srv.api('/api/plans', { method: 'POST', json: { name: 'Reel', clientId: client.id } })).data.plan;
  await srv.api(`/api/plans/${plan.id}`, { method: 'PATCH', json: { status: 'delivered' } });
  await srv.api('/api/content', { method: 'POST', json: { title: 'First reel', status: 'posted' } });
  r = await srv.api('/api/achievements');
  assert.deepEqual(['deal', 'revenue', 'clients', 'projects', 'posts'].map((k) => r.data.metrics[k]), [0, 0, 0, 0, 0]);
  assert.deepEqual(r.data.unlocked, []);
  assert.ok(!('app' in r.data));

  // …they're yours to type in: clients and client projects apart.
  r = await srv.api('/api/achievement-stats', { method: 'PATCH', json: { numbers: { deal: 3200, clients: 1, projects: 95, posts: 1 } } });
  assert.deepEqual([r.data.metrics.deal, r.data.metrics.clients, r.data.metrics.projects, r.data.stats.numbers.projects], [3200, 1, 95, 95]);
  assert.deepEqual(['Der 3K€-Deal', 'Der 5K€-Deal', '1 Kunden', '3 Kunden', '1 Projekte', '100 Projekte', 'Der erste Post'].map(got), [today(), '', today(), '', today(), '', today()]);
  assert.equal(r.data.unlocked.length, 5);
  assert.deepEqual((await srv.api('/api/achievements')).data.unlocked, []); // only once
  // (the older name of these numbers still works)
  r = await srv.api('/api/achievement-stats', { method: 'PATCH', json: { earlier: { projects: 99 } } });
  assert.equal(r.data.metrics.projects, 99);

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

test('achievements: numbers saved under their older name carry over', async () => {
  const { normalizeAchievementStats } = await import('../server/schema.js');
  const s = normalizeAchievementStats({ followers: { instagram: 2900 }, earlier: { projects: 95, clients: 12 } });
  assert.deepEqual([s.followers.instagram, s.numbers.projects, s.numbers.clients, s.numbers.deal], [2900, 95, 12, 0]);
  assert.ok(!('earlier' in s));
});

test('achievements: dates for several unlocked at once, cards arranged, groups renamed and reordered', async () => {
  const items = [100, 500, 1000].map((n, i) => ({ group: 'TikTok', metric: 'followers:tiktok', target: n, rarity: 'stone', title: `${n} TikTok`, order: i }));
  let r = await srv.api('/api/achievements/batch', { method: 'POST', json: { items } });
  const tt = r.data.achievements.filter((a) => a.group === 'TikTok');
  // One number unlocks all three (today) — then each gets the day it was really reached.
  r = await srv.api('/api/achievement-stats', { method: 'PATCH', json: { followers: { tiktok: 1200 } } });
  assert.equal(r.data.unlocked.length, 3);
  r = await srv.api('/api/achievements/dates', { method: 'POST', json: { dates: { [tt[0].id]: '2025-03-01', [tt[1].id]: '2025-09-12', [tt[2].id]: 'nope', nope: '2025-01-01' } } });
  const byId = (id) => r.data.achievements.find((a) => a.id === id);
  assert.deepEqual([byId(tt[0].id).achievedAt, byId(tt[1].id).achievedAt, byId(tt[2].id).achievedAt, r.data.changed], ['2025-03-01', '2025-09-12', today(), 2]);

  // A new order in the group; one card moved into another group.
  r = await srv.api('/api/achievements/arrange', { method: 'POST', json: { group: 'TikTok', ids: [tt[2].id, tt[0].id] } });
  assert.deepEqual(r.data.achievements.filter((a) => a.group === 'TikTok').map((a) => a.id), [tt[2].id, tt[0].id, tt[1].id]);
  r = await srv.api('/api/achievements/arrange', { method: 'POST', json: { group: 'Instagram', ids: [tt[1].id, ...r.data.achievements.filter((a) => a.group === 'Instagram').map((a) => a.id)] } });
  assert.equal(r.data.achievements.find((a) => a.id === tt[1].id).group, 'Instagram');
  assert.equal(r.data.achievements.filter((a) => a.group === 'Instagram')[0].id, tt[1].id);
  assert.equal((await srv.api('/api/achievements/arrange', { method: 'POST', json: { group: '', ids: [] } })).status, 400);

  // Renamed; renamed into an existing group → one group, the moved ones after its own.
  r = await srv.api('/api/achievements/group', { method: 'POST', json: { from: 'TikTok', to: 'TikTok Follower' } });
  assert.ok(r.data.achievements.some((a) => a.group === 'TikTok Follower') && !r.data.achievements.some((a) => a.group === 'TikTok'));
  const igBefore = r.data.achievements.filter((a) => a.group === 'Instagram').map((a) => a.id);
  r = await srv.api('/api/achievements/group', { method: 'POST', json: { from: 'TikTok Follower', to: 'Instagram' } });
  const ig = r.data.achievements.filter((a) => a.group === 'Instagram').map((a) => a.id);
  assert.deepEqual(ig.slice(0, igBefore.length), igBefore);
  assert.equal(ig.length, igBefore.length + 2);
  assert.equal((await srv.api('/api/achievements/group', { method: 'POST', json: { from: 'Instagram', to: '  ' } })).status, 400);

  // Groups reordered: the named ones first, in that order.
  const groups = [...new Set(r.data.achievements.map((a) => a.group))];
  r = await srv.api('/api/achievements/group-order', { method: 'POST', json: { groups: [groups[groups.length - 1], groups[0]] } });
  const now = [...new Set(r.data.achievements.map((a) => a.group))];
  assert.deepEqual(now.slice(0, 2), [groups[groups.length - 1], groups[0]]);
  assert.equal(now.length, groups.length);
});
