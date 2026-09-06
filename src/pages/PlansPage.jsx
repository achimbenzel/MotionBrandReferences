import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, PencilRuler, CalendarRange, Images } from 'lucide-react';
import { api, planFileUrl } from '../lib/api.js';
import { gradientCss } from '../lib/types.js';

const fmtRange = (s, e) => {
  if (s && e) return `${s} – ${e}`;
  return s || e || '';
};

export default function PlansPage({ reloadKey, onNewPlan }) {
  const navigate = useNavigate();
  const [plans, setPlans] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    setPlans(null); setError(null);
    api.listPlans().then((p) => { if (alive) setPlans(p); }).catch((e) => { if (alive) setError(e.message); });
    return () => { alive = false; };
  }, [reloadKey]);

  return (
    <div>
      <div className="page-head">
        <h1>Plans</h1>
        <p>Plan new projects — moodboard, notes and a timeframe.</p>
      </div>

      {error && <div className="center-msg">Couldn’t load: {error}</div>}
      {!plans && !error && <div className="spinner" />}

      {plans && !error && (
        plans.length ? (
          <div className="grid">
            {plans.map((p) => {
              const imgCount = (p.moodboards || []).reduce((n, mb) => n + (mb.images || []).length, 0);
              const banner = p.banner ? planFileUrl(p, p.banner) : null;
              const grad = !banner ? gradientCss(p.bannerGradient) : null;
              const bannerBg = banner ? `url("${banner}")` : grad || null;
              const avatar = p.avatar ? planFileUrl(p, p.avatar) : null;
              return (
                <div key={p.id} className="card plan-card" onClick={() => navigate(`/plan/${p.id}`)}>
                  <div className="plan-card-head">
                    <div className={`plan-card-banner ${bannerBg ? '' : 'empty'}`} style={bannerBg ? { backgroundImage: bannerBg } : undefined} />
                    <div className="plan-card-avatar">
                      {avatar ? <img src={avatar} alt="" loading="lazy" /> : <span>{(p.name || '?').charAt(0).toUpperCase()}</span>}
                    </div>
                  </div>
                  <div className="card-meta"><span className="card-title">{p.name}</span></div>
                  <div className="card-sub" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    {fmtRange(p.start, p.end) && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><CalendarRange size={13} /> {fmtRange(p.start, p.end)}</span>}
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><Images size={13} /> {imgCount}</span>
                  </div>
                </div>
              );
            })}
            <button className="gallery-new" onClick={onNewPlan}>
              <Plus size={26} /><span>New plan</span>
            </button>
          </div>
        ) : (
          <div className="empty">
            <PencilRuler size={30} />
            <h3>No plans yet</h3>
            <p>Start planning a new project — collect a moodboard, notes and a timeframe.</p>
            <button className="btn btn-primary" onClick={onNewPlan}><Plus size={16} /> New plan</button>
          </div>
        )
      )}
    </div>
  );
}
