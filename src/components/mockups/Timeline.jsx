import { useRef, useState } from 'react';
import { Play, Pause, SkipBack, Diamond, Plus, Trash2, Volume2, VolumeX, Video, Camera, DoorOpen } from 'lucide-react';

const fmt = (s) => {
  const v = Math.max(0, s || 0);
  const m = Math.floor(v / 60);
  return `${String(m).padStart(2, '0')}:${(v - m * 60).toFixed(1).padStart(4, '0')}`;
};
const NEAR = 0.06; // seconds: a key this close to the playhead counts as "on" it

/**
 * The mockup's timeline, under the 3D view: a ruler with the playhead, the
 * camera's keyframes, each hinge's keyframes (a lid opening / closing) and
 * each screen video as a clip you slide to pick the part that plays — with
 * its sound on / off. Keys: click to jump there, drag to move, Delete to
 * remove.
 *
 * tracks: [{ id, kind: 'camera' | 'hinge' | 'video', label, keys?: [{ t }],
 *            start?, length?, sound?, volume? }]
 */
export default function Timeline({
  duration, time, playing, tracks, motion, motions, easing, cameraMoves,
  onSeek, onPlay, onPause, onDuration, onMotion, onEasing, onCameraMove,
  onAddKey, onMoveKey, onDeleteKey, onVideoStart, onSound, onVolume,
}) {
  const [sel, setSel] = useState(null); // { track, index }
  const lanes = useRef(null);
  const tAt = (clientX) => {
    const r = lanes.current?.getBoundingClientRect();
    if (!r) return 0;
    return Math.min(duration, Math.max(0, ((clientX - r.left) / r.width) * duration));
  };
  const pct = (t) => `${(Math.min(duration, Math.max(0, t)) / duration) * 100}%`;

  // Drag on the ruler / empty lane: scrub.
  const scrub = (e) => {
    e.preventDefault();
    onSeek(tAt(e.clientX));
    const move = (ev) => onSeek(tAt(ev.clientX));
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  // Drag a key: move it in time (snaps to the playhead).
  const dragKey = (e, track, index, t0) => {
    e.stopPropagation(); e.preventDefault();
    setSel({ track: track.id, index });
    onSeek(t0);
    const x0 = e.clientX; let moved = false;
    const move = (ev) => {
      if (Math.abs(ev.clientX - x0) < 3 && !moved) return;
      moved = true;
      let t = tAt(ev.clientX);
      if (Math.abs(t - time) < NEAR * 2) t = time;
      onMoveKey(track.id, index, Math.round(t * 100) / 100);
    };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  // Drag a video clip: slide which part of the video plays.
  const slideClip = (e, track) => {
    e.stopPropagation(); e.preventDefault();
    const r = lanes.current.getBoundingClientRect();
    const x0 = e.clientX; const s0 = track.start || 0;
    const move = (ev) => {
      const ds = ((ev.clientX - x0) / r.width) * duration;
      let s = s0 - ds;
      if (track.length) s = ((s % track.length) + track.length) % track.length;
      onVideoStart(track.id, Math.max(0, Math.round(s * 10) / 10));
    };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  const onKeyDown = (e) => {
    if ((e.key === 'Delete' || e.key === 'Backspace') && sel) { e.preventDefault(); onDeleteKey(sel.track, sel.index); setSel(null); }
    if (e.key === ' ') { e.preventDefault(); if (playing) onPause(); else onPlay(); }
  };

  const ticks = [];
  const step = duration <= 8 ? 1 : duration <= 20 ? 2 : 5;
  for (let s = 0; s <= duration + 1e-6; s += step) ticks.push(s);
  const selTrack = tracks.find((t) => t.id === sel?.track);

  return (
    <div className="tl" tabIndex={0} onKeyDown={onKeyDown}>
      <div className="tl-bar">
        <button type="button" className="icon-btn" onClick={() => onSeek(0)} aria-label="To the start"><SkipBack size={15} /></button>
        <button type="button" className="tl-play" onClick={playing ? onPause : onPlay} aria-label={playing ? 'Pause' : 'Play'}>
          {playing ? <Pause size={15} fill="currentColor" /> : <Play size={15} fill="currentColor" />}
        </button>
        <span className="tl-time"><b>{fmt(time)}</b> / {fmt(duration)}</span>
        <label className="tl-field">Length
          <input className="input" type="number" min="1" max="60" step="0.5" value={duration} onChange={(e) => onDuration(Math.min(60, Math.max(1, Number(e.target.value) || 1)))} /> s
        </label>
        <label className="tl-field">Motion
          <select className="input" value={motion} onChange={(e) => onMotion(e.target.value)}>
            {Object.entries(motions).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
        </label>
        <label className="tl-field">Camera move
          <select className="input" value="" onChange={(e) => { if (e.target.value) onCameraMove(e.target.value); }}>
            <option value="">Add…</option>
            {Object.entries(cameraMoves).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
        </label>
        <div className="segmented segmented-sm tl-ease" role="group" aria-label="Easing">
          <button type="button" className={easing === 'ease' ? 'on' : ''} onClick={() => onEasing('ease')}>Smooth</button>
          <button type="button" className={easing === 'linear' ? 'on' : ''} onClick={() => onEasing('linear')}>Even</button>
        </div>
        {sel && selTrack && (
          <button type="button" className="btn btn-sm tl-del" onClick={() => { onDeleteKey(sel.track, sel.index); setSel(null); }}><Trash2 size={13} /> Delete key</button>
        )}
      </div>

      <div className="tl-grid">
        <div className="tl-heads">
          <div className="tl-ruler-head" />
          {tracks.map((tr) => {
            const Icon = tr.kind === 'camera' ? Camera : tr.kind === 'hinge' ? DoorOpen : Video;
            const onKey = tr.keys?.some((k) => Math.abs(k.t - time) < NEAR);
            return (
              <div key={tr.id} className={`tl-head tl-${tr.kind}`}>
                <Icon size={13} /><span title={tr.label}>{tr.label}</span>
                {tr.kind !== 'video' ? (
                  <button type="button" className={`tl-addkey ${onKey ? 'on' : ''}`} onClick={() => onAddKey(tr.id)}
                    title={tr.kind === 'camera' ? 'Keyframe the current view here' : 'Keyframe the current opening here'} aria-label={`Add a key to ${tr.label}`}>
                    <Diamond size={11} fill={onKey ? 'currentColor' : 'none'} /><Plus size={10} />
                  </button>
                ) : (
                  <span className="tl-sound">
                    <button type="button" className={`icon-btn ${tr.sound ? 'on' : ''}`} onClick={() => onSound(tr.id, !tr.sound)} aria-label={tr.sound ? 'Sound off' : 'Sound on'} title={tr.sound ? 'Sound on — plays and is exported' : 'Sound off'}>
                      {tr.sound ? <Volume2 size={14} /> : <VolumeX size={14} />}
                    </button>
                    {tr.sound && <input type="range" min="0" max="1" step="0.05" value={tr.volume ?? 1} onChange={(e) => onVolume(tr.id, Number(e.target.value))} aria-label="Volume" />}
                  </span>
                )}
              </div>
            );
          })}
        </div>
        <div className="tl-lanes" ref={lanes}>
          <div className="tl-ruler" onPointerDown={scrub}>
            {ticks.map((s) => <span key={s} className="tl-tick" style={{ left: pct(s) }}>{s}s</span>)}
          </div>
          {tracks.map((tr) => (
            <div key={tr.id} className={`tl-lane tl-${tr.kind}`} onPointerDown={scrub}>
              {tr.kind === 'video' ? (
                <div className="tl-clip" onPointerDown={(e) => slideClip(e, tr)} title="Drag to pick which part of the video plays">
                  <span>from {fmt(tr.start)}{tr.length ? ` · video ${fmt(tr.length)}` : ''}</span>
                  {tr.length > 0 && tr.length - (tr.start || 0) < duration && (
                    <i className="tl-loop" style={{ left: pct(tr.length - (tr.start || 0)) }} title="The video starts over here" />
                  )}
                </div>
              ) : (
                <>
                  {tr.keys.length > 1 && <div className="tl-span" style={{ left: pct(tr.keys[0].t), width: `calc(${pct(tr.keys[tr.keys.length - 1].t)} - ${pct(tr.keys[0].t)})` }} />}
                  {tr.keys.map((k, i) => (
                    <button key={i} type="button" className={`tl-key ${sel?.track === tr.id && sel.index === i ? 'on' : ''}`} style={{ left: pct(k.t) }}
                      onPointerDown={(e) => dragKey(e, tr, i, k.t)} aria-label={`Key at ${fmt(k.t)}`} title={`${fmt(k.t)}${k.label ? ` · ${k.label}` : ''}`} />
                  ))}
                </>
              )}
            </div>
          ))}
          <div className="tl-playhead" style={{ left: pct(time) }}><i /></div>
        </div>
      </div>
      {!tracks.some((t) => t.keys?.length) && motion === 'none' && (
        <div className="tl-hint">Set the view, press <Diamond size={10} />+ on Camera, move the playhead, change the view, press it again — or pick a Motion / Camera move. Space plays.</div>
      )}
    </div>
  );
}
