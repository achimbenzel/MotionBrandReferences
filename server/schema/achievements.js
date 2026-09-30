// Achievements and your numbers.
// Part of the record shapes (see ../schema.js, which re-exports all of it).
import { nanoid } from 'nanoid';
import { ID, isDay, num, str } from './base.js';

// ---------------------------------------------------------------------------
// Achievements — milestones you reach, with a rarity (→ XP). Some unlock by
// themselves from a number the app knows (biggest deal, clients, delivered
// projects, posts) or one you keep up to date (followers).
// ---------------------------------------------------------------------------
export const RARITIES = ['stone', 'bronze', 'silver', 'gold', 'emerald', 'diamond', 'mythic', 'quest', 'dream'];
export const ACHIEVEMENT_METRICS = ['deal', 'revenue', 'clients', 'projects', 'posts', 'followers:instagram', 'followers:tiktok', 'followers:x', 'followers:youtube'];
const achFile = (v) => (typeof v === 'string' && /^[\w.-]{1,120}$/.test(v) && !v.startsWith('.') ? v : null);
export function normalizeAchievement(a) {
  const icon = a?.icon && typeof a.icon === 'object' ? a.icon : {};
  const metric = ACHIEVEMENT_METRICS.includes(a?.metric) ? a.metric : null;
  return {
    id: typeof a?.id === 'string' && ID.test(a.id) ? a.id : nanoid(10),
    group: str(a?.group, 60).trim() || 'Achievements',
    title: str(a?.title, 120),
    description: str(a?.description, 600),
    rarity: RARITIES.includes(a?.rarity) ? a.rarity : 'stone',
    icon: { type: ['text', 'symbol', 'image'].includes(icon.type) ? icon.type : 'text', text: str(icon.text, 8), symbol: str(icon.symbol, 40) },
    iconImage: achFile(a?.iconImage),   // icon.type 'image'
    sticker: achFile(a?.sticker),       // a small picture on the card (an event's logo …)
    metric,
    target: metric ? num(a?.target, 0, 1e12, null) : null,
    achievedAt: isDay(a?.achievedAt) ? a.achievedAt : '',
    order: num(a?.order, -1e9, 1e9, 0),
    createdAt: num(a?.createdAt, 0, 1e14, 0),
    updatedAt: num(a?.updatedAt, 0, 1e14, 0),
  };
}
/** The numbers you keep yourself: followers per platform, and what you did before using the app. */
export function normalizeAchievementStats(s) {
  const o = s && typeof s === 'object' ? s : {};
  const n = (v) => Math.round(num(v, 0, 1e12, 0));
  const f = o.followers && typeof o.followers === 'object' ? o.followers : {};
  // Your numbers, all typed in by you (`earlier` is their older name — then only "before the app").
  const e = o.numbers && typeof o.numbers === 'object' ? o.numbers : o.earlier && typeof o.earlier === 'object' ? o.earlier : {};
  return {
    followers: { instagram: n(f.instagram), tiktok: n(f.tiktok), x: n(f.x), youtube: n(f.youtube) },
    numbers: { deal: n(e.deal), revenue: n(e.revenue), clients: n(e.clients), projects: n(e.projects), posts: n(e.posts) },
  };
}
