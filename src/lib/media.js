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
