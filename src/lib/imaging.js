// Imaging helpers for the thumbnail crop/zoom editor.
// Uses the same pdf.js that powers the branding viewer (no extra dependency).
import * as pdfjsLib from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

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
