import { useState } from 'react';
import { MoreHorizontal, Timer, UploadCloud, Library, ChevronDown, ChevronUp, PenLine, Scissors } from 'lucide-react';
import Menu from '../Menu.jsx';
import AutoTextarea from '../AutoTextarea.jsx';
import { NumberField } from '../plan/Timing.jsx';
import { fmtClock } from '../../lib/timing.js';
import { SHOT_SIZES, CAMERA_MOVES, TRANSITIONS, segmentColor } from '../../lib/storyboard.js';
import { SectionPick, StatusPick, TermSelect } from './ShotControls.jsx';
import VoiceRec from './VoiceRec.jsx';

/**
 * One panel of the storyboard grid: the frame (and its variants), timing,
 * section and status, what we see / hear / read, the recorded voice-over, the
 * camera, and (folded) SFX and notes. In a cutdown: whether the shot is in it
 * and how long it runs there.
 *
 * sb = { duration, onDuration(v, now), cut: { name, inCut, onToggle } | null,
 *        onVariant(altId), onDraw(over), onVoice(file, secs), onVoiceRemove(), voiceUrl, handle, sortClass, sortStyle }
 */
export default function ShotCard({ shot: s, index: i, start, ratio, fileUrl, highlight, last, wide = false, onPatch, menuItems, onOpen, onUpload, onLibrary, dropProps, sb = {} }) {
  const [more, setMore] = useState(!!(s.sfx || s.notes));
  const band = s.section ? segmentColor(s.section).fg : null;
  const n = i + 1;
  const out = sb.cut && !sb.cut.inCut;
  const duration = sb.duration ?? s.duration;
  return (
    <div className={`shot sb-card ${wide ? 'wide' : ''} ${highlight ? 'highlight' : ''} ${out ? 'out-of-cut' : ''} ${sb.sortClass || ''}`} id={wide ? undefined : `shot-${s.id}`}
      data-sort-id={wide ? undefined : s.id} style={sb.sortStyle} {...dropProps}>
      <div className="shot-frame" style={{ aspectRatio: String(ratio) }}>
        {band && <span className="sb-band" style={{ background: band }} />}
        {sb.handle}
        {s.image ? (
          <button type="button" className="sb-frame-btn" onClick={onOpen} title="Play the animatic from here">
            <img src={fileUrl(s.image)} alt={`Shot ${n}`} loading="lazy" />
          </button>
        ) : (
          <span className="sb-frame-empty">
            <button type="button" className="btn btn-sm" onClick={onUpload}><UploadCloud size={14} /> Upload</button>
            <button type="button" className="btn btn-sm btn-ghost" onClick={onLibrary}><Library size={14} /> Library</button>
            {sb.onDraw && <button type="button" className="btn btn-sm btn-ghost" onClick={() => sb.onDraw(false)}><PenLine size={14} /> Draw</button>}
            <span className="hint">or drop an image</span>
          </span>
        )}
        <span className="shot-no">{n}</span>
        {s.image && sb.onDraw && (
          <button type="button" className="icon-btn sb-draw-over" onClick={() => sb.onDraw(true)} title="Sketch over this frame" aria-label={`Sketch over shot ${n}`}><PenLine size={14} /></button>
        )}
        {out && <span className="sb-outcut"><Scissors size={13} /> Not in {sb.cut.name}</span>}
      </div>
      {(s.alts || []).length > 0 && (
        <div className="sb-variants" role="group" aria-label={`Variants of shot ${n}`}>
          <span className="sb-variant on" title="In use"><img src={s.image ? fileUrl(s.image) : undefined} alt="" /></span>
          {s.alts.map((a) => (
            <button key={a.id} type="button" className="sb-variant" onClick={() => sb.onVariant?.(a.id)} title="Use this variant">
              <img src={fileUrl(a.image)} alt="" loading="lazy" />
            </button>
          ))}
        </div>
      )}
      <div className="sb-card-fields">
        <div className="shot-bar">
          <span className="shot-at" title={start == null ? 'Not in this cut' : 'Starts at'}>{start == null ? '—' : fmtClock(start)}</span>
          <label className={`shot-dur ${sb.cut && sb.duration !== s.duration ? 'cut' : ''}`} title={sb.cut ? `Duration in ${sb.cut.name} (master: ${s.duration} s)` : 'Duration in seconds'}>
            <Timer size={13} />
            <NumberField value={duration} min={0.1} max={600} onChange={(v) => (sb.onDuration ? sb.onDuration(v) : onPatch({ duration: v }))} aria-label={`Shot ${n} duration in seconds`} />
            <span>s</span>
          </label>
          {sb.cut && (
            <label className="sb-incut" title={`In ${sb.cut.name}`}>
              <input type="checkbox" checked={sb.cut.inCut} onChange={sb.cut.onToggle} /> In cut
            </label>
          )}
          <Menu align="right" title={`Shot ${n}`}
            trigger={<button type="button" className="icon-btn shot-menu" aria-label={`Shot ${n} options`}><MoreHorizontal size={15} /></button>}
            items={menuItems} />
        </div>
        <div className="sb-chips">
          <SectionPick value={s.section} onChange={(v) => onPatch({ section: v }, true)} />
          <StatusPick value={s.status} onChange={(v) => onPatch({ status: v }, true)} />
        </div>
        <AutoTextarea className="shot-text" value={s.visual || ''} placeholder="What we see…" aria-label={`Shot ${n}: what we see`}
          onChange={(e) => onPatch({ visual: e.target.value })} />
        <AutoTextarea className="shot-text shot-vo" value={s.vo || ''} placeholder="Voice-over…" aria-label={`Shot ${n}: voice-over`}
          onChange={(e) => onPatch({ vo: e.target.value })} />
        {sb.onVoice && (
          <VoiceRec voice={s.voice} url={sb.voiceUrl} duration={Number(duration) || 0} n={n}
            onRecorded={sb.onVoice} onRemove={sb.onVoiceRemove} onFit={(v) => (sb.onDuration ? sb.onDuration(v, true) : onPatch({ duration: v }, true))} />
        )}
        <AutoTextarea className="shot-text shot-super" value={s.onscreen || ''} placeholder="On-screen text…" aria-label={`Shot ${n}: on-screen text`}
          onChange={(e) => onPatch({ onscreen: e.target.value })} />
        <div className="sb-terms">
          <TermSelect label="Shot size" value={s.size} options={SHOT_SIZES} onChange={(v) => onPatch({ size: v }, true)} prefix="Shot" />
          <TermSelect label="Camera move" value={s.camera} options={CAMERA_MOVES} onChange={(v) => onPatch({ camera: v }, true)} prefix="Cam" />
          {!last && <TermSelect label="Transition to the next shot" value={s.transition} options={TRANSITIONS} onChange={(v) => onPatch({ transition: v }, true)} prefix="→" />}
        </div>
        <button type="button" className="sb-more" onClick={() => setMore((v) => !v)} aria-expanded={more}>
          {more ? <ChevronUp size={13} /> : <ChevronDown size={13} />} SFX & notes{!more && (s.sfx || s.notes) ? ' ·' : ''}
        </button>
        {more && (
          <>
            <AutoTextarea className="shot-text" value={s.sfx || ''} placeholder="SFX / music cue…" aria-label={`Shot ${n}: sound`}
              onChange={(e) => onPatch({ sfx: e.target.value })} />
            <AutoTextarea className="shot-text shot-notes" value={s.notes || ''} placeholder="Notes…" aria-label={`Shot ${n}: notes`}
              onChange={(e) => onPatch({ notes: e.target.value })} />
          </>
        )}
      </div>
    </div>
  );
}
