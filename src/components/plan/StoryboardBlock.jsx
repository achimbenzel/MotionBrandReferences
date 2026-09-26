import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Play, PenLine, Music, ImagePlus } from 'lucide-react';
import Animatic from './Animatic.jsx';
import { briefingTarget, fmtClock } from '../../lib/timing.js';
import { ratioOf, timing, progress, segmentColor, sectionLabel, storyboardPath } from '../../lib/storyboard.js';

/**
 * A storyboard in the plan: a preview — the frames in order, format, length
 * against the target and how far the shots are. Editing happens in the
 * storyboard editor (a click on the block or a frame opens it there).
 */
export default function StoryboardBlock({ plan, block: b, menu, icon: Icon, fileUrl }) {
  const navigate = useNavigate();
  const [animatic, setAnimatic] = useState(null);
  const shots = b.shots || [];
  const ratio = ratioOf(b.aspect);
  const { starts, total } = timing(shots);
  const target = b.target ?? briefingTarget(plan);
  const prog = progress(shots);
  const open = (shotId) => navigate(storyboardPath(plan.id, b.id, shotId));

  return (
    <div className="section block storyboard sb-preview" id={`block-${b.id}`}>
      <div className="section-head">
        <h2><Icon size={16} /> {b.title} {shots.length > 0 && <span className="count">{shots.length} shot{shots.length === 1 ? '' : 's'}</span>}</h2>
        <div className="moodboard-actions">
          {shots.length > 0 && <button className="btn btn-sm" onClick={() => setAnimatic({ index: 0 })}><Play size={14} /> Animatic</button>}
          <button className="btn btn-sm btn-primary" onClick={() => open()}><PenLine size={14} /> Open storyboard</button>
          {menu}
        </div>
      </div>

      <div className="sbv-meta">
        <span className="sbv-chip">{b.aspect || '16:9'}</span>
        <span className={target && total > target + 0.5 ? 'sbv-over' : ''}>{fmtClock(total)}{target ? ` of ${fmtClock(target)}` : ''}</span>
        {prog.total > 0 && <span>{prog.done}/{prog.total} approved</span>}
        {b.audio && <span className="sbv-track"><Music size={12} /> {b.audio.name || 'Track'}</span>}
      </div>

      {shots.length ? (
        <div className="sbv-strip" style={{ '--sbv-h': ratio < 1 ? '150px' : '96px' }}>
          {shots.map((s, i) => (
            <button key={s.id} type="button" className="sbv-shot" onClick={() => open(s.id)} title={`Shot ${i + 1} · ${fmtClock(starts[i])}${s.section ? ` · ${sectionLabel(s.section)}` : ''}${s.visual ? ` — ${s.visual}` : ''}`}>
              <span className="sbv-frame" style={{ aspectRatio: String(ratio) }}>
                {s.image ? <img src={fileUrl(s.image)} alt="" loading="lazy" /> : <span className="sbv-empty">{s.visual ? s.visual.slice(0, 60) : ''}</span>}
                <span className="shot-no">{i + 1}</span>
              </span>
              <span className="sbv-band" style={{ background: s.section ? segmentColor(s.section).fg : 'var(--surface-3)' }} />
            </button>
          ))}
        </div>
      ) : (
        <button type="button" className="dropzone sbv-start" onClick={() => open()}>
          <ImagePlus size={20} /><div>Open the storyboard to add shots — frames, timing, camera and voice-over</div>
        </button>
      )}

      {animatic && (
        <Animatic shots={shots} ratio={ratio} audioUrl={b.audio ? fileUrl(b.audio.file) : null} fileUrl={fileUrl}
          startIndex={animatic.index} autoplay title={`${plan.name} — ${b.title}`} onClose={() => setAnimatic(null)} />
      )}
    </div>
  );
}
