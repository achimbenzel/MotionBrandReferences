// Timing helpers for scripts and storyboards: speaking time of a voice-over,
// durations typed as text ("30 s", "1:30", "1,5 min") and m:ss formatting.

// Speaking paces in words per second (a typical voice-over read).
export const PACES = [
  { wps: 2.9, label: 'Fast' },
  { wps: 2.5, label: 'English' },
  { wps: 2.2, label: 'German' },
  { wps: 1.9, label: 'Slow' },
];

/**
 * Estimated speaking time of a line. Text in [brackets] or (parentheses) is a
 * direction and isn't spoken; one that holds a time — "[pause 1.5s]", "[2 s]"
 * — adds that pause. → { words, pause, seconds }
 */
export function voEstimate(text, wps = 2.5) {
  let pause = 0;
  const spoken = String(text || '').replace(/\[([^\]]*)\]|\(([^)]*)\)/g, (_m, a, b) => {
    const t = String(a ?? b ?? '').match(/(\d+(?:[.,]\d+)?)\s*(?:s|sec|secs|second|seconds|sek|sekunden?)\b/i);
    if (t) pause += parseFloat(t[1].replace(',', '.'));
    return ' ';
  });
  const words = (spoken.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) || []).length;
  return { words, pause, seconds: words / wps + pause };
}

/** First duration in a free-text value, in seconds ("30 s + 15 s" → 30). */
export function parseSeconds(raw) {
  const m = String(raw || '').toLowerCase().match(/(\d+(?:[.,]\d+)?)(.{0,12})/);
  if (!m) return null;
  const n = parseFloat(m[1].replace(',', '.'));
  const rest = m[2];
  const mmss = rest.match(/^\s*:\s*(\d{1,2})/);
  if (mmss) return Math.round(n) * 60 + Number(mmss[1]);
  if (/^\s*(min|m\b)/.test(rest)) return n * 60;
  return n > 0 ? n : null;
}

/** A plan's target length from its briefing ("Target length: 30 s"), or null. */
export function briefingTarget(plan) {
  for (const b of plan?.blocks || []) {
    if (b.type !== 'briefing') continue;
    for (const f of b.fields || []) {
      if (!/length|länge|dauer|duration|laufzeit|runtime/i.test(f.label)) continue;
      const v = parseSeconds(f.value);
      if (v) return v;
    }
  }
  return null;
}

/** 7.25 → "7.3 s", 30 → "30 s", 94 → "1:34". */
export function fmtDur(seconds) {
  const s = Math.max(0, Number(seconds) || 0);
  if (s < 59.95) return `${String(Math.round(s * 10) / 10)} s`;
  const r = Math.round(s);
  return `${Math.floor(r / 60)}:${String(r % 60).padStart(2, '0')}`;
}

/** Timecode m:ss.t for a position in seconds. */
export function fmtClock(seconds) {
  const tenths = Math.round(Math.max(0, Number(seconds) || 0) * 10);
  const m = Math.floor(tenths / 600);
  return `${m}:${((tenths - m * 600) / 10).toFixed(1).padStart(4, '0')}`;
}

/** 'under' | 'ok' | 'over' — how a length compares with its target. */
export function targetState(total, target) {
  if (!target) return null;
  if (total > target + 0.5) return 'over';
  if (total >= target * 0.9) return 'ok';
  return 'under';
}
