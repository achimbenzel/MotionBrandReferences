// Color conversion utilities.
//
// Hex <-> RGB <-> CMYK are computed algorithmically (CMYK is a device-neutral
// naive conversion, which is the standard approximation). Pantone has no exact
// formula to/from other spaces, so it is handled by nearest-match against a
// bundled table (see pantone.js) and always labelled "approx.".
import { PANTONE, nearestPantone as _nearestPantone } from './pantone.js';

export const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

// --- Hex <-> RGB -----------------------------------------------------------
export function hexToRgb(hex) {
  if (!hex) return null;
  let h = String(hex).trim().replace(/^#/, '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

export function rgbToHex({ r, g, b }) {
  const to = (n) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`.toUpperCase();
}

// --- RGB <-> CMYK ----------------------------------------------------------
export function rgbToCmyk({ r, g, b }) {
  const rr = r / 255, gg = g / 255, bb = b / 255;
  const k = 1 - Math.max(rr, gg, bb);
  if (k >= 1) return { c: 0, m: 0, y: 0, k: 100 };
  const c = (1 - rr - k) / (1 - k);
  const m = (1 - gg - k) / (1 - k);
  const y = (1 - bb - k) / (1 - k);
  return {
    c: Math.round(c * 100),
    m: Math.round(m * 100),
    y: Math.round(y * 100),
    k: Math.round(k * 100),
  };
}

export function cmykToRgb({ c, m, y, k }) {
  const cc = c / 100, mm = m / 100, yy = y / 100, kk = k / 100;
  return {
    r: Math.round(255 * (1 - cc) * (1 - kk)),
    g: Math.round(255 * (1 - mm) * (1 - kk)),
    b: Math.round(255 * (1 - yy) * (1 - kk)),
  };
}

// --- RGB -> Lab (for perceptual nearest-match) -----------------------------
export function rgbToLab({ r, g, b }) {
  let [rr, gg, bb] = [r, g, b].map((v) => {
    v /= 255;
    return v > 0.04045 ? ((v + 0.055) / 1.055) ** 2.4 : v / 12.92;
  });
  // sRGB D65 -> XYZ
  let x = (rr * 0.4124 + gg * 0.3576 + bb * 0.1805) / 0.95047;
  let y = (rr * 0.2126 + gg * 0.7152 + bb * 0.0722) / 1.0;
  let z = (rr * 0.0193 + gg * 0.1192 + bb * 0.9505) / 1.08883;
  [x, y, z] = [x, y, z].map((v) => (v > 0.008856 ? Math.cbrt(v) : 7.787 * v + 16 / 116));
  return { L: 116 * y - 16, a: 500 * (x - y), b: 200 * (y - z) };
}

export function deltaE(lab1, lab2) {
  return Math.sqrt(
    (lab1.L - lab2.L) ** 2 + (lab1.a - lab2.a) ** 2 + (lab1.b - lab2.b) ** 2,
  );
}

export { PANTONE };
export const nearestPantone = _nearestPantone;

// --- Parsers for free-form user input --------------------------------------
export function parseRgbString(str) {
  const m = String(str).match(/(\d+)\D+(\d+)\D+(\d+)/);
  if (!m) return null;
  const r = clamp(+m[1], 0, 255), g = clamp(+m[2], 0, 255), b = clamp(+m[3], 0, 255);
  return { r, g, b };
}

export function parseCmykString(str) {
  const m = String(str).match(/(\d+)\D+(\d+)\D+(\d+)\D+(\d+)/);
  if (!m) return null;
  return {
    c: clamp(+m[1], 0, 100),
    m: clamp(+m[2], 0, 100),
    y: clamp(+m[3], 0, 100),
    k: clamp(+m[4], 0, 100),
  };
}

/**
 * Take a color entered in ONE space and expand it to every representation.
 * `space` is one of: 'hex' | 'rgb' | 'cmyk' | 'pantone'.
 * Returns a normalized color object (or null if the input can't be parsed).
 */
export function expandColor(space, value) {
  let rgb = null;
  let pantoneExact = null;

  if (space === 'hex') {
    rgb = hexToRgb(value);
  } else if (space === 'rgb') {
    rgb = typeof value === 'object' ? value : parseRgbString(value);
  } else if (space === 'cmyk') {
    const cmyk = typeof value === 'object' ? value : parseCmykString(value);
    if (cmyk) rgb = cmykToRgb(cmyk);
  } else if (space === 'pantone') {
    const match = PANTONE.find(
      (p) => p.code.toLowerCase() === String(value).trim().toLowerCase() ||
             p.code.toLowerCase() === `pantone ${String(value).trim().toLowerCase()}`,
    );
    if (match) { rgb = hexToRgb(match.hex); pantoneExact = match.code; }
  }

  if (!rgb) return null;
  const hex = rgbToHex(rgb);
  const cmyk = rgbToCmyk(rgb);
  const nearest = nearestPantone(rgb);
  return {
    source: space,
    hex,
    rgb,
    cmyk,
    // If the user typed a real Pantone we keep it exact; otherwise we show the
    // nearest match and flag it approximate.
    pantone: pantoneExact || (nearest ? nearest.code : ''),
    pantoneApprox: !pantoneExact && !!nearest,
    pantoneName: pantoneExact ? null : nearest?.name || null,
  };
}

export const rgbString = ({ r, g, b }) => `rgb(${r}, ${g}, ${b})`;
export const cmykString = ({ c, m, y, k }) => `C${c} M${m} Y${y} K${k}`;

// Choose readable text color for a given background.
export function readableText(rgb) {
  if (!rgb) return '#fff';
  const { r, g, b } = rgb;
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6 ? '#111' : '#fff';
}
