// Achievements (Work mode) — milestones with a rarity: added by you, or
// unlocked by themselves when a number is reached (see ../achievements.js).
import path from 'node:path';
import { nanoid } from 'nanoid';
import { DATA_DIR, TRASH_DIR } from '../config.js';
import { readDB, mutateDB } from '../db.js';
import { replaceImage, safeRm } from '../files.js';
import { trashFiles } from '../trashMoves.js';
import { upload } from '../upload.js';
import { normalizeAchievement, normalizeAchievementStats, str, isDay, RARITIES, ACHIEVEMENT_METRICS } from '../schema.js';
import { createRouter, HttpError } from '../http.js';
import { sourceAsUpload, IMAGE_EXT } from '../sources.js';
import { achievementMetrics, unlockReached, dueToUnlock, SPECIAL_QUESTS, QUEST_IDEAS } from '../achievements.js';

const router = createRouter();
export default router;

export const achievementDir = (id) => path.join(DATA_DIR, 'achievement', id);
const SLOTS = { icon: 'iconImage', sticker: 'sticker' };
// Groups in the order they came in, each by its own order.
const sorted = (list) => {
  const rank = new Map();
  for (const a of list) if (!rank.has(a.group)) rank.set(a.group, rank.size);
  return [...list].sort((a, b) => rank.get(a.group) - rank.get(b.group) || a.order - b.order || (a.createdAt || 0) - (b.createdAt || 0));
};
const payload = (db, unlocked = []) => ({
  achievements: sorted(db.achievements),
  stats: db.achievementStats, metrics: achievementMetrics(db), unlocked, pack: SPECIAL_QUESTS, ideas: QUEST_IDEAS,
});

// Everything — and whatever has been reached meanwhile unlocks now (`unlocked`: their ids).
router.get('/api/achievements', async (_req, res) => {
  let db = await readDB();
  let unlocked = [];
  if (dueToUnlock(db)) {
    unlocked = await mutateDB((d) => unlockReached(d));
    db = await readDB();
  }
  res.json(payload(db, unlocked));
});

// Only what the body brings.
function apply(a, b) {
  if ('group' in b) a.group = str(b.group, 60).trim() || 'Achievements';
  if ('title' in b) a.title = str(b.title, 120);
  if ('description' in b) a.description = str(b.description, 600);
  if ('rarity' in b && RARITIES.includes(b.rarity)) a.rarity = b.rarity;
  if ('icon' in b && b.icon && typeof b.icon === 'object') a.icon = normalizeAchievement({ icon: { ...a.icon, ...b.icon } }).icon;
  if ('metric' in b) a.metric = ACHIEVEMENT_METRICS.includes(b.metric) ? b.metric : null;
  if ('target' in b || 'metric' in b) a.target = a.metric ? normalizeAchievement({ metric: a.metric, target: 'target' in b ? b.target : a.target }).target : null;
  if ('achievedAt' in b) a.achievedAt = isDay(b.achievedAt) ? b.achievedAt : '';
  if ('order' in b && Number.isFinite(Number(b.order))) a.order = Number(b.order);
}

router.post('/api/achievements', async (req, res) => {
  const out = await mutateDB((db) => {
    const now = Date.now();
    const a = normalizeAchievement({ id: nanoid(10), createdAt: now, updatedAt: now });
    apply(a, req.body || {});
    if (!('order' in (req.body || {}))) a.order = Math.max(0, ...db.achievements.filter((x) => x.group === a.group).map((x) => x.order + 1));
    db.achievements.push(a);
    return { achievement: a, unlocked: unlockReached(db) };
  });
  res.status(201).json(out);
});

router.patch('/api/achievements/:id', async (req, res) => {
  const out = await mutateDB((db) => {
    const a = db.achievements.find((x) => x.id === req.params.id);
    if (!a) return null;
    apply(a, req.body || {});
    a.updatedAt = Date.now();
    return { achievement: a, unlocked: unlockReached(db) };
  });
  if (!out) return res.status(404).json({ error: 'not_found' });
  res.json(out);
});

// The icon picture or the sticker: an upload, or a picture that's already in the app ({ source }).
router.post('/api/achievements/:id/image', upload.single('image'), async (req, res) => {
  const field = SLOTS[req.query.slot] || 'iconImage';
  await sourceAsUpload(req);
  const f = req.file;
  if (!f || !(IMAGE_EXT.test(f.originalname) || (f.mimetype || '').startsWith('image/'))) throw new HttpError(400, 'file_required', 'Pick a picture.');
  const db = await readDB();
  const a = db.achievements.find((x) => x.id === req.params.id);
  if (!a) return res.status(404).json({ error: 'not_found' });
  const stored = await replaceImage(achievementDir(a.id), f.path, field === 'sticker' ? 'sticker' : 'icon', f.originalname, a[field], '.png');
  const achievement = await mutateDB((d) => {
    const x = d.achievements.find((y) => y.id === a.id);
    if (!x) return null;
    x[field] = stored;
    if (field === 'iconImage') x.icon = { ...x.icon, type: 'image' };
    x.updatedAt = Date.now();
    return x;
  });
  if (!achievement) return res.status(404).json({ error: 'not_found' });
  res.json({ achievement });
});
router.delete('/api/achievements/:id/image', async (req, res) => {
  const field = SLOTS[req.query.slot] || 'iconImage';
  let file = null;
  const achievement = await mutateDB((db) => {
    const x = db.achievements.find((y) => y.id === req.params.id);
    if (!x) return null;
    file = x[field]; x[field] = null;
    if (field === 'iconImage' && x.icon.type === 'image') x.icon = { ...x.icon, type: x.icon.symbol ? 'symbol' : 'text' };
    x.updatedAt = Date.now();
    return x;
  });
  if (!achievement) return res.status(404).json({ error: 'not_found' });
  if (file) await safeRm(path.join(achievementDir(achievement.id), file), { force: true }).catch(() => {});
  res.json({ achievement });
});

// An achievement → Trash (with its pictures).
router.delete('/api/achievements/:id', async (req, res) => {
  const trashId = nanoid(10);
  const found = await mutateDB((db) => {
    const i = db.achievements.findIndex((x) => x.id === req.params.id);
    if (i === -1) return false;
    const [a] = db.achievements.splice(i, 1);
    db.trash.unshift({ trashId, kind: 'achievement', deletedAt: Date.now(), data: a });
    return true;
  });
  if (!found) return res.status(404).json({ error: 'not_found' });
  await trashFiles(trashId, [{ from: achievementDir(req.params.id), to: path.join(TRASH_DIR, trashId) }]);
  res.json({ ok: true, trashId });
});

// Your numbers: followers per platform, deals, revenue, clients, client projects, posts.
router.patch('/api/achievement-stats', async (req, res) => {
  const out = await mutateDB((db) => {
    const cur = db.achievementStats;
    const b = req.body || {};
    db.achievementStats = normalizeAchievementStats({
      followers: { ...cur.followers, ...(b.followers && typeof b.followers === 'object' ? b.followers : {}) },
      numbers: { ...cur.numbers, ...(b.earlier && typeof b.earlier === 'object' ? b.earlier : {}), ...(b.numbers && typeof b.numbers === 'object' ? b.numbers : {}) },
    });
    return unlockReached(db);
  });
  res.json(payload(await readDB(), out));
});

// Several at once — a series of milestones on one number (100, 500, 1K … followers).
router.post('/api/achievements/batch', async (req, res) => {
  const items = Array.isArray(req.body?.items) ? req.body.items.filter((x) => x && typeof x === 'object').slice(0, 50) : [];
  if (!items.length) throw new HttpError(400, 'items_required', 'Nothing to add.');
  const out = await mutateDB((db) => {
    const now = Date.now();
    const next = {};
    for (const b of items) {
      const a = normalizeAchievement({ id: nanoid(10), createdAt: now, updatedAt: now });
      apply(a, b);
      if (!('order' in b)) {
        next[a.group] ??= Math.max(0, ...db.achievements.filter((x) => x.group === a.group).map((x) => x.order + 1));
        a.order = next[a.group]++;
      }
      db.achievements.push(a);
    }
    return unlockReached(db);
  });
  res.status(201).json({ ...payload(await readDB(), out), added: items.length });
});

// When they were reached — for several unlocked at once by one number ({ dates: { id: 'YYYY-MM-DD' } }).
router.post('/api/achievements/dates', async (req, res) => {
  const dates = req.body?.dates && typeof req.body.dates === 'object' ? req.body.dates : {};
  const changed = await mutateDB((db) => {
    let n = 0;
    for (const a of db.achievements) {
      if (!(a.id in dates) || !a.achievedAt || !isDay(dates[a.id])) continue; // only reached ones get a date
      a.achievedAt = dates[a.id];
      a.updatedAt = Date.now();
      n += 1;
    }
    return n;
  });
  res.json({ ...payload(await readDB()), changed });
});

// Cards in a new order — within a group, or moved into another one: `ids` are the group's cards in order.
router.post('/api/achievements/arrange', async (req, res) => {
  const group = str(req.body?.group, 60).trim();
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.filter((x) => typeof x === 'string') : [];
  if (!group || !ids.length) throw new HttpError(400, 'bad_request', 'A group and its cards are needed.');
  await mutateDB((db) => {
    const now = Date.now();
    const rest = db.achievements.filter((a) => a.group === group && !ids.includes(a.id)).sort((a, b) => a.order - b.order);
    ids.forEach((id, i) => {
      const a = db.achievements.find((x) => x.id === id);
      if (!a) return;
      if (a.group !== group) { a.group = group; a.updatedAt = now; }
      a.order = i;
    });
    rest.forEach((a, k) => { a.order = ids.length + k; }); // the group's others after, as they were
  });
  res.json(payload(await readDB()));
});

// A group renamed (into another one's name: the two become one).
router.post('/api/achievements/group', async (req, res) => {
  const from = str(req.body?.from, 60);
  const to = str(req.body?.to, 60).trim();
  if (!to) throw new HttpError(400, 'name_required', 'The group needs a name.');
  const n = await mutateDB((db) => {
    const now = Date.now();
    let count = 0;
    const offset = Math.max(0, ...db.achievements.filter((a) => a.group === to).map((a) => a.order + 1));
    for (const a of db.achievements) {
      if (a.group !== from || from === to) continue;
      a.group = to; a.order += offset; a.updatedAt = now; count += 1;
    }
    return count;
  });
  if (!n && from !== to) return res.status(404).json({ error: 'not_found' });
  res.json(payload(await readDB()));
});

// The groups in a new order (the order they're shown in).
router.post('/api/achievements/group-order', async (req, res) => {
  const groups = Array.isArray(req.body?.groups) ? req.body.groups.map((g) => str(g, 60)) : [];
  await mutateDB((db) => {
    const rank = new Map(groups.map((g, i) => [g, i]));
    const first = new Map();
    db.achievements.forEach((a, i) => { if (!first.has(a.group)) first.set(a.group, i); });
    const key = (a) => (rank.has(a.group) ? rank.get(a.group) : groups.length + first.get(a.group) / 1e6);
    db.achievements = db.achievements.map((a, i) => ({ a, i })).sort((x, y) => key(x.a) - key(y.a) || x.i - y.i).map((x) => x.a);
  });
  res.json(payload(await readDB()));
});

// The Special Quests pack — the ones you don't have yet (same group, title and description).
router.post('/api/achievements/starter', async (_req, res) => {
  const out = await mutateDB((db) => {
    const key = (a) => `${a.group}\n${a.title}\n${a.description}`;
    const have = new Set(db.achievements.map(key));
    let added = 0;
    for (const q of SPECIAL_QUESTS) {
      const a = normalizeAchievement({ ...q, id: nanoid(10), createdAt: Date.now(), updatedAt: Date.now() });
      if (have.has(key(a))) continue;
      db.achievements.push(a);
      added += 1;
    }
    return { added, unlocked: unlockReached(db) };
  });
  res.status(201).json({ ...payload(await readDB(), out.unlocked), added: out.added });
});
