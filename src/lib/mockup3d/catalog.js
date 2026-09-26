// The built-in devices and their finishes, the picture formats — plain data,
// so pages can list them without loading three.js.
import { Smartphone, Tablet, Laptop, AppWindow, Box, Watch, Monitor, Tv, CreditCard, Frame, Package, Coffee } from 'lucide-react';

export const FRAMES = { '16:9': 16 / 9, '4:5': 4 / 5, '1:1': 1, '9:16': 9 / 16, '3:2': 3 / 2 };
/** Pixel size of a frame format with `long` px on its long side. */
export const exportSize = (frame, long) => {
  const a = FRAMES[frame] || 16 / 9;
  return a >= 1 ? [long, Math.round(long / a)] : [Math.round(long * a), long];
};
export const DEVICE_ICON = { iphone: Smartphone, android: Smartphone, ipad: Tablet, macbook: Laptop, imac: Monitor, watch: Watch, tv: Tv, browser: AppWindow, custom: Box };
export const OBJECT_ICON = { card: CreditCard, poster: Frame, box: Package, mug: Coffee };
/** A device's icon (an object by its type). */
export const itemIcon = (it) => (it?.device === 'object' ? OBJECT_ICON[it.obj?.type] : DEVICE_ICON[it?.device]) || Box;

// Devices that used to be built in: scenes made with them still open (as a
// plain stand-in screen) until one of your own 3D models takes their place.
export const DEVICES = {
  iphone: { label: 'iPhone (old built-in)' },
  android: { label: 'Android phone (old built-in)' },
  ipad: { label: 'iPad (old built-in)' },
  macbook: { label: 'MacBook (old built-in)' },
  watch: { label: 'Apple Watch (old built-in)' },
  imac: { label: 'iMac (old built-in)' },
  tv: { label: 'TV (old built-in)' },
  browser: { label: 'Browser window (old 3D)' },
};

// ---- Branding objects (business card, poster, box, mug) --------------------------------
export const OBJECTS = {
  card: { label: 'Business card', faces: [['front', 'Front'], ['back', 'Back']] },
  poster: { label: 'Poster', faces: [['front', 'Poster']] },
  box: { label: 'Box', faces: [['front', 'Front'], ['side', 'Sides'], ['top', 'Top'], ['back', 'Back']] },
  mug: { label: 'Mug', faces: [['front', 'Print']] },
};
export const CARD_SIZES = {
  eu: { label: '85 × 55 mm', w: 8.5, h: 5.5 },
  us: { label: '3.5 × 2 in', w: 8.89, h: 5.08 },
  square: { label: '65 × 65 mm', w: 6.5, h: 6.5 },
};
export const POSTER_SIZES = {
  a4: { label: 'A4', w: 21, h: 29.7 },
  a3: { label: 'A3', w: 29.7, h: 42 },
  a2: { label: 'A2', w: 42, h: 59.4 },
  a1: { label: 'A1', w: 59.4, h: 84.1 },
  '50x70': { label: '50 × 70', w: 50, h: 70 },
  '18x24': { label: '18 × 24 in', w: 45.72, h: 60.96 },
  '24x36': { label: '24 × 36 in', w: 60.96, h: 91.44 },
};
export const FINISHES = {
  matte: { label: 'Matte', roughness: 0.85, clearcoat: 0 },
  silk: { label: 'Silk', roughness: 0.55, clearcoat: 0.25 },
  gloss: { label: 'Gloss', roughness: 0.32, clearcoat: 1 },
};
export const POSTER_FRAMES = {
  none: { label: 'No frame' },
  black: { label: 'Black', color: '#151516', roughness: 0.55, metalness: 0 },
  white: { label: 'White', color: '#efefec', roughness: 0.5, metalness: 0 },
  oak: { label: 'Oak', color: '#b98c5f', roughness: 0.7, metalness: 0, wood: true },
  alu: { label: 'Aluminium', color: '#c3c6ca', roughness: 0.35, metalness: 1 },
};
export const BOX_MATERIALS = {
  white: { label: 'White card', color: '#f3f2ef' },
  kraft: { label: 'Kraft', color: '#c29b6c' },
  black: { label: 'Black', color: '#1b1b1d' },
};
// Paper / card / mug colours to start from (any colour works).
export const OBJECT_COLORS = ['#F4F2EE', '#FFFFFF', '#EDE6D6', '#C29B6C', '#1B1B1D', '#2E3A59', '#B3261E'];

/** A new object of a type, with sensible settings. */
export function defaultObject(type) {
  const base = { type, size: '', landscape: false, color: '#F4F2EE', color2: '#E9E7E2', finish: 'matte', radius: 0, layout: 'pair', frame: 'black', mat: true, placement: 'wall', w: 12, h: 18, d: 5, material: 'white', wrap: 'front' };
  if (type === 'card') return { ...base, size: 'eu', landscape: true, layout: 'pair', finish: 'matte' };
  if (type === 'poster') return { ...base, size: 'a2', color: '#FFFFFF', color2: '#E9E7E2', placement: 'wall' };
  if (type === 'box') return { ...base, color: '#F3F2EF', finish: 'silk' };
  if (type === 'mug') return { ...base, color: '#FFFFFF', color2: '#FFFFFF', finish: 'gloss', wrap: 'front' };
  return base;
}

