// Video export of a mockup animation. Frames are rendered one by one at the
// exact time they show (so the video is smooth whatever the computer's
// speed) and encoded with WebCodecs into MP4 (H.264) or WebM (VP9 / VP8) by
// Mediabunny. Browsers without WebCodecs record the canvas in real time with
// MediaRecorder instead (WebM).
const even = (n) => Math.max(2, Math.round(n / 2) * 2);
const hasWebCodecs = () => typeof window !== 'undefined' && typeof window.VideoEncoder === 'function';
const RECORDER_TYPES = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'];

// Codec strings to ask WebCodecs about (H.264 High 5.1 covers 4K).
const PROBE = { mp4: ['avc1.640033', 'avc1.64002a'], webm: ['vp09.00.40.08', 'vp8'] };

/** The formats this browser can write at width × height: ['mp4', 'webm'] or fewer. */
export async function videoFormats(width, height) {
  const w = even(width); const h = even(height);
  if (!hasWebCodecs()) {
    const ok = typeof MediaRecorder !== 'undefined' && RECORDER_TYPES.find((t) => MediaRecorder.isTypeSupported(t));
    return ok ? [ok.startsWith('video/mp4') ? 'mp4' : 'webm'] : [];
  }
  const out = [];
  for (const [format, codecs] of Object.entries(PROBE)) {
    for (const codec of codecs) {
      const res = await window.VideoEncoder.isConfigSupported({ codec, width: w, height: h, bitrate: 8e6, framerate: 30 }).catch(() => null);
      if (res?.supported) { out.push(format); break; }
    }
  }
  return out;
}

/**
 * Render `stage`'s animation into a video Blob. `onProgress(0…1)`; abort with
 * `signal`. `background` overrides the scene's (videos have no transparency).
 */
export async function recordVideo(stage, { width, height, fps = 30, duration, format = 'mp4', background, onProgress, signal }) {
  const w = even(width); const h = even(height);
  if (!hasWebCodecs()) return recordRealtime(stage, { width: w, height: h, fps, duration, background, onProgress, signal });
  const mb = await import('mediabunny');
  let codec = 'avc';
  if (format === 'webm') codec = (await mb.canEncodeVideo('vp9', { width: w, height: h }).catch(() => false)) ? 'vp9' : 'vp8';
  const output = new mb.Output({
    format: format === 'mp4' ? new mb.Mp4OutputFormat({ fastStart: 'in-memory' }) : new mb.WebMOutputFormat(),
    target: new mb.BufferTarget(),
  });
  let source = null;
  try {
    await stage.renderFrames({
      width: w, height: h, fps, duration, background, signal,
      onFrame: async (canvas, t, i, count) => {
        if (!source) {
          source = new mb.CanvasSource(canvas, { codec, bitrate: mb.QUALITY_VERY_HIGH, keyFrameInterval: 2 });
          output.addVideoTrack(source, { frameRate: fps });
          await output.start();
        }
        await source.add(t, 1 / fps);
        onProgress?.((i + 1) / count);
      },
    });
    await output.finalize();
  } catch (err) {
    await output.cancel().catch(() => {});
    throw err;
  }
  return new Blob([output.target.buffer], { type: format === 'mp4' ? 'video/mp4' : 'video/webm' });
}

async function recordRealtime(stage, { width, height, fps, duration, background, onProgress, signal }) {
  const type = RECORDER_TYPES.find((t) => MediaRecorder.isTypeSupported(t));
  if (!type) throw new Error('This browser can’t record video.');
  let rec = null; let track = null;
  const chunks = [];
  await stage.renderFrames({
    width, height, fps, duration, background, signal,
    onFrame: async (canvas, t, i, count) => {
      if (!rec) {
        const stream = canvas.captureStream(0);
        [track] = stream.getVideoTracks();
        rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: Math.round(width * height * fps * 0.15) });
        rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
        rec.start();
      }
      track.requestFrame?.();
      await new Promise((r) => { setTimeout(r, 1000 / fps); });
      onProgress?.((i + 1) / count);
    },
  });
  await new Promise((resolve) => { rec.onstop = resolve; rec.stop(); });
  return new Blob(chunks, { type: type.split(';')[0] });
}
