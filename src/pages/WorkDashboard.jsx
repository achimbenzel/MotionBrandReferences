import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PencilRuler, ListTodo, FlaskConical, Plus, ArrowRight, CalendarRange, AppWindow } from 'lucide-react';
import { api, planFileUrl } from '../lib/api.js';
import { gradientCss } from '../lib/types.js';

const fmtRange = (s, e) => (s && e ? `${s} – ${e}` : s || e || '');

/** Work-mode landing: a Notion-style card view of the working tools. */
export default function WorkDashboard({ reloadKey, onNewPlan }) {
  const navigate = useNavigate();
  const [plans, setPlans] = useState(null);
  const [board, setBoard] = useState(null);
  const [software, setSoftware] = useState(null);

  useEffect(() => {
    let alive = true;
    api.listPlans().then((p) => { if (alive) setPlans(p); }).catch(() => { if (alive) setPlans([]); });
    api.getBoard().then((b) => { if (alive) setBoard(b); }).catch(() => { if (alive) setBoard({ columns: [] }); });
    api.listSoftware().then((s) => { if (alive) setSoftware(s); }).catch(() => { if (alive) setSoftware([]); });
    return () => { alive = false; };
  }, [reloadKey]);

  const planCount = plans?.length ?? 0;
  const boardCards = (board?.columns || []).reduce((n, c) => n + c.cards.length, 0);
  const boardLists = (board?.columns || []).length;
  const softCount = software?.length ?? 0;
  const recent = [...(plans || [])].slice(-6).reverse();

  const tools = [
    { key: 'plan', icon: PencilRuler, title: 'Plans', sub: planCount ? `${planCount} plan${planCount === 1 ? '' : 's'}` : 'Plan a new project', to: '/plan', accent: 'linear-gradient(120deg,#6a11cb,#2575fc)' },
    { key: 'software', icon: AppWindow, title: 'Software', sub: softCount ? `${softCount} app${softCount === 1 ? '' : 's'}` : 'Plugins, scripts & more', to: '/software', accent: 'linear-gradient(120deg,#7b4397,#dc2430)' },
    { key: 'board', icon: ListTodo, title: 'To-Do Board', sub: boardCards ? `${boardCards} card${boardCards === 1 ? '' : 's'} · ${boardLists} lists` : 'Plan your to-dos', to: '/board', accent: 'linear-gradient(120deg,#00c6a7,#1e4fd6)' },
    { key: 'logotester', icon: FlaskConical, title: 'Logo Tester', sub: 'Stress-test a logo', to: '/logo-tester', accent: 'linear-gradient(120deg,#f83600,#f9d423)' },
  ];

  return (
    <div className="dashboard">
      <div className="page-head">
        <h1>Dashboard</h1>
        <p>Your working area — plans, to-dos and tools.</p>
      </div>

      <div className="dash-grid">
        {tools.map((t) => (
          <button key={t.key} className="dash-card" onClick={() => navigate(t.to)}>
            <span className="dash-card-icon" style={{ backgroundImage: t.accent }}><t.icon size={22} /></span>
            <span className="dash-card-body">
              <span className="dash-card-title">{t.title}</span>
              <span className="dash-card-sub">{t.sub}</span>
            </span>
            <ArrowRight className="dash-card-go" size={18} />
          </button>
        ))}
      </div>

      <div className="dash-section-head">
        <h2>Recent plans</h2>
        <button className="btn btn-sm" onClick={onNewPlan}><Plus size={15} /> New plan</button>
      </div>

      {plans === null ? (
        <div className="spinner" />
      ) : recent.length ? (
        <div className="dash-recent">
          {recent.map((p) => {
            const banner = p.banner ? planFileUrl(p, p.banner) : null;
            const grad = !banner ? gradientCss(p.bannerGradient) : null;
            const bg = banner ? `url("${banner}")` : grad || null;
            const avatar = p.avatar ? planFileUrl(p, p.avatar) : null;
            return (
              <button key={p.id} className="dash-plan" onClick={() => navigate(`/plan/${p.id}`)}>
                <span className={`dash-plan-banner ${bg ? '' : 'empty'}`} style={bg ? { backgroundImage: bg } : undefined} />
                <span className="dash-plan-avatar">
                  {avatar ? <img src={avatar} alt="" loading="lazy" />
                    : p.avatarEmoji ? <span className="dash-plan-emoji">{p.avatarEmoji}</span>
                      : <span>{(p.name || '?').charAt(0).toUpperCase()}</span>}
                </span>
                <span className="dash-plan-name">{p.name}</span>
                {fmtRange(p.start, p.end) && (
                  <span className="dash-plan-range"><CalendarRange size={12} /> {fmtRange(p.start, p.end)}</span>
                )}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="empty" style={{ marginTop: 8 }}>
          <PencilRuler size={28} />
          <h3>No plans yet</h3>
          <p>Start planning a new project — moodboard, notes, files and a timeframe.</p>
          <button className="btn btn-primary" onClick={onNewPlan}><Plus size={16} /> New plan</button>
        </div>
      )}
    </div>
  );
}
