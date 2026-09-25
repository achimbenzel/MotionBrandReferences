import { Crosshair, Plus, X } from 'lucide-react';
import { fmtClock } from '../lib/timing.js';

// Offered until your own techniques fill the quick row.
export const DEFAULT_TECHNIQUES = ['Match cut', 'Speed ramp', 'Whip pan', 'Kinetic type', 'UI zoom', 'Mask reveal',
  'Morph', 'Camera move', 'Logo reveal', 'Transition', '3D', 'Glitch'];

/** Your most used techniques first, topped up with the defaults. */
export function quickTechniques(used = [], max = 10) {
  const out = [];
  const seen = new Set();
  for (const label of [...used.map((t) => t.label), ...DEFAULT_TECHNIQUES]) {
    const key = label.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key); out.push(label.trim());
    if (out.length >= max) break;
  }
  return out;
}

/**
 * Moments: time markers on the video, each tagged with a technique and an
 * optional note, with the frame captured when it was marked. Tap a technique
 * (or press M) to mark the current moment.
 */
export default function MomentsPanel({ markers, techniques, focusId, thumbUrl, onAdd, onPatch, onRemove, onSeek }) {
  const list = [...markers].sort((a, b) => a.t - b.t);
  const quick = quickTechniques(techniques);
  const suggestions = quickTechniques(techniques, 60);
  return (
    <div className="moments">
      <div className="seg-head">
        <span className="seg-title"><Crosshair size={14} /> Moments {list.length > 0 && <span className="count">{list.length}</span>}</span>
      </div>
      <div className="seg-marks">
        <span className="seg-marks-label">Mark at playhead</span>
        {quick.map((label) => (
          <button key={label} className="seg-chip mom-chip" onClick={() => onAdd(label)} title={`Mark a “${label}” moment here`}>{label}</button>
        ))}
        <button className="seg-chip seg-chip-plain" onClick={() => onAdd('')} title="Mark a moment and type its technique (M)"><Plus size={13} /> Other</button>
      </div>
      {list.length > 0 && (
        <div className="mom-list">
          {list.map((m) => (
            <div className="mom-row" key={m.id}>
              <button className="mom-thumb" onClick={() => onSeek(m.t)} title="Jump here">
                {m.thumb ? <img src={thumbUrl(m.thumb)} alt="" loading="lazy" /> : <Crosshair size={16} />}
              </button>
              <button className="seg-row-time" onClick={() => onSeek(m.t)} title="Jump here">{fmtClock(m.t)}</button>
              <input className="input mom-label" list="technique-list" value={m.label} placeholder="Technique…" autoFocus={focusId === m.id}
                aria-label="Technique" onChange={(e) => onPatch(m.id, { label: e.target.value })} />
              <input className="input mom-note" value={m.note} placeholder="Note…" aria-label="Note"
                onChange={(e) => onPatch(m.id, { note: e.target.value })} />
              <button className="icon-btn mom-del" onClick={() => onRemove(m)} title="Remove moment"><X size={15} /></button>
            </div>
          ))}
        </div>
      )}
      <datalist id="technique-list">{suggestions.map((t) => <option key={t} value={t} />)}</datalist>
      <div className="hint seg-hint">Press <b>M</b> or pick a technique to mark the current moment. Every moment in your library: Motion Design → <b>Moments</b>.</div>
    </div>
  );
}
