import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, PencilRuler, CalendarRange, Images, Building2 } from 'lucide-react';
import { api, planFileUrl } from '../lib/api.js';
import { gradientCss, PLAN_STATUSES, tagColor } from '../lib/types.js';
import StatusBadge from '../components/StatusBadge.jsx';

const fmtRange = (s, e) => {
  if (s && e) return `${s} – ${e}`;
  return s || e || '';
};

export default function PlansPage({ reloadKey, onNewPlan }) {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [plans, setPlans] = useState(null);
  const [error, setError] = useState(null);
  const filter = params.get('status') || ''; // '' = everything but archived

  useEffect(() => {
    let alive = true;
    setPlans(null); setError(null);
    api.listPlans().then((p) => { if (alive) setPlans(p); }).catch((e) => { if (alive) setError(e.message); });
    return () => { alive = false; };
  }, [reloadKey]);

  const count = (key) => (plans || []).filter((p) => (p.status || '') === key).length;
  const chips = PLAN_STATUSES.filter((s) => count(s.key) > 0);
  const hasStatuses = chips.length > 0;
  const shown = (plans || []).filter((p) => (filter ? (p.status || '') === filter : p.status !== 'archived'));
  const setFilter = (key) => setParams(key ? { status: key } : {}, { replace: true });

  return (
    <div>
      <div className="page-head">
        <h1>Plans</h1>
        <p>Plan new projects — briefing, moodboard, notes and a timeframe.</p>
      </div>

      {error && <div className="center-msg">Couldn’t load: {error}</div>}
      {!plans && !error && <div className="spinner" />}

      {plans && !error && hasStatuses && (
        <div className="filter-row status-filter">
          <button className={`chip status-chip ${filter === '' ? 'on' : ''}`} onClick={() => setFilter('')}>
            All <span className="count">{plans.filter((p) => p.status !== 'archived').length}</span>
          </button>
          {chips.map((s) => (
            <button key={s.key} className={`chip status-chip ${filter === s.key ? 'on' : ''}`} onClick={() => setFilter(filter === s.key ? '' : s.key)}>
              <span className="status-dot" style={{ background: tagColor(s.color).fg }} />{s.label} <span className="count">{count(s.key)}</span>
            </button>
          ))}
        </div>
      )}

      {plans && !error && (
        plans.length ? (
          <div className="grid">
            {shown.map((p) => {
              const imgCount = (p.blocks || []).reduce((n, b) => n + (b.images || []).length + (b.files || []).length, 0);
              const banner = p.banner ? planFileUrl(p, p.banner) : null;
              const grad = !banner ? gradientCss(p.bannerGradient) : null;
              const bannerBg = banner ? `url("${banner}")` : grad || null;
              const avatar = p.avatar ? planFileUrl(p, p.avatar) : null;
              return (
                <div key={p.id} className="card plan-card" onClick={() => navigate(`/plan/${p.id}`)}>
                  <div className="plan-card-head">
                    <div className={`plan-card-banner ${bannerBg ? '' : 'empty'}`} style={bannerBg ? { backgroundImage: bannerBg } : undefined} />
                    <div className="plan-card-avatar">
                      {avatar ? <img src={avatar} alt="" loading="lazy" />
                        : p.avatarEmoji ? <span className="plan-card-emoji">{p.avatarEmoji}</span>
                          : <span>{(p.name || '?').charAt(0).toUpperCase()}</span>}
                    </div>
                    <StatusBadge status={p.status} className="plan-card-status" />
                  </div>
                  <div className="card-meta"><span className="card-title">{p.name}</span></div>
                  <div className="card-sub" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    {p.client && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><Building2 size={13} /> {p.client}</span>}
                    {fmtRange(p.start, p.end) && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><CalendarRange size={13} /> {fmtRange(p.start, p.end)}</span>}
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><Images size={13} /> {imgCount}</span>
                  </div>
                </div>
              );
            })}
            {!filter && (
              <button className="gallery-new" onClick={onNewPlan}>
                <Plus size={26} /><span>New plan</span>
              </button>
            )}
            {filter && !shown.length && <div className="hint">No plans with this status.</div>}
          </div>
        ) : (
          <div className="empty">
            <PencilRuler size={30} />
            <h3>No plans yet</h3>
            <p>Start from a launch-video or branding template, or an empty page.</p>
            <button className="btn btn-primary" onClick={onNewPlan}><Plus size={16} /> New plan</button>
          </div>
        )
      )}
    </div>
  );
}
