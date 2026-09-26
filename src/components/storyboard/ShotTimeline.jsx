import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ZoomIn, ZoomOut, Maximize, Music } from 'lucide-react';
import { audioPeaks } from '../../lib/media.js';
import { fmtDur } from '../../lib/timing.js';
import { sectionRuns, segmentColor, sectionLabel } from '../../lib/storyboard.js';
import { beatTimes, nearestBeat } from '../../lib/beat.js';

const MIN_PPS = 8;
const MAX_PPS = 400;
const round = (v) => Math.max(0.1, Math.round(v * 10) / 10);
const mmss = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

/**
 * The storyboard on a time axis: sections, shots as blocks as long as they
 * last (drag a block's right edge to change its duration), the music track's
 * waveform and the target length. Click a shot to edit it below.
 */
export default function ShotTimeline({ shots, starts, total, target, fileUrl, audioUrl, selectedId, onSelect, onDuration, onOpen, beat, sortRef, sort }) {
  const wrapRef = useRef(null);
  const [width, setWidth] = useState(800);
  const [pps, setPps] = useState(null); // null = fit to the width
  const [wave, setWave] = useState(null); // { peaks, duration }
  const drag = useRef(null);

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  // The track's waveform, read once per track.
  useEffect(() => {
    setWave(null);
    if (!audioUrl) return undefined;
    let alive = true;
    audioPeaks(audioUrl, 1500).then((w) => { if (alive) setWave(w); }).catch(() => { if (alive) setWave({ peaks: [], duration: 0 }); });
    return () => { alive = false; };
  }, [audioUrl]);

  const span = Math.max(total, target || 0, wave?.duration || 0, 1);
  const fit = Math.max(MIN_PPS, (width - 24) / span);
  const scale = pps ?? fit;
  const inner = Math.max(width - 2, span * scale + 24);
  const x = (t) => t * scale;
  const tick = scale >= 60 ? 1 : scale >= 25 ? 2 : scale >= 12 ? 5 : 10;
  const ticks = [];
  for (let t = 0; t <= span + 0.001; t += tick) ticks.push(t);

  const zoom = (f) => setPps(Math.min(MAX_PPS, Math.max(MIN_PPS, scale * f)));

  const startDrag = (e, s, i) => {
    e.stopPropagation();
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    drag.current = { id: s.id, x0: e.clientX, d0: Number(s.duration) || 0, last: Number(s.duration) || 0, start: starts[i] };
  };
  const moveDrag = (e) => {
    const d = drag.current;
    if (!d) return;
    let v = round(d.d0 + (e.clientX - d.x0) / scale);
    // Snap the cut to the nearest beat (hold Alt to place it freely).
    if (beat?.snap && !e.altKey) v = Math.max(0.1, Math.round((nearestBeat(beat, d.start + v) - d.start) * 100) / 100);
    if (v !== d.last) { d.last = v; onDuration(d.id, v, false); }
  };
  const endDrag = () => {
    const d = drag.current;
    drag.current = null;
    if (d && d.last !== d.d0) onDuration(d.id, d.last, true);
  };

  return (
    <div className="sbt">
      <div className="sbt-tools">
        <span className="hint">Drag a shot's right edge to change how long it runs{beat?.snap ? ' (it snaps to the beat — Alt for free)' : ''} · drag a shot to move it · double-click to play from there</span>
        <span className="sbt-zoom">
          <button type="button" className="icon-btn" onClick={() => zoom(1 / 1.5)} aria-label="Zoom out"><ZoomOut size={15} /></button>
          <button type="button" className={`icon-btn ${pps == null ? 'on' : ''}`} onClick={() => setPps(null)} aria-label="Fit to width"><Maximize size={14} /></button>
          <button type="button" className="icon-btn" onClick={() => zoom(1.5)} aria-label="Zoom in"><ZoomIn size={15} /></button>
        </span>
      </div>
      <div className="sbt-scroll" ref={wrapRef}>
        <div className="sbt-inner" style={{ width: inner }}>
          <div className="sbt-ruler">
            {ticks.map((t) => <span key={t} style={{ left: x(t) }}>{mmss(t)}</span>)}
          </div>
          <div className="sbt-sections">
            {sectionRuns(shots).filter((r) => r.section).map((r) => {
              const c = segmentColor(r.section);
              return (
                <span key={r.from} className="sbt-section" style={{ left: x(r.start), width: Math.max(2, x(r.length) - 2), background: c.bg, color: c.fg }}
                  title={`${sectionLabel(r.section)} · ${fmtDur(r.length)}`}>{sectionLabel(r.section)}</span>
              );
            })}
          </div>
          {beat?.bpm > 0 && (
            <div className="sbt-beats" aria-hidden="true">
              {beatTimes(beat, span).map((t, k) => <i key={k} className={k % 4 === 0 ? 'bar' : ''} style={{ left: x(t) }} />)}
            </div>
          )}
          <div className="sbt-shots" ref={sortRef}>
            {shots.map((s, i) => {
              const st = sort ? sort.itemState(s.id) : {};
              return (
              <div key={s.id} data-sort-id={s.id} className={`sbt-shot ${selectedId === s.id ? 'on' : ''} ${st.className || ''} ${s.voice ? 'has-voice' : ''}`}
                {...(sort ? sort.grab(s.id) : {})}
                style={{ left: x(starts[i]), width: Math.max(6, x(Number(s.duration) || 0) - 2), backgroundImage: s.image ? `url("${fileUrl(s.image)}")` : undefined, ...(st.style || {}) }}
                onClick={() => onSelect(s.id)} onDoubleClick={() => onOpen(i)} role="button" tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter') onSelect(s.id); }}
                aria-label={`Shot ${i + 1}, ${fmtDur(Number(s.duration) || 0)}`}>
                <span className="sbt-no">{i + 1}</span>
                <span className="sbt-dur">{fmtDur(Number(s.duration) || 0)}</span>
                {s.voice && <span className="sbt-voice" style={{ width: Math.min(100, ((s.voice.duration || 0) / (Number(s.duration) || 1)) * 100) + '%' }} title={`Voice-over ${s.voice.duration}s`} />}
                <span className="sbt-handle" data-no-sort onPointerDown={(e) => startDrag(e, s, i)} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag}
                  title="Drag to change the duration" />
              </div>
              );
            })}
          </div>
          {audioUrl && (
            <div className="sbt-audio">
              {wave?.peaks?.length ? (
                <svg width={x(wave.duration)} height="40" viewBox={`0 0 ${wave.peaks.length} 100`} preserveAspectRatio="none" aria-hidden="true">
                  <path d={wave.peaks.map((p, k) => `M${k + 0.5} ${50 - Math.max(1, p) / 2}v${Math.max(1, p)}`).join('')} vectorEffect="non-scaling-stroke" />
                </svg>
              ) : <span className="sbt-audio-empty"><Music size={13} /> {wave ? 'Track can’t be read' : 'Reading the track…'}</span>}
            </div>
          )}
          {target ? <span className={`sbt-target ${total > target + 0.5 ? 'over' : ''}`} style={{ left: x(target) }} title={`Target ${fmtDur(target)}`} /> : null}
          <span className="sbt-end" style={{ left: x(total) }} />
        </div>
      </div>
    </div>
  );
}
