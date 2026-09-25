/**
 * An audio waveform (peaks 0–100) as a filled shape; the part already played
 * is drawn in the accent colour.
 */
export default function Waveform({ peaks, progress = 0 }) {
  const n = peaks.length;
  if (!n) return null;
  const top = peaks.map((p, i) => `L${i},${50 - Math.max(1, p) / 2}`).join('');
  const bottom = peaks.map((p, i) => `L${n - 1 - i},${50 + Math.max(1, peaks[n - 1 - i]) / 2}`).join('');
  const d = `M0,50${top}L${n - 1},50${bottom}Z`;
  const pct = Math.min(100, Math.max(0, progress * 100));
  return (
    <div className="wave" aria-hidden="true">
      <svg viewBox={`0 0 ${n - 1} 100`} preserveAspectRatio="none"><path d={d} /></svg>
      <svg className="wave-played" viewBox={`0 0 ${n - 1} 100`} preserveAspectRatio="none" style={{ clipPath: `inset(0 ${100 - pct}% 0 0)` }}><path d={d} /></svg>
    </div>
  );
}
