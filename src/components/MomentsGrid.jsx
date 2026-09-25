import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Crosshair, Sparkles, X } from 'lucide-react';
import { fileUrl } from '../lib/api.js';
import { fmtClock } from '../lib/timing.js';
import { setLastTab } from '../lib/types.js';

/**
 * Every moment marked in the Motion library — "all speed ramps", "all match
 * cuts" — as cards with the captured frame; a card opens the video at that
 * moment. Filter by technique with the chips.
 */
export default function MomentsGrid({ projects }) {
  const navigate = useNavigate();
  const [technique, setTechnique] = useState(null); // lower-case label or null

  const all = useMemo(() => projects.flatMap((p) => (p.markers || []).map((m) => ({ p, m })))
    .sort((a, b) => (b.p.createdAt || 0) - (a.p.createdAt || 0) || a.m.t - b.m.t), [projects]);
  const counts = useMemo(() => {
    const map = new Map();
    for (const { m } of all) {
      const label = m.label.trim();
      if (!label) continue;
      const key = label.toLowerCase();
      map.set(key, { label: map.get(key)?.label || label, key, count: (map.get(key)?.count || 0) + 1 });
    }
    return [...map.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  }, [all]);
  const shown = technique ? all.filter(({ m }) => m.label.trim().toLowerCase() === technique) : all;

  const open = (p, m) => { setLastTab('motion'); navigate(`/project/${p.id}?t=${m.t}`); };

  if (!all.length) {
    return (
      <div className="empty">
        <Crosshair size={30} />
        <h3>No moments yet</h3>
        <p>Open a video, pause on a great cut or transition and press <b>M</b> (or “Mark moment”) — tag it with the technique, and it shows up here.</p>
      </div>
    );
  }

  return (
    <>
      {counts.length > 0 && (
        <div className="filter-row">
          <span className="filter-label"><Sparkles size={14} /> Technique</span>
          {counts.map((c) => (
            <button key={c.key} className={`chip ${technique === c.key ? 'on' : ''}`} onClick={() => setTechnique(technique === c.key ? null : c.key)}>
              {c.label} <span className="chip-count">{c.count}</span>
            </button>
          ))}
          {technique && <button className="chip clear" onClick={() => setTechnique(null)}><X size={13} /> Clear</button>}
        </div>
      )}
      <div className="grid moments-grid">
        {shown.map(({ p, m }) => {
          const img = m.thumb ? fileUrl(p, m.thumb) : p.thumb ? fileUrl(p, p.thumb) : null;
          return (
            <div key={`${p.id}:${m.id}`} className="card moment-card" onClick={() => open(p, m)} title={`Open “${p.title}” at ${fmtClock(m.t)}`}>
              <div className="card-thumb">
                {img ? <img src={img} alt="" loading="lazy" /> : <div className="card-thumb-empty"><Crosshair size={24} /></div>}
                <span className="card-duration">{fmtClock(m.t)}</span>
                {m.label.trim() && <span className="moment-tag">{m.label.trim()}</span>}
              </div>
              <div className="card-meta"><span className="card-title">{p.title}</span></div>
              {m.note.trim() && <div className="card-sub moment-note">{m.note.trim()}</div>}
            </div>
          );
        })}
      </div>
    </>
  );
}
