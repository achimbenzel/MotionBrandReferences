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

// --- Logo display helpers (single image, recolour renditions, bg, scale) ---
// The source image (SVG/PNG). Falls back to older light/dark/assets shapes.
export const logoSource = (project) =>
  project.image || project.logoDark || project.logoLight || project.assets?.[0]?.file || null;
export const logoRenditions = (project) =>
  (Array.isArray(project.renditions) && project.renditions.length ? project.renditions : ['#111114', '#FFFFFF']);
export const logoHasOriginal = (project) => project.original !== false;
export function logoRendition(project) {
  const r = project.rendition;
  if (r === 'original' || (typeof r === 'string' && r.startsWith('#'))) return r;
  return logoHasOriginal(project) ? 'original' : logoRenditions(project)[0];
}
export const logoBg = (project) => project.bg || '#FFFFFF';
export const logoScale = (project) => (typeof project.scale === 'number' ? project.scale : 0.7);
