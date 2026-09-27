import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { History, PencilRuler, Clapperboard, MonitorSmartphone, Library, AppWindow, ListTodo, ArrowUpRight } from 'lucide-react';
import { api } from '../../lib/api.js';
import { gradientCss } from '../../lib/types.js';

const ICON = { plan: PencilRuler, storyboard: Clapperboard, mockup: MonitorSmartphone, project: Library, software: AppWindow, board: ListTodo };
function ago(t) {
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  const d = Math.floor(s / 86400);
  return d === 1 ? 'yesterday' : `${d} days ago`;
}

/**
 * Continue where you left off: the last things you changed — a plan, a
 * storyboard, a mockup, a reference — one click away.
 */
export default function ContinueWork({ reloadKey }) {
  const navigate = useNavigate();
  const [items, setItems] = useState(null);
  useEffect(() => {
    let alive = true;
    api.recent(8).then((x) => { if (alive) setItems(x); }).catch(() => { if (alive) setItems([]); });
    return () => { alive = false; };
  }, [reloadKey]);

  return (
    <section className="dash-cont">
      <div className="dash-card-kicker"><History size={14} /> Continue where you left off</div>
      {items === null ? <div className="dash-cont-grid">{[0, 1, 2, 3].map((i) => <div key={i} className="dash-cont-tile dash-act-skeleton" />)}</div>
        : !items.length ? <p className="dash-cont-empty">What you work on shows up here — a project, a storyboard, a mockup.</p> : (
          <div className="dash-cont-grid">
            {items.slice(0, 4).map((it) => {
              const Icon = ICON[it.kind] || History;
              const bg = it.thumb ? { backgroundImage: `url("${it.thumb}")` } : it.gradient ? { backgroundImage: gradientCss(it.gradient) } : undefined;
              return (
                <button key={it.key} type="button" className={`dash-cont-tile ${it.emoji || it.avatar ? 'badged' : ''}`} onClick={() => navigate(it.href)}>
                  <span className={`dash-cont-pic ${bg ? '' : 'none'}`} style={bg}>
                    {!bg && <Icon size={22} />}
                    {it.emoji && <span className="dash-cont-emoji">{it.emoji}</span>}
                    {!it.emoji && it.avatar && <img className="dash-cont-avatar" src={it.avatar} alt="" />}
                  </span>
                  <span className="dash-cont-text">
                    <span className="dash-cont-title">{it.title}</span>
                    <span className="dash-cont-sub"><Icon size={12} /> {it.sub} · {ago(it.t)}</span>
                  </span>
                  <ArrowUpRight className="dash-cont-go" size={15} />
                </button>
              );
            })}
          </div>
        )}
    </section>
  );
}
