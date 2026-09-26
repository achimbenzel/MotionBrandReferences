// Media helpers: duration → length tag, and canvas frame capture to WebP.

/** Bucket a duration (seconds) into one of the four length tags. */
export function lengthTag(seconds) {
  const s = Number(seconds) || 0;
  if (s <= 30) return '≤ 30s';
  if (s <= 60) return '30–60s';
  if (s <= 90) return '60–90s';
  return '> 90s';
}

export const LENGTH_TAGS = ['≤ 30s', '30–60s', '60–90s', '> 90s'];

/** Format seconds as m:ss. */
export function fmtTime(seconds) {
  const s = Math.max(0, Math.floor(Number(seconds) || 0));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * Draw the current frame of a <video> element to an offscreen canvas and
 * return a WebP Blob (falls back to JPEG if the browser can't encode WebP).
 */
export function captureFrame(video, quality = 0.9) {
  return new Promise((resolve, reject) => {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('capture failed'))),
        'image/webp',
        quality,
      );
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Load a video File, seek to a fraction of its duration, and return
 * { blob, duration, width, height } for use as a thumbnail.
 */
export function grabThumbnail(file, atFraction = 0.15) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.src = url;
    const cleanup = () => URL.revokeObjectURL(url);

    video.addEventListener('loadedmetadata', () => {
      const target = Math.min(video.duration * atFraction, video.duration - 0.05);
      const onSeeked = async () => {
        try {
          const blob = await captureFrame(video, 0.85);
          resolve({ blob, duration: video.duration, width: video.videoWidth, height: video.videoHeight });
        } catch (err) {
          reject(err);
        } finally {
          cleanup();
        }
      };
      video.addEventListener('seeked', onSeeked, { once: true });
      video.currentTime = Number.isFinite(target) ? Math.max(0, target) : 0;
    }, { once: true });

    video.addEventListener('error', () => { cleanup(); reject(new Error('Could not read video')); }, { once: true });
  });
}

// Common delivery formats, matched within 3 % (a 1920×1088 export is 16:9).
const FORMATS = [['21:9', 21 / 9], ['16:9', 16 / 9], ['4:3', 4 / 3], ['1:1', 1], ['4:5', 4 / 5], ['3:4', 3 / 4], ['9:16', 9 / 16]];

/** '16:9', '9:16', '1:1', '4:5' … for a width × height (null if unknown). */
export function formatOf(w, h) {
  if (!w || !h) return null;
  const r = w / h;
  let best = null;
  for (const [key, v] of FORMATS) {
    const d = Math.abs(r - v) / v;
    if (d < 0.03 && (!best || d < best.d)) best = { key, d };
  }
  if (best) return best.key;
  return r > 1 ? 'Landscape' : 'Portrait';
}

/** '4K', '1080p', '720p' or 'SD' by the short side (portrait videos too). */
export function resolutionOf(w, h) {
  if (!w || !h) return null;
  const short = Math.min(w, h);
  const long = Math.max(w, h);
  if (short >= 2160 || long >= 3840) return '4K';
  if (short >= 1080) return '1080p';
  if (short >= 720) return '720p';
  return 'SD';
}

/** Read a video's size and length without playing it → { w, h, d } or null. */
export function probeVideo(url, timeout = 15000) {
  return new Promise((resolve) => {
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.muted = true;
    let timer = 0;
    const done = (r) => {
      clearTimeout(timer);
      v.onloadedmetadata = null; v.onerror = null;
      v.removeAttribute('src'); v.load();
      resolve(r);
    };
    timer = setTimeout(() => done(null), timeout);
    v.onloadedmetadata = () => done(v.videoWidth ? { w: v.videoWidth, h: v.videoHeight, d: Number.isFinite(v.duration) ? v.duration : 0 } : null);
    v.onerror = () => done(null);
    v.src = url;
  });
}

/**
 * A cover frame from a video URL (at `atFraction` of its length), at most
 * `maxW` wide → WebP Blob, or null if the video can't be read in time.
 */
export function captureCover(url, atFraction = 0.25, { maxW = 1600, timeout = 20000 } = {}) {
  return new Promise((resolve) => {
    const v = document.createElement('video');
    v.preload = 'auto';
    v.muted = true;
    v.playsInline = true;
    let finished = false;
    const done = (r) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      v.removeAttribute('src'); v.load();
      resolve(r);
    };
    const timer = setTimeout(() => done(null), timeout);
    v.addEventListener('error', () => done(null), { once: true });
    v.addEventListener('loadedmetadata', async () => {
      const d = await resolveDuration(v);
      if (finished) return;
      const target = d > 0 ? Math.min(d * atFraction, Math.max(0, d - 0.1)) : 0;
      // resolveDuration may still be jumping back — wait for our own seek.
      const onSeeked = async () => {
        if (Math.abs(v.currentTime - target) > 0.5) return;
        v.removeEventListener('seeked', onSeeked);
        try { done(await captureSmallFrame(v, maxW, 0.88)); } catch { done(null); }
      };
      v.addEventListener('seeked', onSeeked);
      v.currentTime = target;
      if (target === 0 && v.readyState >= 2) onSeeked();
    }, { once: true });
    v.src = url;
  });
}

/** The current frame of a <video>, scaled to at most `maxW` wide, as WebP. */
export function captureSmallFrame(video, maxW = 480, quality = 0.82) {
  return new Promise((resolve, reject) => {
    try {
      const scale = Math.min(1, maxW / (video.videoWidth || maxW));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
      canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
      canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('capture failed'))), 'image/webp', quality);
    } catch (err) { reject(err); }
  });
}

/**
 * A video's length in seconds. Some recordings (e.g. browser / screen
 * recordings in WebM) report an endless duration until they've been read to
 * the end — seeking far ahead makes the browser work it out. → 0 if unknown.
 */
export function resolveDuration(video) {
  return new Promise((resolve) => {
    if (Number.isFinite(video.duration)) { resolve(video.duration); return; }
    const back = video.currentTime;
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      video.removeEventListener('durationchange', onChange);
      try { video.currentTime = back; } catch { /* ignore */ }
      resolve(Number.isFinite(video.duration) ? video.duration : 0);
    };
    const onChange = () => { if (Number.isFinite(video.duration)) done(); };
    video.addEventListener('durationchange', onChange);
    setTimeout(done, 5000);
    try { video.currentTime = 1e101; } catch { done(); }
  });
}

/**
 * Peak levels (0–100, `count` buckets) of a media file's audio track, decoded
 * in the browser. Rejects (with `noAudio: true`) when there is no audio track
 * the browser can read.
 */
export async function audioPeaks(url, count = 1200) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = await res.arrayBuffer();
  const Offline = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const ctx = new Offline(1, 1, 44100);
  let audio;
  try { audio = await ctx.decodeAudioData(buf); }
  catch { throw Object.assign(new Error('No audio the browser can read'), { noAudio: true }); }
  const channels = Array.from({ length: audio.numberOfChannels }, (_, i) => audio.getChannelData(i));
  const len = audio.length;
  const size = Math.max(1, Math.floor(len / count));
  const raw = [];
  for (let b = 0; b < count; b += 1) {
    const from = b * size;
    const to = Math.min(len, from + size);
    let peak = 0;
    for (const ch of channels) for (let i = from; i < to; i += 1) { const v = Math.abs(ch[i]); if (v > peak) peak = v; }
    raw.push(peak);
  }
  const max = Math.max(...raw);
  if (!max) return { peaks: raw.map(() => 0), duration: audio.duration };
  return { peaks: raw.map((v) => Math.round((v / max) * 100)), duration: audio.duration };
}
