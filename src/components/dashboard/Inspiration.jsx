import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shuffle, Sparkles, ArrowUpRight } from 'lucide-react';
import { api, fileUrl } from '../../lib/api.js';
import { TABS } from '../../lib/types.js';

const LABEL = Object.fromEntries(TABS.map((t) => [t.key, t.label]));
const pic = (f) => (typeof f === 'string' && f ? f : null);
// The picture a reference is shown by (and its video, for Motion).
function coverOf(p) {
  const file = pic(p.thumb) || pic(p.image) || pic(p.front) || pic(p.shot) || pic(p.example)
    || (p.assets || []).find((a) => a.kind === 'image' && pic(a.file))?.file;
  return file ? { src: fileUrl(p, file), video: p.type === 'motion' && pic(p.video) ? fileUrl(p, p.video) : null } : null;
}

/**
 * A reference from your own library, picked at random — a nudge when you
 * start the day. Shuffle for another; Motion references play on hover.
 */
export default function Inspiration({ reloadKey }) {
  const navigate = useNavigate();
  const [items, setItems] = useState(null);
  const [seed, setSeed] = useState(() => Math.random());
  const [hover, setHover] = useState(false);
  const last = useRef(null);

  useEffect(() => {
    let alive = true;
    api.list().then((ps) => { if (alive) setItems(ps.map((p) => ({ p, cover: coverOf(p) })).filter((x) => x.cover)); }).catch(() => { if (alive) setItems([]); });
    return () => { alive = false; };
  }, [reloadKey]);

  const pick = useMemo(() => {
    if (!items?.length) return null;
    let i = Math.floor(seed * items.length);
    if (items.length > 1 && items[i].p.id === last.current) i = (i + 1) % items.length; // never the same twice
    return items[i];
  }, [items, seed]);
  useEffect(() => { last.current = pick?.p.id || null; }, [pick]);

  if (items && !items.length) {
    return (
      <section className="dash-insp is-empty">
        <div className="dash-card-kicker"><Sparkles size={14} /> Inspiration</div>
        <p>Your library's references show up here, one at a time — add a few in Reference mode.</p>
      </section>
    );
  }
  return (
    <section className="dash-insp" onPointerEnter={() => setHover(true)} onPointerLeave={() => setHover(false)}>
      {pick ? (
        <button type="button" key={pick.p.id} className="dash-insp-media" onClick={() => navigate(`/project/${pick.p.id}`)} aria-label={`Open ${pick.p.title || 'reference'}`}>
          <img src={pick.cover.src} alt="" />
          {hover && pick.cover.video && <video src={pick.cover.video} muted autoPlay loop playsInline />}
        </button>
      ) : <div className="dash-insp-media dash-act-skeleton" />}
      <div className="dash-insp-top">
        <span className="dash-insp-kicker"><Sparkles size={13} /> Inspiration</span>
        <button type="button" className="btn btn-sm dash-glass-btn" onClick={() => setSeed(Math.random())} disabled={!items || items.length < 2}>
          <Shuffle size={14} /> Shuffle
        </button>
      </div>
      {pick && (
        <div className="dash-insp-info">
          <span className="dash-insp-type">{LABEL[pick.p.type] || 'Reference'}{pick.p.year ? ` · ${pick.p.year}` : ''}</span>
          <b>{pick.p.title || 'Untitled'}</b>
          {(pick.p.tags || []).length > 0 && <span className="dash-insp-tags">{pick.p.tags.slice(0, 4).map((t) => `#${t}`).join(' ')}</span>}
          <ArrowUpRight className="dash-insp-go" size={18} />
        </div>
      )}
    </section>
  );
}
