// The beat of a music track, for cuts on the beat: its tempo (BPM) and where
// the first beat falls, read in the browser. The track's loudness rises
// (onsets) are autocorrelated to find the tempo that fits them best, then the
// phase that puts the most onsets on a beat.

const HOP = 512;

/** Decode an audio file to mono samples → { data, rate, duration }. */
async function decode(url) {
  const Ctx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if (!Ctx) throw new Error('This browser can’t read audio.');
  const ctx = new Ctx(1, 1, 44100);
  const buf = await ctx.decodeAudioData(await (await fetch(url)).arrayBuffer());
  const n = buf.length;
  const data = new Float32Array(n);
  for (let ch = 0; ch < buf.numberOfChannels; ch += 1) {
    const c = buf.getChannelData(ch);
    for (let i = 0; i < n; i += 1) data[i] += c[i] / buf.numberOfChannels;
  }
  return { data, rate: buf.sampleRate, duration: buf.duration };
}

/** How much louder each hop gets than the last (half-wave rectified), smoothed a little. */
function onsets(data) {
  const frames = Math.floor(data.length / HOP);
  const energy = new Float32Array(frames);
  for (let f = 0; f < frames; f += 1) {
    let e = 0;
    for (let i = f * HOP, end = i + HOP; i < end; i += 1) e += data[i] * data[i];
    energy[f] = Math.log1p(1000 * Math.sqrt(e / HOP));
  }
  const on = new Float32Array(frames);
  for (let f = 1; f < frames; f += 1) on[f] = Math.max(0, energy[f] - energy[f - 1]);
  // Take away a moving average, so only the peaks count.
  const W = 16;
  const out = new Float32Array(frames);
  let sum = 0;
  for (let f = 0; f < frames; f += 1) {
    sum += on[f];
    if (f >= W) sum -= on[f - W];
    out[f] = Math.max(0, on[f] - sum / Math.min(f + 1, W));
  }
  return out;
}

/**
 * Tempo and first beat of a track → { bpm, offset (s), confidence 0–1 }.
 * Tempos between 70 and 180 BPM are preferred (the usual range for edits).
 */
export async function detectBeat(url) {
  const { data, rate } = await decode(url);
  const env = onsets(data);
  const fps = rate / HOP;
  const n = Math.min(env.length, Math.floor(fps * 120)); // the first two minutes are plenty
  const minLag = Math.floor((60 / 200) * fps); const maxLag = Math.ceil((60 / 60) * fps);
  let best = { lag: 0, score: -1 };
  let mean = 0;
  const scores = [];
  for (let lag = minLag; lag <= maxLag; lag += 1) {
    let s = 0;
    for (let i = lag; i < n; i += 1) s += env[i] * env[i - lag];
    const bpm = (60 * fps) / lag;
    // A gentle preference for 70–180 BPM (halves and doubles score alike otherwise).
    const w = bpm < 70 ? 0.8 : bpm > 180 ? 0.85 : 1;
    s *= w;
    scores.push(s); mean += s;
    if (s > best.score) best = { lag, score: s };
  }
  mean /= Math.max(1, scores.length);
  if (!best.lag || best.score <= 0) throw new Error('No clear beat in this track.');
  // Refine the lag between frames (parabola through the neighbours).
  const k = best.lag - minLag;
  const a = scores[k - 1] ?? scores[k]; const b = scores[k]; const c = scores[k + 1] ?? scores[k];
  const shift = a - 2 * b + c ? (0.5 * (a - c)) / (a - 2 * b + c) : 0;
  const lag = best.lag + Math.max(-0.5, Math.min(0.5, shift));
  const bpm = Math.round(((60 * fps) / lag) * 10) / 10;
  // The phase that lands the most onsets on beats.
  let phase = { at: 0, score: -1 };
  for (let p = 0; p < lag; p += 1) {
    let s = 0;
    for (let t = p; t < n; t += lag) {
      const i = Math.round(t);
      s += (env[i] || 0) + 0.5 * ((env[i - 1] || 0) + (env[i + 1] || 0));
    }
    if (s > phase.score) phase = { at: p, score: s };
  }
  return {
    bpm,
    offset: Math.round((phase.at / fps) * 1000) / 1000,
    confidence: Math.max(0, Math.min(1, (best.score - mean) / (best.score || 1))),
  };
}

/** Beat times of a { bpm, offset } grid up to `end` seconds. */
export function beatTimes(beat, end) {
  if (!beat?.bpm) return [];
  const step = 60 / beat.bpm;
  const out = [];
  for (let t = beat.offset % step; t <= end + 1e-6; t += step) out.push(Math.round(t * 1000) / 1000);
  return out;
}

/** The beat nearest to `t` (or `t` itself without a beat). */
export function nearestBeat(beat, t) {
  if (!beat?.bpm) return t;
  const step = 60 / beat.bpm;
  const off = beat.offset % step;
  return Math.max(0, off + Math.round((t - off) / step) * step);
}
