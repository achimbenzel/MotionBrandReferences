import { useCallback, useEffect, useRef, useState } from 'react';
import { X, Play, Pause, SkipBack, SkipForward, Captions, RotateCcw } from 'lucide-react';
import { fmtClock } from '../../lib/timing.js';

const clamp = (n, a, b) => Math.min(b, Math.max(a, n));

/**
 * Fullscreen animatic: plays the storyboard's frames for their durations, with
 * the voice-over line as a caption, the on-screen text as a super, and an
 * optional audio track in sync (the
 * track leads while it plays; past its end a clock takes over).
 * Keys: Space play/pause · ←/→ previous/next shot · C captions · Esc close.
 */
export default function Animatic({ shots, ratio, audioUrl, fileUrl, startIndex = 0, autoplay = true, title, onClose }) {
  const starts = [];
  let total = 0;
  for (const s of shots) { starts.push(total); total += Number(s.duration) || 0; }

  const [t, setT] = useState(starts[startIndex] || 0);
  const [playing, setPlaying] = useState(false);
  const [captions, setCaptions] = useState(true);
  const audioRef = useRef(null);
  const trackRef = useRef(null);
  const tRef = useRef(t);
  const clock = useRef({ t0: t, at: 0 }); // position t0 at performance.now() = at
  const dragging = useRef(false);
  const rootRef = useRef(null);
  const voiceRef = useRef(null); // the recorded voice-over of the shot playing

  const indexAt = (time) => {
    let i = 0;
    while (i < shots.length - 1 && starts[i + 1] <= time + 1e-6) i += 1;
    return i;
  };
  const idx = indexAt(t);
  const shot = shots[idx];
  const ended = t >= total - 0.01;

  const setPos = useCallback((nt) => { tRef.current = nt; setT(nt); }, []);
  const seek = useCallback((nt) => {
    const v = clamp(nt, 0, total);
    setPos(v);
    clock.current = { t0: v, at: performance.now() };
    const a = audioRef.current;
    if (a) { try { a.currentTime = v; } catch { /* not loaded yet */ } }
  }, [total, setPos]);
  const pause = useCallback(() => { audioRef.current?.pause(); setPlaying(false); }, []);
  const play = useCallback(() => {
    if (tRef.current >= total - 0.01) seek(0);
    clock.current = { t0: tRef.current, at: performance.now() };
    const a = audioRef.current;
    if (a && tRef.current < (a.duration || Infinity)) {
      try { a.currentTime = tRef.current; } catch { /* ignore */ }
      a.play().catch(() => {});
    }
    setPlaying(true);
  }, [total, seek]);
  const toggle = useCallback(() => (playing ? pause() : play()), [playing, pause, play]);
  const step = useCallback((d) => {
    const i = indexAt(tRef.current);
    if (d < 0 && tRef.current - starts[i] > 0.6) seek(starts[i]);
    else seek(starts[clamp(i + d, 0, shots.length - 1)]);
  }, [seek, shots.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // The playback loop: the audio track leads while it plays, else the clock.
  useEffect(() => {
    if (!playing) return undefined;
    let raf = 0;
    const tick = () => {
      const a = audioRef.current;
      let nt;
      if (a && !a.paused && !a.ended) { nt = a.currentTime; clock.current = { t0: nt, at: performance.now() }; }
      else nt = clock.current.t0 + (performance.now() - clock.current.at) / 1000;
      if (nt >= total) { setPos(total); pause(); return; }
      setPos(nt);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, total, pause, setPos]);

  useEffect(() => { if (autoplay && shots.length) play(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // A shot's recorded voice-over plays from its start (joining in where the playhead is).
  useEffect(() => {
    const v = voiceRef.current;
    if (!v) return;
    const sh = shots[idx];
    const url = sh?.voice?.file ? fileUrl(sh.voice.file) : null;
    const off = tRef.current - starts[idx];
    if (!playing || !url || off >= (sh.voice.duration || Infinity)) { v.pause(); return; }
    if (v.dataset.src !== url) { v.src = url; v.dataset.src = url; }
    v.volume = sh.voice.volume ?? 1;
    try { v.currentTime = Math.max(0, off); } catch { /* not loaded yet */ }
    v.play().catch(() => {});
  }, [idx, playing]); // eslint-disable-line react-hooks/exhaustive-deps

  // Preload every frame so cuts don't flash; lock the page behind and take
  // keyboard focus (so Space isn't sent to the button that opened the player),
  // handing it back on close.
  useEffect(() => {
    shots.forEach((s) => { if (s.image) { const im = new Image(); im.src = fileUrl(s.image); } });
    const prev = [document.documentElement.style.overflow, document.body.style.overflow];
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    const opener = document.activeElement;
    rootRef.current?.focus({ preventScroll: true });
    const audio = audioRef.current;
    return () => {
      [document.documentElement.style.overflow, document.body.style.overflow] = prev;
      audio?.pause();
      opener?.focus?.({ preventScroll: true });
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); }
      else if (e.key === ' ' || e.key === 'k') {
        if (e.key === ' ' && e.target.closest?.('button')) return; // the focused button handles it
        e.preventDefault(); toggle();
      }
      else if (e.key === 'ArrowRight') { e.preventDefault(); step(1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
      else if (e.key === 'c' || e.key === 'C') setCaptions((v) => !v);
      else if (e.key === 'Home') seek(0);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggle, step, seek, onClose]);

  const scrubTo = (clientX) => {
    const r = trackRef.current?.getBoundingClientRect();
    if (r && total) seek(clamp((clientX - r.left) / r.width, 0, 1) * total);
  };

  if (!shot) return null;
  return (
    <div className="animatic" role="dialog" aria-modal="true" aria-label={`Animatic${title ? `: ${title}` : ''}`} ref={rootRef} tabIndex={-1}>
      <div className="animatic-top">
        <span className="animatic-title">{title}</span>
        <button className="icon-btn animatic-close" onClick={onClose} aria-label="Close"><X size={20} /></button>
      </div>

      <div className="animatic-stage" style={{ '--ar': ratio }} onClick={toggle}>
        {shot.image ? <img key={shot.id} src={fileUrl(shot.image)} alt={`Shot ${idx + 1}`} draggable={false} />
          : (
            <div className="animatic-blank">
              <span>Shot {idx + 1}</span>
              <p>{shot.visual || 'No frame yet'}</p>
            </div>
          )}
        {shot.onscreen?.trim() && <div className="animatic-super">{shot.onscreen}</div>}
        {captions && shot.vo?.trim() && <div className="animatic-caption">{shot.vo}</div>}
        <span className="animatic-shotno">{idx + 1} / {shots.length}</span>
        {!playing && (
          <span className="animatic-bigplay" aria-hidden="true">{ended ? <RotateCcw size={30} /> : <Play size={34} fill="currentColor" />}</span>
        )}
      </div>

      <div className="animatic-controls">
        <div className="animatic-track" ref={trackRef}
          onPointerDown={(e) => { dragging.current = true; e.currentTarget.setPointerCapture?.(e.pointerId); scrubTo(e.clientX); }}
          onPointerMove={(e) => { if (dragging.current) scrubTo(e.clientX); }}
          onPointerUp={() => { dragging.current = false; }}
          onPointerCancel={() => { dragging.current = false; }}>
          {shots.map((s, i) => (
            <span key={s.id} className={`animatic-seg ${i === idx ? 'on' : ''} ${i < idx ? 'past' : ''}`}
              style={{ flexGrow: Math.max(0.0001, Number(s.duration) || 0) }} />
          ))}
          <span className="animatic-head" style={{ left: `${total ? (t / total) * 100 : 0}%` }} />
        </div>
        <div className="animatic-buttons">
          <button className="icon-btn" onClick={() => step(-1)} aria-label="Previous shot"><SkipBack size={18} /></button>
          <button className="animatic-play" onClick={toggle} aria-label={playing ? 'Pause' : 'Play'}>
            {playing ? <Pause size={20} fill="currentColor" /> : ended ? <RotateCcw size={20} /> : <Play size={20} fill="currentColor" />}
          </button>
          <button className="icon-btn" onClick={() => step(1)} aria-label="Next shot"><SkipForward size={18} /></button>
          <span className="animatic-time">{fmtClock(t)} / {fmtClock(total)}</span>
          <span className="animatic-spacer" />
          <button className={`icon-btn animatic-cc ${captions ? 'on' : ''}`} onClick={() => setCaptions((v) => !v)}
            aria-pressed={captions} title="Voice-over captions (C)"><Captions size={18} /></button>
        </div>
      </div>
      {audioUrl && <audio ref={audioRef} src={audioUrl} preload="auto" />}
      <audio ref={voiceRef} preload="auto" />
    </div>
  );
}
