import { MoreHorizontal, Timer, UploadCloud, Scissors } from 'lucide-react';
import Menu from '../Menu.jsx';
import AutoTextarea from '../AutoTextarea.jsx';
import { NumberField } from '../plan/Timing.jsx';
import { fmtClock } from '../../lib/timing.js';
import { SHOT_SIZES, CAMERA_MOVES, TRANSITIONS, segmentColor } from '../../lib/storyboard.js';
import { SectionPick, StatusPick, TermSelect } from './ShotControls.jsx';
import VoiceRec from './VoiceRec.jsx';

/**
 * The storyboard as a table — one row per shot, every field visible: good for
 * writing and checking the whole thing. On narrow screens rows become cards.
 */
export default function ShotList({ shots, startOf, sbOf, listRef, ratio, fileUrl, highlightId, onPatch, menuItems, onOpen, onUpload, dropProps }) {
  return (
    <div className="sbl" ref={listRef}>
      <div className="sbl-row sbl-head" aria-hidden="true">
        <span>Shot</span><span>What we see</span><span>What we hear</span><span>On screen</span><span>Camera</span><span>Section · status</span><span />
      </div>
      {shots.map((s, i) => {
        const band = s.section ? segmentColor(s.section).fg : 'transparent';
        const n = i + 1;
        const patch = (p, now) => onPatch(s.id, p, now);
        const sb = sbOf(s);
        const start = startOf.get(s.id);
        const out = sb.cut && !sb.cut.inCut;
        return (
          <div key={s.id} id={`shot-${s.id}`} data-sort-id={s.id} className={`sbl-row ${highlightId === s.id ? 'highlight' : ''} ${out ? 'out-of-cut' : ''} ${sb.sortClass}`}
            style={{ '--band': band, ...sb.sortStyle }} {...dropProps(s.id)}>
            <div className="sbl-shot">
              {sb.handle}
              <button type="button" className="sbl-thumb" style={{ aspectRatio: String(ratio) }}
                onClick={() => (s.image ? onOpen(i) : onUpload(s.id))} title={s.image ? 'Play the animatic from here' : 'Upload a frame'}>
                {s.image ? <img src={fileUrl(s.image)} alt={`Shot ${n}`} loading="lazy" /> : <UploadCloud size={16} />}
                <span className="shot-no">{n}</span>
              </button>
              <div className="sbl-time">
                <span className="shot-at">{start == null ? '—' : fmtClock(start)}</span>
                <label className={`shot-dur ${sb.cut && sb.duration !== s.duration ? 'cut' : ''}`} title={sb.cut ? `Duration in ${sb.cut.name}` : 'Duration in seconds'}>
                  <Timer size={12} />
                  <NumberField value={sb.duration} min={0.1} max={600} onChange={(v) => sb.onDuration(v)} aria-label={`Shot ${n} duration in seconds`} />
                  <span>s</span>
                </label>
                {sb.cut && <label className="sb-incut" title={`In ${sb.cut.name}`}><input type="checkbox" checked={sb.cut.inCut} onChange={sb.cut.onToggle} /> <Scissors size={11} /></label>}
              </div>
            </div>
            <div className="sbl-cell" data-label="What we see">
              <AutoTextarea className="shot-text" value={s.visual || ''} placeholder="What we see…" aria-label={`Shot ${n}: what we see`} onChange={(e) => patch({ visual: e.target.value })} />
              <AutoTextarea className="shot-text shot-notes" value={s.notes || ''} placeholder="Notes…" aria-label={`Shot ${n}: notes`} onChange={(e) => patch({ notes: e.target.value })} />
            </div>
            <div className="sbl-cell" data-label="What we hear">
              <AutoTextarea className="shot-text shot-vo" value={s.vo || ''} placeholder="Voice-over…" aria-label={`Shot ${n}: voice-over`} onChange={(e) => patch({ vo: e.target.value })} />
              <VoiceRec voice={s.voice} url={sb.voiceUrl} duration={Number(sb.duration) || 0} n={n}
                onRecorded={sb.onVoice} onRemove={sb.onVoiceRemove} onFit={(v) => sb.onDuration(v, true)} />
              <AutoTextarea className="shot-text" value={s.sfx || ''} placeholder="SFX / music…" aria-label={`Shot ${n}: sound`} onChange={(e) => patch({ sfx: e.target.value })} />
            </div>
            <div className="sbl-cell" data-label="On screen">
              <AutoTextarea className="shot-text shot-super" value={s.onscreen || ''} placeholder="On-screen text…" aria-label={`Shot ${n}: on-screen text`} onChange={(e) => patch({ onscreen: e.target.value })} />
            </div>
            <div className="sbl-cell sbl-terms" data-label="Camera">
              <TermSelect label="Shot size" value={s.size} options={SHOT_SIZES} onChange={(v) => patch({ size: v }, true)} prefix="Shot" />
              <TermSelect label="Camera move" value={s.camera} options={CAMERA_MOVES} onChange={(v) => patch({ camera: v }, true)} prefix="Cam" />
              {i < shots.length - 1 && <TermSelect label="Transition to the next shot" value={s.transition} options={TRANSITIONS} onChange={(v) => patch({ transition: v }, true)} prefix="→" />}
            </div>
            <div className="sbl-cell sbl-chips">
              <SectionPick value={s.section} onChange={(v) => patch({ section: v }, true)} compact />
              <StatusPick value={s.status} onChange={(v) => patch({ status: v }, true)} />
            </div>
            <Menu align="right" title={`Shot ${n}`}
              trigger={<button type="button" className="icon-btn shot-menu" aria-label={`Shot ${n} options`}><MoreHorizontal size={15} /></button>}
              items={menuItems(s, i)} />
          </div>
        );
      })}
    </div>
  );
}
