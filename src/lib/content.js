// Content planning: the platforms, formats and stages a post goes through.

export const PLATFORMS = {
  instagram: { label: 'Instagram', color: '#e1306c', caption: 2200, hashtags: 30, tip: '3–5 focused hashtags work best; max. 30' },
  tiktok: { label: 'TikTok', color: '#ff0050', caption: 4000, tip: 'The first line and on-screen text carry it' },
  x: { label: 'X', color: '#e7e9ea', caption: 280, tip: '280 characters (a thread for more)' },
  youtube: { label: 'YouTube', color: '#ff3b30', caption: 5000, tip: 'Shorts: a title that makes people stay' },
  linkedin: { label: 'LinkedIn', color: '#0a66c2', caption: 3000, tip: 'The first ~200 characters show before “more”' },
};
export const MAIN_PLATFORMS = ['instagram', 'tiktok', 'x'];

export const FORMATS = {
  reel: { label: 'Reel / Short', hint: '9:16 video — first second decides', aspect: '9 / 16' },
  post: { label: 'Post', hint: 'One picture — 4:5 shows biggest in the feed', aspect: '4 / 5' },
  carousel: { label: 'Carousel', hint: 'Up to 20 slides — the first one hooks', aspect: '4 / 5' },
  story: { label: 'Story', hint: '9:16, 24 hours', aspect: '9 / 16' },
  text: { label: 'Text post', hint: 'Words first (X, LinkedIn)', aspect: '16 / 9' },
  thread: { label: 'Thread', hint: 'Several posts in a row (X)', aspect: '16 / 9' },
  video: { label: 'Video', hint: '16:9 — YouTube', aspect: '16 / 9' },
};

export const STATUSES = [
  { key: 'idea', label: 'Ideas', one: 'Idea', color: '#8b93a7' },
  { key: 'script', label: 'Script', one: 'Script', color: '#a78bfa' },
  { key: 'production', label: 'In production', one: 'In production', color: '#fb923c' },
  { key: 'scheduled', label: 'Scheduled', one: 'Scheduled', color: '#38bdf8' },
  { key: 'posted', label: 'Posted', one: 'Posted', color: '#34d399' },
];
export const statusOf = (key) => STATUSES.find((s) => s.key === key) || STATUSES[0];

export const METRICS = [
  { key: 'views', label: 'Views' }, { key: 'likes', label: 'Likes' }, { key: 'comments', label: 'Comments' },
  { key: 'shares', label: 'Shares' }, { key: 'saves', label: 'Saves' }, { key: 'follows', label: 'New followers' },
];

/** '#motion #design, logo' → ['#motion', '#design', '#logo'] */
export const hashtagsOf = (s) => String(s || '').split(/[\s,]+/).map((t) => t.trim()).filter(Boolean).map((t) => (t.startsWith('#') ? t : `#${t}`));
/** The text as it goes out: hook, caption, hashtags. */
export const fullText = (c) => [c.caption?.trim(), hashtagsOf(c.hashtags).join(' ')].filter(Boolean).join('\n\n');
// X counts characters differently from JS (emoji = 2, links = 23) — close enough here: code points.
export const charCount = (s) => [...String(s || '')].length;

export const dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const fmtDay = (iso, opts = { weekday: 'short', day: 'numeric', month: 'short' }) => {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, opts);
};
export const fmtNum = (n) => (n == null ? '—' : n >= 1e6 ? `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M` : n >= 1e4 ? `${Math.round(n / 1e3)}K` : n.toLocaleString());
