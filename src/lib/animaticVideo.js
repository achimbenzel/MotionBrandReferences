// The storyboard's animatic as a video file: every frame for its duration
// (a dissolve or fade where the storyboard says so), the on-screen text and
// — if wanted — the voice-over as captions, the music track and the recorded
// voice-overs mixed underneath. Drawn frame by frame on a canvas and encoded
// with the same encoder as the mockup videos (MP4 / WebM).
import { recordVideo } from './mockup3d/video.js';
import { timing } from './storyboard.js';

const SOFT = new Set(['Dissolve', 'Fade', 'Light leak', 'Morph']); // shown as a cross-dissolve
const XF = 0.4; // seconds

function loadImage(url) {
  return new Promise((resolve) => {
    const im = new Image();
    im.crossOrigin = 'anonymous';
    im.onload = () => resolve(im);
    im.onerror = () => resolve(null);
    im.src = url;
  });
}

// Wrap text into lines that fit `max` px.
function lines(ctx, text, max) {
  const out = [];
  for (const para of String(text || '').split('\n')) {
    let line = '';
    for (const w of para.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${w}` : w;
      if (ctx.measureText(next).width > max && line) { out.push(line); line = w; } else line = next;
    }
    if (line) out.push(line);
  }
  return out;
}

function drawFrame(ctx, W, H, shot, img, n, opts) {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  if (img) {
    const k = Math.min(W / img.width, H / img.height); // the whole frame, letterboxed if it's another shape
    const w = img.width * k; const h = img.height * k;
    ctx.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
  } else {
    ctx.fillStyle = '#1c1c20'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#8a8a94';
    ctx.font = `600 ${Math.round(H * 0.05)}px system-ui, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(`Shot ${n}`, W / 2, H * 0.42);
    ctx.font = `${Math.round(H * 0.032)}px system-ui, sans-serif`;
    lines(ctx, shot.visual || 'No frame yet', W * 0.7).slice(0, 4).forEach((l, i) => ctx.fillText(l, W / 2, H * 0.52 + i * H * 0.045));
  }
  const u = Math.min(W, H) / 100;
  if (opts.supers && shot.onscreen?.trim()) {
    ctx.font = `700 ${Math.round(u * 5.4)}px system-ui, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const ls = lines(ctx, shot.onscreen, W * 0.8);
    ls.forEach((l, i) => {
      const y = H * 0.18 + i * u * 7;
      ctx.lineWidth = u * 0.9; ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.strokeText(l, W / 2, y);
      ctx.fillStyle = '#fff'; ctx.fillText(l, W / 2, y);
    });
  }
  if (opts.captions && shot.vo?.trim()) {
    ctx.font = `500 ${Math.round(u * 3.6)}px system-ui, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const ls = lines(ctx, shot.vo, W * 0.78).slice(-3);
    const lh = u * 5; const pad = u * 1.6;
    const boxH = ls.length * lh + pad * 2;
    const boxW = Math.max(...ls.map((l) => ctx.measureText(l).width)) + pad * 3;
    const y0 = H - boxH - u * 5;
    ctx.fillStyle = 'rgba(0,0,0,.62)';
    ctx.fillRect((W - boxW) / 2, y0, boxW, boxH);
    ctx.fillStyle = '#fff';
    ls.forEach((l, i) => ctx.fillText(l, W / 2, y0 + pad + lh * (i + 0.5)));
  }
  if (opts.numbers) {
    ctx.font = `600 ${Math.round(u * 3)}px system-ui, sans-serif`;
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    const label = `${n}`;
    const w = ctx.measureText(label).width + u * 2.4;
    ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(u * 2, u * 2, w, u * 4.6);
    ctx.fillStyle = '#fff'; ctx.fillText(label, u * 3.2, u * 2.8);
  }
}

/**
 * Render the animatic → a video Blob. `shots` (already cut), `fileUrl(rel)`,
 * `width` × `height`, `fps`, `format` 'mp4' | 'webm', `audioUrl` (the track),
 * options `captions` / `supers` / `numbers`; `onProgress(0…1)`, `signal`.
 */
export async function renderAnimatic({ shots, fileUrl, width, height, fps = 24, format = 'mp4', audioUrl, captions = false, supers = true, numbers = false, music = 1, onProgress, signal }) {
  const { starts, total } = timing(shots);
  const imgs = await Promise.all(shots.map((s) => (s.image ? loadImage(fileUrl(s.image)) : null)));
  const opts = { captions, supers, numbers };
  const stage = {
    async renderFrames({ width: w, height: h, fps: f, duration, signal: sig, onFrame }) {
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d');
      const back = document.createElement('canvas'); back.width = w; back.height = h;
      const bctx = back.getContext('2d');
      const count = Math.max(1, Math.round(duration * f));
      let i = 0;
      for (let k = 0; k < count; k += 1) {
        if (sig?.aborted) throw new DOMException('Cancelled', 'AbortError');
        const t = k / f;
        while (i < shots.length - 1 && starts[i + 1] <= t + 1e-6) i += 1;
        drawFrame(ctx, w, h, shots[i], imgs[i], i + 1, opts);
        // Into the next shot softly, if its transition says so.
        const next = i + 1 < shots.length ? starts[i + 1] : Infinity;
        if (SOFT.has(shots[i].transition) && next - t < XF && i + 1 < shots.length) {
          drawFrame(bctx, w, h, shots[i + 1], imgs[i + 1], i + 2, opts);
          ctx.globalAlpha = 1 - (next - t) / XF;
          ctx.drawImage(back, 0, 0);
          ctx.globalAlpha = 1;
        }
        await onFrame(canvas, t, k, count);
      }
    },
  };
  const audio = [
    ...(audioUrl ? [{ url: audioUrl, start: 0, at: 0, loop: false, volume: music }] : []),
    ...shots.map((s, k) => (s.voice?.file ? { url: fileUrl(s.voice.file), start: 0, at: starts[k], loop: false, volume: s.voice.volume ?? 1 } : null)).filter(Boolean),
  ];
  return recordVideo(stage, { width, height, fps, duration: total, format, audio, onProgress, signal });
}
