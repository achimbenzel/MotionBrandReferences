// Imaging helpers for the thumbnail crop/zoom editor.
// Uses the same pdf.js that powers the branding viewer (no extra dependency).
import * as pdfjsLib from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { rgbToLab, deltaE } from './color.js';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

/**
 * Load an image from a File or a URL string into a decoded HTMLImageElement.
 * Returns { img, cleanup } — call cleanup() when done to revoke object URLs.
 */
export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const isFile = typeof src !== 'string';
    const url = isFile ? URL.createObjectURL(src) : src;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve({ img, cleanup: () => { if (isFile) URL.revokeObjectURL(url); } });
    img.onerror = () => { if (isFile) URL.revokeObjectURL(url); reject(new Error('Could not load image')); };
    img.src = url;
  });
}

/**
 * Render one page of a PDF (File or URL) to a canvas.
 * Returns { canvas, numPages }.
 */
export async function renderPdfPage(src, pageNum = 1, maxW = 1400) {
  const params = typeof src === 'string' ? { url: src } : { data: await src.arrayBuffer() };
  const pdf = await pdfjsLib.getDocument(params).promise;
  try {
    const numPages = pdf.numPages;
    const page = await pdf.getPage(Math.min(Math.max(1, pageNum), numPages));
    const unscaled = page.getViewport({ scale: 1 });
    const scale = Math.min(maxW / unscaled.width, 2.5);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    return { canvas, numPages };
  } finally {
    pdf.destroy();
  }
}

/**
 * Crop a source (HTMLImageElement or canvas) to a region and return a WebP Blob.
 * `rect` is in source pixels: { sx, sy, sw, sh }. Output is `out.w` x `out.h`.
 */
export function cropToBlob(source, rect, out = { w: 800, h: 500 }, quality = 0.9) {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    canvas.width = out.w;
    canvas.height = out.h;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(source, rect.sx, rect.sy, rect.sw, rect.sh, 0, 0, out.w, out.h);
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('crop failed'))),
      'image/webp',
      quality,
    );
  });
}

/** Centered "cover" crop rect (in source px) for a target aspect ratio. */
export function centerCover(sw, sh, aspect) {
  const srcRatio = sw / sh;
  let cw, ch;
  if (srcRatio > aspect) { ch = sh; cw = sh * aspect; }
  else { cw = sw; ch = sw / aspect; }
  return { sx: (sw - cw) / 2, sy: (sh - ch) / 2, sw: cw, sh: ch };
}

/** Natural pixel size of an image or canvas. */
export function sourceSize(source) {
  return {
    w: source.naturalWidth || source.width,
    h: source.naturalHeight || source.height,
  };
}

/**
 * Extract up to `n` dominant colours from an image (File or URL). Samples a
 * downscaled copy, buckets colours coarsely, then keeps the most frequent
 * buckets that are perceptually distinct (ΔE). Returns [{ r, g, b }].
 */
export async function extractPalette(src, n = 6) {
  const { img, cleanup } = await loadImage(src);
  try {
    const S = 80;
    const canvas = document.createElement('canvas');
    canvas.width = S; canvas.height = S;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const { w, h } = sourceSize(img);
    const scale = Math.max(S / w, S / h); // cover-fit
    const dw = w * scale, dh = h * scale;
    ctx.drawImage(img, (S - dw) / 2, (S - dh) / 2, dw, dh);
    const data = ctx.getImageData(0, 0, S, S).data;

    const buckets = new Map();
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 125) continue; // skip transparent
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const key = `${r >> 4},${g >> 4},${b >> 4}`; // 16 levels / channel
      const e = buckets.get(key) || { r: 0, g: 0, b: 0, n: 0 };
      e.r += r; e.g += g; e.b += b; e.n++;
      buckets.set(key, e);
    }
    const ranked = [...buckets.values()]
      .map((e) => ({ r: Math.round(e.r / e.n), g: Math.round(e.g / e.n), b: Math.round(e.b / e.n), n: e.n }))
      .sort((a, b) => b.n - a.n);

    const chosen = [];
    for (const col of ranked) {
      const lab = rgbToLab(col);
      if (chosen.every((c) => deltaE(c.lab, lab) > 12)) chosen.push({ r: col.r, g: col.g, b: col.b, lab });
      if (chosen.length >= n) break;
    }
    return chosen.map(({ r, g, b }) => ({ r, g, b }));
  } finally {
    cleanup();
  }
}
