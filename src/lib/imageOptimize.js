// Pictures made smaller before they're uploaded: a smaller size (the long
// edge) and / or another format (WebP, JPEG) — done here in the browser, so
// the server stores the smaller file. How (ask each time / always / never,
// format, size, quality) is kept in the settings (`imageUploads`).

export const IMAGE_DEFAULTS = { mode: 'ask', format: 'webp', maxEdge: 2560, quality: 85 };
export const EDGES = [0, 3840, 2560, 1920, 1280];
export const FORMATS = [
  { key: 'webp', label: 'WebP', hint: 'smallest — with transparency' },
  { key: 'jpeg', label: 'JPEG', hint: 'works everywhere' },
  { key: 'keep', label: 'Keep format', hint: 'only resize' },
];

// Pictures that can be redrawn: not SVG (vector) and not GIF (may be animated).
const RASTER = /^image\/(jpeg|png|webp|bmp|avif)$/;
const RASTER_EXT = /\.(jpe?g|png|webp|bmp|avif)$/i;
export const canOptimize = (f) => f instanceof Blob && (RASTER.test(f.type || '') || (!f.type && RASTER_EXT.test(f.name || '')));

let prefsCache = null;
let loader = null;
let prompter = null;
const handled = new WeakSet(); // files already decided on (made smaller or kept as they are)
const handledKeys = new Set();  // …and the same by content, for a form that wraps a file anew
const keyOf = (f) => `${f.size}|${f.type}|${f.lastModified}`;
const isHandled = (f) => handled.has(f) || handledKeys.has(keyOf(f));
const markHandled = (f) => { handled.add(f); if (handledKeys.size > 500) handledKeys.clear(); handledKeys.add(keyOf(f)); };

/** Your choices, from the settings (loaded once; `rememberPrefs` keeps them fresh). */
export async function imagePrefs() {
  if (prefsCache) return prefsCache;
  if (!loader) {
    loader = fetch('/api/settings')
      .then((r) => (r.ok ? r.json() : null)).then((j) => ({ ...IMAGE_DEFAULTS, ...(j?.settings?.imageUploads || {}) }))
      .catch(() => ({ ...IMAGE_DEFAULTS }))
      .finally(() => { loader = null; });
  }
  prefsCache = await loader;
  return prefsCache;
}
export const rememberPrefs = (p) => { prefsCache = { ...IMAGE_DEFAULTS, ...(p || {}) }; };
/** The dialog that asks (mounted once in the app): (files, prefs) → Promise<File[]>. */
export const setImagePrompter = (fn) => { prompter = fn; return () => { if (prompter === fn) prompter = null; }; };

const supports = {};
async function canEncode(type) {
  if (type in supports) return supports[type];
  const c = document.createElement('canvas'); c.width = 2; c.height = 2;
  const b = await new Promise((res) => { c.toBlob(res, type, 0.8); });
  supports[type] = !!b && b.type === type;
  return supports[type];
}
const hasAlpha = (ctx, w, h) => {
  // a quick look over a small copy is enough to find any see-through pixel
  const s = document.createElement('canvas');
  const k = Math.min(1, 256 / Math.max(w, h));
  s.width = Math.max(1, Math.round(w * k)); s.height = Math.max(1, Math.round(h * k));
  const sc = s.getContext('2d');
  sc.drawImage(ctx.canvas, 0, 0, s.width, s.height);
  const d = sc.getImageData(0, 0, s.width, s.height).data;
  s.width = 0; s.height = 0;
  for (let i = 3; i < d.length; i += 4) if (d[i] < 250) return true;
  return false;
};
const EXT = { 'image/webp': '.webp', 'image/jpeg': '.jpg', 'image/png': '.png' };

/**
 * One picture, made smaller → { file, width, height, before, after, changed, note }.
 * Pictures with transparency never become JPEG (WebP, or they keep their format);
 * a result that isn't smaller keeps the original. Should the browser stumble
 * (short of memory with a huge picture) it tries once more — or keeps the original.
 */
export async function optimizeImage(file, prefs) {
  const first = await attempt(file, prefs);
  if (!first.failed) return first;
  await new Promise((r) => { setTimeout(r, 300); });
  const again = await attempt(file, prefs);
  return again.failed ? { file, before: file.size, after: file.size, changed: false, note: 'couldn’t be worked out here' } : again;
}

async function attempt(file, prefs) {
  const p = { ...IMAGE_DEFAULTS, ...prefs };
  const same = (note = '') => ({ file, before: file.size, after: file.size, changed: false, note });
  if (!canOptimize(file)) return same('stays as it is');
  let bmp = null;
  const canvas = document.createElement('canvas');
  try {
    bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const { width: w0, height: h0 } = bmp;
    const k = p.maxEdge && Math.max(w0, h0) > p.maxEdge ? p.maxEdge / Math.max(w0, h0) : 1;
    const w = Math.max(1, Math.round(w0 * k)); const h = Math.max(1, Math.round(h0 * k));
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bmp, 0, 0, w, h);
    bmp.close?.(); bmp = null;
    const from = RASTER.test(file.type) ? file.type : `image/${(RASTER_EXT.exec(file.name)?.[1] || 'png').toLowerCase().replace('jpg', 'jpeg')}`;
    const alpha = from !== 'image/jpeg' && hasAlpha(ctx, w, h);
    let type = p.format === 'webp' ? 'image/webp' : p.format === 'jpeg' ? 'image/jpeg' : from;
    let note = '';
    if (type === 'image/jpeg' && alpha) { type = (await canEncode('image/webp')) ? 'image/webp' : from; note = 'has transparency — no JPEG'; }
    if (type === 'image/webp' && !(await canEncode('image/webp'))) { type = alpha ? from : 'image/jpeg'; note = 'this browser can’t write WebP'; }
    if (!EXT[type]) type = alpha ? 'image/png' : 'image/jpeg'; // bmp / avif → something every browser writes
    if (k === 1 && type === from && type === 'image/png') return same('PNG, already its size');
    const blob = await new Promise((res) => { canvas.toBlob(res, type, p.quality / 100); });
    if (!blob) return { failed: true };
    if (blob.size >= file.size) return { ...same(note || 'already small'), width: w0, height: h0 };
    const name = `${(file.name || 'picture').replace(/\.[^.]+$/, '')}${EXT[blob.type] || '.jpg'}`;
    const out = new File([blob], name, { type: blob.type, lastModified: Date.now() });
    markHandled(out);
    return { file: out, width: w, height: h, before: file.size, after: out.size, changed: true, note };
  } catch {
    return { failed: true };
  } finally {
    bmp?.close?.();
    canvas.width = 0; canvas.height = 0; // give the memory back right away
  }
}

/**
 * The pictures among `files` made smaller as you set it — asking first when
 * that's your choice. Other files (videos, PDFs …) pass through untouched,
 * as do pictures already decided on. → the files in the same order.
 */
export async function optimizeFiles(files) {
  const list = Array.from(files || []);
  const todo = list.filter((f) => canOptimize(f) && !isHandled(f));
  if (!todo.length) return list;
  const prefs = await imagePrefs();
  let done = todo;
  if (prefs.mode === 'auto') done = await Promise.all(todo.map(async (f) => (await optimizeImage(f, prefs)).file));
  else if (prefs.mode === 'ask' && prompter) done = await prompter(todo, prefs);
  todo.forEach(markHandled);
  done.forEach(markHandled);
  const swap = new Map(todo.map((f, i) => [f, done[i] || f]));
  return list.map((f) => swap.get(f) || f);
}

/** A form's pictures made smaller (`fields`: true = every field, or the names of those that hold pictures). */
export async function optimizeForm(fd, fields = true) {
  const entries = [...fd.entries()];
  const pics = entries.filter(([k, v]) => (fields === true || fields.includes(k)) && canOptimize(v) && !isHandled(v)).map(([, v]) => v);
  if (!pics.length) return fd;
  const out = await optimizeFiles(pics);
  const swap = new Map(pics.map((f, i) => [f, out[i]]));
  const next = new FormData();
  for (const [k, v] of entries) {
    const r = swap.get(v);
    if (r) next.append(k, r, r.name); else if (v instanceof Blob) next.append(k, v, v.name); else next.append(k, v);
  }
  return next;
}
