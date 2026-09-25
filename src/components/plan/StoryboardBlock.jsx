import { useRef, useState } from 'react';
import {
  Play, Plus, ImagePlus, MoreHorizontal, ArrowLeft, ArrowRight, Copy as CopyIcon, Trash2,
  Music, X, Image as ImageIcon, CornerDownRight, Timer,
} from 'lucide-react';
import Menu from '../Menu.jsx';
import AutoTextarea from '../AutoTextarea.jsx';
import Animatic from './Animatic.jsx';
import { NumberField, TargetMeter } from './Timing.jsx';
import { briefingTarget, fmtClock, fmtDur } from '../../lib/timing.js';

const rid = () => Math.random().toString(36).slice(2, 8);
const ASPECTS = ['16:9', '9:16', '1:1', '4:5'];
const ratioOf = (a) => { const [w, h] = String(a || '16:9').split(':').map(Number); return w / h || 16 / 9; };
const newShot = (p = {}) => ({ id: rid(), image: null, duration: 2, visual: '', vo: '', notes: '', ...p });

/**
 * Storyboard block: shots with a frame (sketch / styleframe), a duration, what
 * we see and what we hear. The timing strip and total run against a target
 * length; "Play animatic" plays the frames in time, with an optional music /
 * voice-over track. Uploads only store files — the shot list is saved here.
 */
export default function StoryboardBlock({ plan, block: b, menu, icon: Icon, editBlock, planRef, toast, upload, fileUrl }) {
  const shots = b.shots || [];
  const ratio = ratioOf(b.aspect);
  const [animatic, setAnimatic] = useState(null); // { index, autoplay }
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(null); // 'block' | shot id
  const framesRef = useRef(null);
  const frameRef = useRef(null);
  const audioRef = useRef(null);
  const replaceTarget = useRef(null);

  const latest = () => (planRef.current?.blocks || []).find((x) => x.id === b.id) || b;
  const setShots = (next, immediate = false) => editBlock(b.id, { shots: next }, immediate);
  const patchShot = (sid, p, immediate = false) => setShots((latest().shots || []).map((s) => (s.id === sid ? { ...s, ...p } : s)), immediate);

  const starts = [];
  let total = 0;
  for (const s of shots) { starts.push(total); total += Number(s.duration) || 0; }
  const briefing = briefingTarget(plan);
  const target = b.target ?? briefing;
  const span = Math.max(total, target || 0) || 1;

  // Images → new shots at the end, or the frame of one shot.
  const addFrames = async (fileList, shotId = null) => {
    const imgs = [...(fileList || [])].filter((f) => f.type?.startsWith('image/'));
    if (!imgs.length) return;
    setBusy(true);
    try {
      const up = await upload(shotId ? imgs.slice(0, 1) : imgs);
      const cur = latest().shots || [];
      if (shotId) setShots(cur.map((s) => (s.id === shotId ? { ...s, image: up[0].file } : s)), true);
      else setShots([...cur, ...up.map((u) => newShot({ image: u.file }))], true);
    } catch (e) { toast(`Upload failed: ${e.message}`, 'error'); }
    finally { setBusy(false); }
  };
  const pickFrame = (sid) => { replaceTarget.current = sid; frameRef.current?.click(); };
  const setTrack = async (file) => {
    if (!file) return;
    setBusy(true);
    try {
      const [u] = await upload([file]);
      editBlock(b.id, { audio: { file: u.file, name: u.name, size: u.size } }, true);
    } catch (e) { toast(`Upload failed: ${e.message}`, 'error'); }
    finally { setBusy(false); }
  };

  const move = (i, d) => {
    const next = [...(latest().shots || [])]; const j = i + d;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    setShots(next, true);
  };
  const insertAt = (i, shot) => { const next = [...(latest().shots || [])]; next.splice(i, 0, shot); setShots(next, true); };
  const remove = (s, i) => {
    setShots((latest().shots || []).filter((x) => x.id !== s.id), true);
    toast(`Shot ${i + 1} removed`, 'ok', { label: 'Undo', onClick: () => insertAt(Math.min(i, (latest().shots || []).length), s) });
  };

  const shotMenu = (s, i) => [
    { label: s.image ? 'Replace frame…' : 'Add frame…', icon: <ImagePlus size={15} />, onClick: () => pickFrame(s.id) },
    ...(s.image ? [{ label: 'Remove frame', icon: <ImageIcon size={15} />, onClick: () => patchShot(s.id, { image: null }, true) }] : []),
    { label: 'Insert shot after', icon: <CornerDownRight size={15} />, onClick: () => insertAt(i + 1, newShot()) },
    { label: 'Duplicate', icon: <CopyIcon size={15} />, onClick: () => insertAt(i + 1, { ...s, id: rid() }) },
    ...(i > 0 ? [{ label: 'Move left', icon: <ArrowLeft size={15} />, onClick: () => move(i, -1) }] : []),
    ...(i < shots.length - 1 ? [{ label: 'Move right', icon: <ArrowRight size={15} />, onClick: () => move(i, 1) }] : []),
    { separator: true },
    { label: 'Delete shot', icon: <Trash2 size={15} />, danger: true, onClick: () => remove(s, i) },
  ];

  const dropProps = (key, onFiles) => ({
    onDragOver: (e) => { if ([...(e.dataTransfer?.types || [])].includes('Files')) { e.preventDefault(); e.stopPropagation(); setDragOver(key); } },
    onDragLeave: (e) => { if (e.target === e.currentTarget) setDragOver(null); },
    onDrop: (e) => { e.preventDefault(); e.stopPropagation(); setDragOver(null); onFiles(e.dataTransfer.files); },
  });

  return (
    <div className={`section block storyboard ${dragOver === 'block' ? 'dragover' : ''}`} id={`block-${b.id}`}
      {...dropProps('block', (files) => addFrames(files))}>
      <div className="section-head">
        <h2><Icon size={16} /> {b.title} {shots.length > 0 && <span className="count">{shots.length} shot{shots.length === 1 ? '' : 's'}</span>}</h2>
        <div className="moodboard-actions">
          <button className="btn btn-sm" onClick={() => framesRef.current?.click()} disabled={busy}><ImagePlus size={14} /> Add frames</button>
          <button className="btn btn-sm btn-primary" onClick={() => setAnimatic({ index: 0, autoplay: true })} disabled={!shots.length}>
            <Play size={14} /> Play animatic
          </button>
          {menu}
        </div>
      </div>

      <div className="timing-row">
        <div className="seg-toggle sb-aspect" role="group" aria-label="Format">
          {ASPECTS.map((a) => (
            <button key={a} className={b.aspect === a ? 'on' : ''} onClick={() => editBlock(b.id, { aspect: a }, true)} title={`Format ${a}`}>{a}</button>
          ))}
        </div>
        <TargetMeter total={total} own={b.target} briefing={briefing} onTarget={(v) => editBlock(b.id, { target: v })} />
        {b.audio ? (
          <span className="sb-track" title={b.audio.name}>
            <Music size={14} /><span className="sb-track-name">{b.audio.name || 'Track'}</span>
            <button className="icon-btn" aria-label="Remove track" onClick={() => editBlock(b.id, { audio: null }, true)}><X size={13} /></button>
          </span>
        ) : (
          <button className="btn btn-sm btn-ghost" onClick={() => audioRef.current?.click()} disabled={busy} title="Music or voice-over that plays with the animatic">
            <Music size={14} /> Add track
          </button>
        )}
      </div>

      {shots.length > 0 && (
        <div className="sb-strip" title="Shot timing — click to play from a shot">
          {shots.map((s, i) => (
            <button key={s.id} className="sb-strip-shot" style={{ width: `${((Number(s.duration) || 0) / span) * 100}%` }}
              onClick={() => setAnimatic({ index: i, autoplay: true })} aria-label={`Play from shot ${i + 1}`}>
              <span>{i + 1}</span>
            </button>
          ))}
          {target ? <span className={`sb-strip-target ${total > target + 0.5 ? 'over' : ''}`} style={{ left: `${(target / span) * 100}%` }} title={`Target ${fmtDur(target)}`} /> : null}
        </div>
      )}

      <div className="sb-grid" style={{ '--sb-min': ratio < 1 ? '150px' : '220px' }}>
        {shots.map((s, i) => (
          <div key={s.id} className={`shot ${dragOver === s.id ? 'dragover' : ''}`} {...dropProps(s.id, (files) => addFrames(files, s.id))}>
            <div className="shot-frame" style={{ aspectRatio: String(ratio) }}
              onClick={() => (s.image ? setAnimatic({ index: i, autoplay: false }) : pickFrame(s.id))}
              title={s.image ? 'Open in the animatic' : 'Add a frame'}>
              {s.image ? <img src={fileUrl(s.image)} alt={`Shot ${i + 1}`} loading="lazy" />
                : <span className="shot-add"><ImagePlus size={20} /><span>Add frame</span></span>}
              <span className="shot-no">{i + 1}</span>
            </div>
            <div className="shot-bar">
              <span className="shot-at" title="Starts at">{fmtClock(starts[i])}</span>
              <label className="shot-dur" title="Duration in seconds">
                <Timer size={13} />
                <NumberField value={s.duration} min={0.1} max={600} onChange={(v) => patchShot(s.id, { duration: v })} aria-label={`Shot ${i + 1} duration in seconds`} />
                <span>s</span>
              </label>
              <Menu align="right" title={`Shot ${i + 1}`}
                trigger={<button className="icon-btn shot-menu" aria-label={`Shot ${i + 1} options`}><MoreHorizontal size={15} /></button>}
                items={shotMenu(s, i)} />
            </div>
            <AutoTextarea className="shot-text" value={s.visual} placeholder="Visual / action…" aria-label={`Shot ${i + 1} visual`}
              onChange={(e) => patchShot(s.id, { visual: e.target.value })} />
            <AutoTextarea className="shot-text shot-vo" value={s.vo} placeholder="VO / on-screen text…" aria-label={`Shot ${i + 1} voice-over`}
              onChange={(e) => patchShot(s.id, { vo: e.target.value })} />
          </div>
        ))}
        <button className="shot shot-new" onClick={() => setShots([...(latest().shots || []), newShot()], true)} disabled={busy}>
          <Plus size={22} />
          <span>{busy ? 'Uploading…' : 'Add shot'}</span>
          <span className="shot-new-hint">or drop images here — one shot each</span>
        </button>
      </div>

      <input ref={framesRef} type="file" accept="image/*" multiple className="visually-hidden-input"
        onChange={(e) => { addFrames(e.target.files); e.target.value = ''; }} />
      <input ref={frameRef} type="file" accept="image/*" className="visually-hidden-input"
        onChange={(e) => { addFrames(e.target.files, replaceTarget.current); e.target.value = ''; }} />
      <input ref={audioRef} type="file" accept="audio/*" className="visually-hidden-input"
        onChange={(e) => { setTrack(e.target.files?.[0]); e.target.value = ''; }} />

      {animatic && (
        <Animatic shots={shots} ratio={ratio} audioUrl={b.audio ? fileUrl(b.audio.file) : null} fileUrl={fileUrl}
          startIndex={animatic.index} autoplay={animatic.autoplay} title={`${plan.name} — ${b.title}`}
          onClose={() => setAnimatic(null)} />
      )}
    </div>
  );
}
