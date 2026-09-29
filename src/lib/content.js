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

// ---- Per platform: its own text, else caption + hashtags ----------------------
/** The text as it goes out on one platform: its own (if written), else caption + hashtags. */
export const textFor = (c, p) => (p && c.captions?.[p]?.trim() ? c.captions[p] : fullText(c));
export const ownText = (c, p) => !!(p && c.captions?.[p]?.trim());
/** A thread on X: the posts, separated by a line of three dashes. */
export const threadParts = (s) => String(s || '').split(/\n\s*-{3,}\s*\n/).map((t) => t.trim()).filter(Boolean);

// ---- The cover -----------------------------------------------------------------
/** The picture / video the post is shown with: the one picked as cover, else the first. */
export const coverOf = (c) => c.media?.find((m) => m.id === c.coverId) || c.media?.[0] || null;
/** What plays in a Reel / TikTok preview: the first video, else the cover. */
export const clipOf = (c) => c.media?.find((m) => m.kind === 'video') || coverOf(c);

// A typographic cover for posts without a picture: the title on a gradient
// from its colour (or one picked from its id, so it stays the same).
const AUTO = {
  red: ['#ff5f6d', '#6a1b2a'], orange: ['#ff9a44', '#6b2c12'], yellow: ['#f7d046', '#7a4a0c'], green: ['#34d399', '#0d3b33'],
  blue: ['#4facfe', '#1b2a6b'], purple: ['#a78bfa', '#2e1760'], pink: ['#ff7eb3', '#5c1a45'], gray: ['#9aa0ad', '#2a2d35'],
};
const AUTO_KEYS = ['purple', 'blue', 'pink', 'orange', 'green', 'red'];
const hash = (s) => [...String(s || '')].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);
export const autoCoverColors = (c) => AUTO[c.color] || AUTO[AUTO_KEYS[hash(c.id) % AUTO_KEYS.length]];

// ---- Script: the beats of a Reel / Short ---------------------------------------
export const BEAT_KINDS = {
  hook: { label: 'Hook', color: '#f472b6', hint: 'The first 1–3 seconds: why stay?' },
  body: { label: 'Body', color: '#a78bfa', hint: 'What you show — one idea per beat' },
  cta: { label: 'CTA', color: '#34d399', hint: 'Follow, save, comment …' },
};
export const REEL_LENGTHS = [
  { max: 15, label: 'short — loops well' },
  { max: 35, label: 'sweet spot for Reels' },
  { max: 60, label: 'needs a strong middle' },
  { max: 90, label: 'Reels up to 90 s get pushed less' },
  { max: Infinity, label: 'long — TikTok / YouTube' },
];
export const lengthNote = (sec) => REEL_LENGTHS.find((l) => sec <= l.max)?.label || '';
/** 0–2 s, 58 s–1:04 */
export const fmtSpan = (a, b) => (b < 60 ? `${fmtSec(a).replace(' s', '')}–${fmtSec(b)}` : `${fmtSec(a)}–${fmtSec(b)}`);
export const fmtSec = (s) => {
  const v = Math.round((s || 0) * 10) / 10;
  if (v < 60) return `${v % 1 ? v.toFixed(1) : v} s`;
  return `${Math.floor(v / 60)}:${String(Math.round(v % 60)).padStart(2, '0')}`;
};

// ---- Production: the checklist, by format --------------------------------------
const VIDEO_CHECKS = [
  { key: 'footage', label: 'Footage / animation done' },
  { key: 'edit', label: 'Edited to the beat' },
  { key: 'sound', label: 'Music / sound picked' },
  { key: 'subtitles', label: 'Subtitles / on-screen text' },
  { key: 'safe', label: 'Text inside the safe zone' },
  { key: 'cover', label: 'Cover picture' },
  { key: 'export', label: 'Exported (1080 × 1920)' },
];
export const CHECKLISTS = {
  reel: VIDEO_CHECKS,
  story: [{ key: 'footage', label: 'Pictures / clips ready' }, { key: 'safe', label: 'Text inside the safe zone' }, { key: 'sticker', label: 'Sticker / link / poll' }, { key: 'export', label: 'Exported (1080 × 1920)' }],
  video: [{ key: 'footage', label: 'Footage / animation done' }, { key: 'edit', label: 'Edited' }, { key: 'sound', label: 'Sound mixed' }, { key: 'subtitles', label: 'Subtitles' }, { key: 'cover', label: 'Thumbnail' }, { key: 'export', label: 'Exported (1920 × 1080)' }],
  post: [{ key: 'visual', label: 'Picture / design done' }, { key: 'crop', label: 'Cropped to 4:5' }, { key: 'alt', label: 'Alt text' }],
  carousel: [{ key: 'slides', label: 'All slides designed' }, { key: 'first', label: 'First slide hooks' }, { key: 'last', label: 'Last slide: call to action' }, { key: 'crop', label: 'Same size (4:5)' }],
  text: [{ key: 'proofread', label: 'Proofread' }, { key: 'visual', label: 'Picture / video attached' }, { key: 'link', label: 'Link in a reply, not the post' }],
  thread: [{ key: 'proofread', label: 'Proofread' }, { key: 'first', label: 'First post stands alone' }, { key: 'visual', label: 'Pictures on key posts' }, { key: 'last', label: 'Last post: call to action' }],
};
export const checklistFor = (format) => CHECKLISTS[format] || VIDEO_CHECKS;
