// Shared project-type constants used across the app.

// Tab order requested: Branding, Motion Design, Logos, Business Cards, Colors.
export const TABS = [
  { key: 'branding', label: 'Branding' },
  { key: 'motion', label: 'Motion Design' },
  { key: 'logo', label: 'Logos' },
  { key: 'businesscard', label: 'Business Cards' },
  { key: 'color', label: 'Colors' },
  { key: 'imagegallery', label: 'Image Gallery' },
];

export const TYPE_KEYS = TABS.map((t) => t.key);
export const isType = (t) => TYPE_KEYS.includes(t);

// The two most common business-card sizes (mm), landscape.
export const CARD_SIZES = [
  { key: '85x55', label: '85 × 55 mm', w: 85, h: 55 },
  { key: '89x51', label: '89 × 51 mm', w: 89, h: 51 },
];
export const cardSize = (key) => CARD_SIZES.find((s) => s.key === key) || CARD_SIZES[0];
export const cardSizeAspect = (key) => { const s = cardSize(key); return s.w / s.h; };

// Aspect ratio used when cropping a project's cover thumbnail.
export function coverAspect(type, project) {
  if (type === 'businesscard') return cardSizeAspect(project?.size);
  return 16 / 10;
}

// --- Logo display helpers ---
// A logo has one source image and a list of "renditions" — each a pair of a
// logo colour ('#hex' to recolour the silhouette, or 'original') and a
// background colour, so e.g. black-on-white and white-on-black both switch.
export const logoSource = (project) =>
  project.image || project.logoDark || project.logoLight || project.assets?.[0]?.file || null;
export const logoScale = (project) => (typeof project.scale === 'number' ? project.scale : 0.7);
export const DEFAULT_RENDITIONS = [
  { color: '#111114', bg: '#FFFFFF' },
  { color: '#FFFFFF', bg: '#111114' },
  { color: 'original', bg: '#FFFFFF' },
];
export const sameRendition = (a, b) => !!a && !!b && a.color === b.color && a.bg === b.bg;

export function logoRenditionList(project) {
  const raw = project.renditions;
  if (Array.isArray(raw) && raw.length && typeof raw[0] === 'object' && raw[0]) return raw;
  // Migrate the older shape (array of hex strings + original flag + bg).
  const bg = project.bg || '#FFFFFF';
  const list = (Array.isArray(raw) && raw.length ? raw.map((c) => ({ color: c, bg })) : [
    { color: '#111114', bg: '#FFFFFF' }, { color: '#FFFFFF', bg: '#111114' },
  ]);
  if (project.original !== false && !list.some((e) => e.color === 'original')) list.push({ color: 'original', bg });
  return list;
}
export function logoActive(project) {
  const list = logoRenditionList(project);
  const r = project.rendition;
  if (r && typeof r === 'object' && r.color) return r;
  if (typeof r === 'string') return list.find((e) => e.color === r) || list[0];
  return list[0] || { color: 'original', bg: '#FFFFFF' };
}
