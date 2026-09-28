// Achievements: rarities (and the XP each is worth), levels, and the numbers
// an achievement can unlock by itself.

export const RARITIES = {
  stone: { label: 'Stone', xp: 10, color: '#56565c' },
  bronze: { label: 'Bronze', xp: 25, color: '#8c6a47' },
  silver: { label: 'Silver', xp: 50, color: '#b8bac0' },
  gold: { label: 'Gold', xp: 100, color: '#f0b64a' },
  emerald: { label: 'Emerald', xp: 200, color: '#2fcaa9' },
  diamond: { label: 'Diamond', xp: 400, color: '#6cc8f2' },
  mythic: { label: 'Mythic', xp: 800, color: '#7c5cff' },
  quest: { label: 'Quest', xp: 150, color: '#1f7c89' },
  dream: { label: 'Dream quest', xp: 300, color: '#155f6b' },
};
export const RARITY_ORDER = Object.keys(RARITIES);
export const xpOf = (a) => (a.achievedAt ? RARITIES[a.rarity]?.xp || 0 : 0);

// Level L needs 50·L·(L−1) XP in total: 100 for level 2, 300 for 3, 600 for 4 …
export const xpForLevel = (level) => 50 * level * (level - 1);
export function levelOf(xp) {
  let level = 1;
  while (xpForLevel(level + 1) <= xp) level += 1;
  return { level, from: xpForLevel(level), to: xpForLevel(level + 1) };
}
const TITLES = [[1, 'Rookie'], [3, 'Apprentice'], [5, 'Designer'], [8, 'Pro'], [12, 'Expert'], [16, 'Master'], [20, 'Legend']];
export const titleOf = (level) => [...TITLES].reverse().find(([l]) => level >= l)[1];

export const METRICS = {
  deal: { label: 'Biggest single deal', unit: '€', app: 'from your invoices', earlier: 'Biggest deal before the app' },
  revenue: { label: 'Revenue paid', unit: '€', app: 'paid invoices', earlier: 'Revenue before the app' },
  clients: { label: 'Clients', app: 'in the app', earlier: 'Clients before the app' },
  projects: { label: 'Delivered client projects', app: 'delivered / archived with a client', earlier: 'Client projects before the app' },
  posts: { label: 'Posts published', app: 'posted in Content', earlier: 'Posts before the app' },
  'followers:instagram': { label: 'Instagram followers', follower: 'instagram' },
  'followers:tiktok': { label: 'TikTok followers', follower: 'tiktok' },
  'followers:x': { label: 'X followers', follower: 'x' },
  'followers:youtube': { label: 'YouTube subscribers', follower: 'youtube' },
};
export const fmtValue = (metric, n) => {
  if (n == null) return '';
  const s = Math.round(n).toLocaleString();
  return METRICS[metric]?.unit ? `${s} ${METRICS[metric].unit}` : s;
};
/** How far a locked achievement with a number is: 0–1 (null without one). */
export const progressOf = (a, metrics) => (a.achievedAt || !a.metric || !a.target ? null : Math.min(1, (metrics?.[a.metric] || 0) / a.target));
export const fmtDate = (iso) => {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { day: '2-digit', month: '2-digit', year: 'numeric' });
};
