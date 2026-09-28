// Achievements: rarities (and the XP each is worth), your rank, and the
// numbers (yours to type in) an achievement can unlock by itself.

export const RARITIES = {
  stone: { label: 'Stone', xp: 10, color: '#8a8a92' },
  bronze: { label: 'Bronze', xp: 25, color: '#b98655' },
  silver: { label: 'Silver', xp: 50, color: '#c9ccd3' },
  gold: { label: 'Gold', xp: 100, color: '#f0b64a' },
  emerald: { label: 'Emerald', xp: 200, color: '#2fcaa9' },
  diamond: { label: 'Diamond', xp: 400, color: '#6cc8f2' },
  mythic: { label: 'Mythic', xp: 800, color: '#9b7dff' },
  quest: { label: 'Quest', xp: 150, color: '#2aa6b5' },
  dream: { label: 'Dream quest', xp: 300, color: '#e0b95a' },
};
export const RARITY_ORDER = Object.keys(RARITIES);
/** The rarities that shimmer once reached: holo foil (paper, frame and badge ring) — and a shining frame from Silver up. */
export const HOLO = new Set(['diamond', 'mythic', 'quest', 'dream']);
export const SHINE = new Set(['silver', 'gold', 'emerald']);
export const xpOf = (a) => (a.achievedAt ? RARITIES[a.rarity]?.xp || 0 : 0);

// Your rank: Stone 1–3, Bronze 1–3 … Mythic 1–3. Rank i (0 = Stone 1) starts
// at 50·i·(i+1) XP: Stone 2 at 100, Stone 3 at 300, Bronze 1 at 600 … Mythic 3 at 21,000.
export const RANK_TIERS = ['stone', 'bronze', 'silver', 'gold', 'emerald', 'diamond', 'mythic'];
const RANKS = RANK_TIERS.length * 3;
const rankStart = (i) => 50 * i * (i + 1);
const rankAt = (i) => {
  const tier = RANK_TIERS[Math.floor(i / 3)];
  const div = (i % 3) + 1;
  return { index: i, tier, div, label: `${RARITIES[tier].label} ${div}` };
};
export function rankOf(xp) {
  let i = 0;
  while (i < RANKS - 1 && rankStart(i + 1) <= xp) i += 1;
  const top = i === RANKS - 1;
  const from = rankStart(i);
  const to = top ? from : rankStart(i + 1);
  return { ...rankAt(i), from, to, top, next: top ? null : rankAt(i + 1), progress: top ? 1 : (xp - from) / (to - from) };
}

export const METRICS = {
  'followers:instagram': { label: 'Instagram followers', short: 'Instagram', follower: 'instagram', group: 'Instagram', title: '{n} Follower auf Instagram' },
  'followers:tiktok': { label: 'TikTok followers', short: 'TikTok', follower: 'tiktok', group: 'TikTok', title: '{n} Follower auf TikTok' },
  'followers:x': { label: 'X followers', short: 'X', follower: 'x', group: 'X', title: '{n} Follower auf X' },
  'followers:youtube': { label: 'YouTube subscribers', short: 'YouTube', follower: 'youtube', group: 'YouTube', title: '{n} Abonnenten auf YouTube' },
  deal: { label: 'Biggest single deal', short: 'Biggest deal', unit: '€', group: 'Umsatz', title: 'Der {N}-Deal' },
  revenue: { label: 'Revenue (all together)', short: 'Revenue', unit: '€', group: 'Umsatz gesamt', title: '{N} Umsatz' },
  clients: { label: 'Clients (people / companies you worked for)', short: 'Clients', group: 'Kundenstamm', title: '{n} Kunden' },
  projects: { label: 'Client projects (done)', short: 'Client projects', group: 'Projekte', title: '{n} Kundenprojekte' },
  posts: { label: 'Posts published', short: 'Posts', group: 'Content', title: '{n} Posts' },
};
export const FOLLOWER_METRICS = ['followers:instagram', 'followers:tiktok', 'followers:x', 'followers:youtube'];
export const WORK_METRICS = ['deal', 'revenue', 'clients', 'projects', 'posts'];
/** Steps a new series starts with (you change them). */
export const SERIES_STEPS = {
  follower: [100, 500, 1000, 2000, 5000, 10000, 50000, 100000],
  deal: [500, 1000, 3000, 5000, 10000, 25000, 50000, 100000],
  revenue: [1000, 10000, 25000, 50000, 100000, 250000, 500000, 1000000],
  clients: [1, 5, 10, 25, 50, 100],
  projects: [1, 10, 25, 50, 100, 250, 500],
  posts: [1, 10, 50, 100, 250, 500],
};
export const seriesSteps = (metric) => SERIES_STEPS[METRICS[metric]?.follower ? 'follower' : metric] || [1, 10, 100];

/** 950 → '950', 1000 → '1K', 2500 → '2.5K', 1000000 → '1M'. */
export const shortNum = (n) => {
  const v = Number(n) || 0;
  const f = (x) => String(Math.round(x * 10) / 10).replace(/\.0$/, '');
  return v >= 1e6 ? `${f(v / 1e6)}M` : v >= 1e3 ? `${f(v / 1e3)}K` : String(Math.round(v));
};
export const fmtValue = (metric, n) => {
  if (n == null) return '';
  const s = Math.round(n).toLocaleString();
  return METRICS[metric]?.unit ? `${s} ${METRICS[metric].unit}` : s;
};
/** How far a locked achievement with a number is: 0–1 (null without one). */
export const progressOf = (a, metrics) => (a.achievedAt || !a.metric || !a.target ? null : Math.min(1, (metrics?.[a.metric] || 0) / a.target));
/** The locked ones with a number that `value` reaches for `metric`. */
export const wouldUnlock = (list, metric, value) => list.filter((a) => !a.achievedAt && a.metric === metric && a.target != null && value >= a.target);
/** The next milestone on a number (the smallest target not reached yet). */
export const nextOn = (list, metric) => list.filter((a) => !a.achievedAt && a.metric === metric && a.target != null).sort((x, y) => x.target - y.target)[0] || null;
export const fmtDate = (iso) => {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { day: '2-digit', month: '2-digit', year: 'numeric' });
};
