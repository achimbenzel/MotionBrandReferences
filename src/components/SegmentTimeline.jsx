import { useEffect, useRef } from 'react';
import { Scissors, X, ChevronDown, ArrowRightToLine, ListVideo, Repeat } from 'lucide-react';
import Menu from './Menu.jsx';
import { useToast } from './Toast.jsx';
import { useConfirm } from './ConfirmDialog.jsx';
import { SEGMENT_KINDS, segmentKind, segmentColor, segmentName } from '../lib/segments.js';
import { tagColor } from '../lib/types.js';
import { isTouch } from '../lib/useMedia.js';
import Waveform from './Waveform.jsx';

const rid = () => Math.random().toString(36).slice(2, 8);
const NEAR = 0.25; // seconds — a mark this close to a boundary retypes that section
const clamp = (n, a, b) => Math.min(b, Math.max(a, n));

// m:ss.t — sections are often only a second or two long.
function fmtT(seconds) {
  const tenths = Math.round(Math.max(0, Number(seconds) || 0) * 10);
  const m = Math.floor(tenths / 600);
  const s = (tenths - m * 600) / 10;
  return `${m}:${s.toFixed(1).padStart(4, '0')}`;
}

/**
 * The structure of a video: consecutive sections (Hook, Problem, Product
 * reveal …), each running from its start to the next one's. Play the video and
 * tap a type (or press 1–7) where that part begins; the bar scrubs the video.
 * `segments` are { id, start, kind, label }; onChange(next, immediate) saves.
 */
export default function SegmentTimeline({ videoRef, current, duration, segments, onChange, onSeek, markers = [], loopKey = null, onLoop, wave = null }) {
  const toast = useToast();
  const [dialog, ask] = useConfirm();
  const barRef = useRef(null);
  const scrubbing = useRef(false);
  const touch = isTouch();

  const list = [...segments].sort((a, b) => a.start - b.start)
    .map((s, i, arr) => ({ ...s, end: i < arr.length - 1 ? arr[i + 1].start : (duration || s.start) }));
  const active = list.findIndex((s, i) => current >= s.start && (i === list.length - 1 || current < s.end));
  const playhead = () => Number((videoRef.current?.currentTime ?? current).toFixed(2));

  const seek = (t) => { const v = videoRef.current; if (v) v.currentTime = t; onSeek?.(t); };
  const needDuration = () => {
    if (duration) return false;
    toast('Video length not ready yet — press play once, then try again.', 'error');
    return true;
  };

  // Start a section of `kind` at the playhead (or retype the one starting there).
  const markAt = (kind) => {
    if (needDuration()) return;
    const t = playhead();
    if (!segments.length) {
      onChange(t < NEAR || t >= duration - 0.1
        ? [{ id: rid(), start: 0, kind, label: '' }]
        : [{ id: rid(), start: 0, kind: '', label: '' }, { id: rid(), start: t, kind, label: '' }], true);
      return;
    }
    const at = segments.find((s) => Math.abs(s.start - t) < NEAR);
    if (at) { onChange(segments.map((s) => (s.id === at.id ? { ...s, kind } : s)), true); return; }
    if (t >= duration - 0.1) { toast('Move the playhead into the clip first.'); return; }
    onChange([...segments, { id: rid(), start: t, kind, label: '' }], true);
  };
  const split = () => {
    if (needDuration()) return;
    const t = playhead();
    if (!segments.length) {
      onChange(t > NEAR && t < duration - NEAR
        ? [{ id: rid(), start: 0, kind: '', label: '' }, { id: rid(), start: t, kind: '', label: '' }]
        : [{ id: rid(), start: 0, kind: '', label: '' }], true);
      return;
    }
    if (t <= 0.1 || t >= duration - 0.1 || segments.some((s) => Math.abs(s.start - t) < NEAR)) {
      toast('Move the playhead into the clip (away from an existing boundary), then split.');
      return;
    }
    onChange([...segments, { id: rid(), start: t, kind: '', label: '' }], true);
  };
  const patchSeg = (id, p, immediate = false) => onChange(segments.map((s) => (s.id === id ? { ...s, ...p } : s)), immediate);
  // Removing a section hands its time to the one before (the first: to the next).
  const remove = (id) => {
    let next = segments.filter((s) => s.id !== id).sort((a, b) => a.start - b.start);
    if (next.length) next = next.map((s, i) => (i === 0 ? { ...s, start: 0 } : s));
    onChange(next, true);
  };
  const moveStart = (idx) => {
    const t = playhead();
    const prev = list[idx - 1]; const next = list[idx + 1];
    if (t <= prev.start + 0.1 || (next && t >= next.start - 0.1)) {
      toast('Put the playhead between the neighbouring sections first.');
      return;
    }
    patchSeg(list[idx].id, { start: t }, true);
  };
  const clear = () => ask({
    title: 'Remove all sections?',
    message: 'The video stays — only its section markers are removed.',
    confirmLabel: 'Remove', danger: true, onConfirm: () => onChange([], true),
  });

  // Keys 1–7 mark a section type at the playhead (also while playing).
  const markRef = useRef(markAt);
  markRef.current = markAt;
  useEffect(() => {
    const onKey = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const n = Number(e.key);
      if (!Number.isInteger(n) || n < 1 || n > SEGMENT_KINDS.length) return;
      const el = document.activeElement;
      if (el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable)) return;
      if (document.querySelector('.overlay, .lightbox, .sheet-backdrop')) return;
      e.preventDefault();
      markRef.current(SEGMENT_KINDS[n - 1].key);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Click or drag along the bar to scrub the video.
  const scrubTo = (clientX) => {
    const r = barRef.current?.getBoundingClientRect();
    if (!r || !duration) return;
    seek(clamp((clientX - r.left) / r.width, 0, 1) * duration);
  };
  const barHandlers = {
    onPointerDown: (e) => { if (e.button) return; scrubbing.current = true; e.currentTarget.setPointerCapture?.(e.pointerId); scrubTo(e.clientX); },
    onPointerMove: (e) => { if (scrubbing.current) scrubTo(e.clientX); },
    onPointerUp: () => { scrubbing.current = false; },
    onPointerCancel: () => { scrubbing.current = false; },
  };

  return (
    <div className="seg-timeline">
      <div className="seg-head">
        <span className="seg-title"><ListVideo size={14} /> Sections {list.length > 0 && <span className="count">{list.length}</span>}</span>
        {list.length > 0 && <button className="btn btn-sm btn-ghost" onClick={clear}>Clear</button>}
      </div>

      <div className={`seg-bar ${list.length ? '' : 'empty'}`} ref={barRef} {...barHandlers}>
        {list.length ? list.map((s, i) => {
          const c = segmentColor(s.kind);
          const k = segmentKind(s.kind);
          return (
            <div key={s.id} className={`seg ${i === active ? 'active' : ''} ${loopKey === s.id ? 'looped' : ''}`}
              style={{ flexGrow: Math.max(0.0001, s.end - s.start), background: c.bg, color: c.fg }}
              title={`${segmentName(s, i)}${s.label && k ? ` — ${s.label}` : ''} · ${fmtT(s.start)}–${fmtT(s.end)}`}>
              <span className="seg-name">{k ? (k.short || k.label) : (s.label || '—')}</span>
            </div>
          );
        }) : <span className="seg-bar-empty">No sections yet</span>}
        {duration > 0 && markers.map((m) => (
          <span key={m.id} className="seg-moment" style={{ left: `${clamp(m.t / duration, 0, 1) * 100}%` }} title={`${m.label || 'Moment'} · ${fmtT(m.t)}`} />
        ))}
        {duration > 0 && <span className="seg-playhead" style={{ left: `${clamp(current / duration, 0, 1) * 100}%` }} />}
      </div>

      {wave?.peaks?.length > 0 && (
        <div className="wave-wrap" {...barHandlers} title="Audio — click or drag to scrub">
          <Waveform peaks={wave.peaks} progress={duration ? current / duration : 0} />
        </div>
      )}
      {wave?.state === 'working' && <div className="wave-note">Reading the audio…</div>}
      {wave?.state === 'large' && (
        <button className="wave-note wave-btn" onClick={wave.onCompute}>
          Show the audio waveform{wave.size ? ` (reads the whole ${Math.round(wave.size / 1048576)} MB file)` : ''}
        </button>
      )}

      <div className="seg-marks">
        <span className="seg-marks-label">Mark at playhead</span>
        {SEGMENT_KINDS.map((k, i) => {
          const c = tagColor(k.color);
          return (
            <button key={k.key} className="seg-chip" style={{ background: c.bg, color: c.fg }} onClick={() => markAt(k.key)}
              title={`Start a “${k.label}” section at the playhead${touch ? '' : ` (key ${i + 1})`}`}>
              {!touch && <kbd>{i + 1}</kbd>}{k.short || k.label}
            </button>
          );
        })}
        <button className="seg-chip seg-chip-plain" onClick={split} title="Start an untyped section at the playhead"><Scissors size={13} /> Split</button>
      </div>

      {list.length > 0 && (
        <div className="seg-list">
          {list.map((s, i) => {
            const c = segmentColor(s.kind);
            const k = segmentKind(s.kind);
            return (
              <div key={s.id} className={`seg-row ${i === active ? 'active' : ''}`}>
                <button className="seg-row-time" onClick={() => seek(s.start)} title="Jump here">{fmtT(s.start)}</button>
                <Menu
                  align="left"
                  title="Section type"
                  trigger={<button className="seg-kind" style={{ background: c.bg, color: c.fg }}>{k ? k.label : 'No type'} <ChevronDown size={13} /></button>}
                  items={[
                    ...SEGMENT_KINDS.map((x) => ({ label: x.label, icon: <span className="seg-dot" style={{ background: tagColor(x.color).fg }} />, onClick: () => patchSeg(s.id, { kind: x.key }, true) })),
                    { separator: true },
                    { label: 'No type', icon: <span className="seg-dot" style={{ background: tagColor('gray').fg }} />, onClick: () => patchSeg(s.id, { kind: '' }, true) },
                  ]}
                />
                <input className="input seg-note" value={s.label} placeholder={k ? 'Note…' : 'Name…'}
                  onChange={(e) => patchSeg(s.id, { label: e.target.value })} />
                <span className="seg-dur">{(s.end - s.start).toFixed(1)} s</span>
                <span className="seg-row-tools">
                  {onLoop && (
                    <button className={`icon-btn ${loopKey === s.id ? 'on' : ''}`} title={loopKey === s.id ? 'Stop looping' : 'Loop this section'}
                      aria-pressed={loopKey === s.id} onClick={() => onLoop(s)}><Repeat size={14} /></button>
                  )}
                  {i > 0 && (
                    <button className="icon-btn" title="Move this section’s start to the playhead" onClick={() => moveStart(i)}><ArrowRightToLine size={15} /></button>
                  )}
                  <button className="icon-btn seg-row-del" title="Remove section (its time joins the one before)" onClick={() => remove(s.id)}><X size={15} /></button>
                </span>
              </div>
            );
          })}
        </div>
      )}

      <div className="hint seg-hint">
        {touch
          ? 'Play the video and tap a type where that part begins. Drag along the bar to scrub.'
          : 'Play the video and press 1–7 (or click a type) where each part begins. Click or drag the bar to scrub.'}
      </div>
      {dialog}
    </div>
  );
}
