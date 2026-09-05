// Shared project-type constants used across the app.

// Tab order requested: Branding, Motion Design, Logos, Business Cards, Colors.
export const TABS = [
  { key: 'branding', label: 'Branding' },
  { key: 'motion', label: 'Motion Design' },
  { key: 'logo', label: 'Logos' },
  { key: 'businesscard', label: 'Business Cards' },
  { key: 'color', label: 'Colors' },
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

// --- Logo display helpers (light/dark variant, background, scale) ---
export function logoFileFor(project, variant) {
  const v = variant || project.variant;
  const pick = v === 'dark'
    ? (project.logoDark || project.logoLight)
    : (project.logoLight || project.logoDark);
  // Backward-compat: older logos stored a single image under assets[].
  return pick || project.assets?.[0]?.file || null;
}
export const logoBg = (project) => project.bg || '#FFFFFF';
export const logoScale = (project) => (typeof project.scale === 'number' ? project.scale : 0.7);
export const logoVariants = (project) => ({ light: project.logoLight || null, dark: project.logoDark || null });
