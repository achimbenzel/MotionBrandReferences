// Brand Tester helpers: load a logo and find its visible bounds, recolour it,
// the app-icon squircle, and the test sheet drawn on a canvas (PNG).

const canvasOf = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const loadImage = (url) => new Promise((resolve, reject) => {
  const img = new Image();
  img.onload = () => resolve(img);
  img.onerror = () => reject(new Error('Could not read this image'));
  img.src = url;
});

/**
 * → { img, w, h, box } — `box` is the visible part (non-transparent pixels) as
 * fractions of the image, so clear space is measured from the mark itself,
 * not from empty padding in the file. SVGs without a size count as 512².
 */
export async function loadLogo(url) {
  const img = await loadImage(url);
  let w = img.naturalWidth; let h = img.naturalHeight;
  if (!w || !h) { w = 512; h = 512; }
  const s = Math.min(1, 400 / Math.max(w, h));
  const cw = Math.max(1, Math.round(w * s)); const ch = Math.max(1, Math.round(h * s));
  const c = canvasOf(cw, ch);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, cw, ch);
  let box = { x0: 0, y0: 0, x1: 1, y1: 1 };
  try {
    const { data } = ctx.getImageData(0, 0, cw, ch);
    let minX = cw; let minY = ch; let maxX = -1; let maxY = -1;
    for (let y = 0; y < ch; y += 1) {
      for (let x = 0; x < cw; x += 1) {
        if (data[(y * cw + x) * 4 + 3] > 16) {
          if (x < minX) minX = x; if (x > maxX) maxX = x;
          if (y < minY) minY = y; if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX >= 0) box = { x0: minX / cw, y0: minY / ch, x1: (maxX + 1) / cw, y1: (maxY + 1) / ch };
  } catch { /* unreadable pixels: use the whole image */ }
  return { img, w, h, box };
}

/** The logo drawn at w×h, recoloured to `tint` (a hex) unless 'original'. */
export function tintedCanvas(img, w, h, tint) {
  const c = canvasOf(Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0, c.width, c.height);
  if (tint && tint !== 'original') {
    ctx.globalCompositeOperation = 'source-in';
    ctx.fillStyle = tint;
    ctx.fillRect(0, 0, c.width, c.height);
  }
  return c;
}

/** A superellipse ("squircle", like an app icon) as an SVG path in a 100×100 box. */
export function squirclePath(size = 100, n = 5, steps = 72) {
  const r = size / 2;
  const pts = [];
  for (let i = 0; i < steps; i += 1) {
    const t = (i / steps) * Math.PI * 2;
    const c = Math.cos(t); const s = Math.sin(t);
    pts.push([r + r * Math.sign(c) * Math.abs(c) ** (2 / n), r + r * Math.sign(s) * Math.abs(s) ** (2 / n)]);
  }
  return `M${pts.map((p) => p.map((v) => v.toFixed(2)).join(',')).join('L')}Z`;
}
export const SQUIRCLE_MASK = `url("data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><path d='${squirclePath()}'/></svg>`)}")`;

// ---- the test sheet ---------------------------------------------------------
const INK = '#16161a'; const MUTED = '#6b6b76'; const LINE = '#e3e3e8'; const WARN = '#e5484d'; const ACCENT = '#1fa7b3';

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function fillBg(ctx, x, y, w, h, bg) {
  if (bg === 'checker') {
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    for (let yy = 0; yy < h; yy += 10) for (let xx = 0; xx < w; xx += 10) {
      ctx.fillStyle = ((xx + yy) / 10) % 2 ? '#c9c9c9' : '#ffffff';
      ctx.fillRect(x + xx, y + yy, 10, 10);
    }
    ctx.restore();
  } else { ctx.fillStyle = bg; ctx.fillRect(x, y, w, h); }
}
// Contain-fit the logo in a box; returns where it landed.
function drawLogo(ctx, logo, x, y, w, h, { tint, filter }) {
  const r = Math.min(w / logo.w, h / logo.h);
  const dw = logo.w * r; const dh = logo.h * r;
  const dx = x + (w - dw) / 2; const dy = y + (h - dh) / 2;
  const src = tintedCanvas(logo.img, dw * 2, dh * 2, tint);
  ctx.save();
  if (filter && filter !== 'none') ctx.filter = filter;
  ctx.drawImage(src, dx, dy, dw, dh);
  ctx.restore();
  return { dx, dy, dw, dh };
}
function label(ctx, text, x, y, { size = 13, color = MUTED, weight = 500, align = 'left' } = {}) {
  ctx.fillStyle = color; ctx.font = `${weight} ${size}px system-ui, -apple-system, Segoe UI, sans-serif`;
  ctx.textAlign = align; ctx.textBaseline = 'alphabetic'; ctx.fillText(text, x, y);
}

/**
 * The whole test on one sheet: the logo on white / black / the chosen
 * background (with the clear space), as profile picture and app icon, the
 * minimum-size strip, on brand colours, and the specs. → PNG Blob.
 */
export async function renderSheet(logo, o) {
  const W = 1600; const M = 60; const S = 2;
  const brand = (o.brandColors || []).slice(0, 8);
  const H = 1050 + (brand.length ? 210 : 0);
  const c = canvasOf(W * S, H * S);
  const ctx = c.getContext('2d');
  ctx.scale(S, S);
  ctx.fillStyle = '#f4f4f6'; ctx.fillRect(0, 0, W, H);

  label(ctx, `Brand test — ${o.name || 'Logo'}`, M, 62, { size: 30, color: INK, weight: 700 });
  label(ctx, [o.tint === 'original' ? 'Original colours' : `Colour ${o.tint}`, new Date().toLocaleDateString()].join(' · '), W - M, 62, { size: 14, align: 'right' });

  // Row A: on white, on black, on the chosen background
  const pw = (W - M * 2 - 24 * 2) / 3; const ph = 300; let y = 100;
  // The third panel shows the chosen background — or, when that is plain
  // white / black anyway, the first brand colour (else transparency).
  const plain = o.bg === '#ffffff' || o.bg === '#0f0f12';
  const third = !plain ? [o.bg, `On ${o.bgLabel}`] : brand[0] ? [brand[0], `On ${brand[0].toUpperCase()}`] : ['checker', 'On transparent'];
  const panels = [['#ffffff', 'On white'], ['#111114', 'On black'], third];
  panels.forEach(([bg, name], i) => {
    const x = M + i * (pw + 24);
    ctx.save(); roundRect(ctx, x, y, pw, ph, 14); ctx.clip(); fillBg(ctx, x, y, pw, ph, bg); ctx.restore();
    ctx.strokeStyle = LINE; ctx.lineWidth = 1; roundRect(ctx, x + 0.5, y + 0.5, pw - 1, ph - 1, 14); ctx.stroke();
    const at = drawLogo(ctx, logo, x + pw * 0.2, y + ph * 0.2, pw * 0.6, ph * 0.6, o);
    if (i === 0 && o.showClear) {
      const b = logo.box;
      const tx = at.dx + b.x0 * at.dw; const ty = at.dy + b.y0 * at.dh;
      const tw = (b.x1 - b.x0) * at.dw; const th = (b.y1 - b.y0) * at.dh;
      const cs = (o.clearPct / 100) * th;
      ctx.save();
      ctx.strokeStyle = ACCENT; ctx.lineWidth = 1; ctx.strokeRect(tx, ty, tw, th);
      ctx.strokeStyle = WARN; ctx.setLineDash([6, 4]); ctx.strokeRect(tx - cs, ty - cs, tw + cs * 2, th + cs * 2);
      ctx.restore();
      label(ctx, `clear space x = ${o.clearPct}% of logo height`, x + 14, y + ph - 14, { size: 12, color: WARN, weight: 600 });
    }
    label(ctx, name, x, y + ph + 24, { size: 14, color: INK, weight: 600 });
  });
  y += ph + 60;

  // Row B: profile pictures (circle) and app icons (squircle), on the chosen background
  const bw = (W - M * 2 - 24) / 2; const bh = 230;
  const iconPath = new Path2D(squirclePath());
  [['Profile picture', [120, 64, 32], 'circle'], ['App icon', [120, 60, 30], 'squircle']].forEach(([name, sizes, shape], i) => {
    const x = M + i * (bw + 24);
    ctx.fillStyle = '#ffffff'; roundRect(ctx, x, y, bw, bh, 14); ctx.fill();
    ctx.strokeStyle = LINE; ctx.stroke();
    label(ctx, name, x + 20, y + 32, { size: 14, color: INK, weight: 600 });
    let cx = x + 30;
    sizes.forEach((sz) => {
      const top = y + 60 + (120 - sz);
      ctx.save();
      if (shape === 'circle') { ctx.beginPath(); ctx.arc(cx + sz / 2, top + sz / 2, sz / 2, 0, Math.PI * 2); ctx.clip(); }
      else { ctx.translate(cx, top); ctx.scale(sz / 100, sz / 100); ctx.clip(iconPath); ctx.setTransform(S, 0, 0, S, 0, 0); }
      fillBg(ctx, cx, top, sz, sz, o.bg);
      const pad = (1 - o.iconPad) / 2;
      drawLogo(ctx, logo, cx + sz * pad, top + sz * pad, sz * o.iconPad, sz * o.iconPad, o);
      ctx.restore();
      label(ctx, `${sz}px`, cx + sz / 2, y + 205, { size: 12, align: 'center' });
      cx += sz + 40;
    });
  });
  y += bh + 30;

  // Row C: minimum size strip, on the chosen background
  const ch = 230;
  ctx.fillStyle = '#ffffff'; roundRect(ctx, M, y, W - M * 2, ch, 14); ctx.fill(); ctx.strokeStyle = LINE; ctx.stroke();
  label(ctx, `Minimum size — ${o.minPx} px wide on screen · ${o.minMm} mm in print`, M + 20, y + 32, { size: 14, color: INK, weight: 600 });
  ctx.save(); roundRect(ctx, M + 16, y + 48, W - M * 2 - 32, 132, 10); ctx.clip(); fillBg(ctx, M + 16, y + 48, W - M * 2 - 32, 132, o.bg); ctx.restore();
  let sx = M + 30;
  const aspect = logo.h / logo.w;
  [16, 24, 32, 48, 64, 96, 128, 192].forEach((wpx) => {
    const hpx = wpx * aspect;
    const base = y + 168;
    drawLogo(ctx, logo, sx, base - Math.min(hpx, 110), wpx, Math.min(hpx, 110), o);
    const small = wpx < o.minPx;
    label(ctx, `${wpx}px`, sx + wpx / 2, y + 196, { size: 12, align: 'center', color: small ? WARN : MUTED, weight: small ? 700 : 500 });
    if (small) label(ctx, 'too small', sx + wpx / 2, y + 214, { size: 11, align: 'center', color: WARN });
    sx += wpx + 44;
  });
  y += ch + 30;

  // Row D: on brand colours
  if (brand.length) {
    label(ctx, 'On brand colours', M, y + 16, { size: 14, color: INK, weight: 600 });
    const tw = (W - M * 2 - 16 * (brand.length - 1)) / brand.length;
    brand.forEach((hex, i) => {
      const x = M + i * (tw + 16);
      ctx.save(); roundRect(ctx, x, y + 30, tw, 120, 12); ctx.clip(); ctx.fillStyle = hex; ctx.fillRect(x, y + 30, tw, 120); ctx.restore();
      drawLogo(ctx, logo, x + tw * 0.2, y + 50, tw * 0.6, 80, o);
      label(ctx, hex.toUpperCase(), x, y + 172, { size: 12 });
    });
    y += 210;
  }

  label(ctx, [
    o.showClear ? `Clear space: ${o.clearPct}% of the logo's height on every side` : null,
    `Minimum size: ${o.minPx} px (screen) / ${o.minMm} mm (print)`,
  ].filter(Boolean).join('   ·   '), M, H - 30, { size: 13 });
  label(ctx, 'Confinium · Brand Tester', W - M, H - 30, { size: 12, align: 'right' });

  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not render the sheet'))), 'image/png'));
}
