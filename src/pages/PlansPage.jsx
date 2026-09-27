import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, PencilRuler, CalendarRange, Images, Building2, Clock, ArrowRight } from 'lucide-react';
import { api, planFileUrl } from '../lib/api.js';
import { gradientCss, PLAN_STATUSES, tagColor } from '../lib/types.js';
import StatusBadge from '../components/StatusBadge.jsx';
import ClientAvatar from '../components/ClientAvatar.jsx';
import { minutesOf, budgetMinutes, budgetState, budgetText } from '../lib/clients.js';

const fmtRange = (s, e) => {
  if (s && e) return `${s} – ${e}`;
  return s || e || '';
};
const VIEW_KEY = 'projectsView';

/**
 * Projects (stored as "plans"): by client — each client's projects together,
 * then those without one — or all in one grid. Status chips filter both.
 */
export default function PlansPage({ reloadKey, onNewPlan }) {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [plans, setPlans] = useState(null);
  const [clients, setClients] = useState([]);
  const [entries, setEntries] = useState([]);
  const [error, setError] = useState(null);
  const [view, setViewState] = useState(() => { try { return localStorage.getItem(VIEW_KEY) || 'client'; } catch { return 'client'; } });
  const filter = params.get('status') || ''; // '' = everything but archived

  useEffect(() => {
    let alive = true;
    setPlans(null); setError(null);
    api.listPlans().then((p) => { if (alive) setPlans(p); }).catch((e) => { if (alive) setError(e.message); });
    api.listClients().then((c) => { if (alive) setClients(c); }).catch(() => {});
    api.getTime().then((d) => { if (alive) setEntries(d.entries); }).catch(() => {});
    return () => { alive = false; };
  }, [reloadKey]);

  const setView = (v) => { setViewState(v); try { localStorage.setItem(VIEW_KEY, v); } catch { /* ignore */ } };
  const count = (key) => (plans || []).filter((p) => (p.status || '') === key).length;
  const chips = PLAN_STATUSES.filter((s) => count(s.key) > 0);
  const hasStatuses = chips.length > 0;
  const shown = (plans || []).filter((p) => (filter ? (p.status || '') === filter : p.status !== 'archived'));
  const setFilter = (key) => setParams(key ? { status: key } : {}, { replace: true });
  const minutesByPlan = useMemo(() => {
    const m = {};
    for (const e of entries) if (e.planId) m[e.planId] = (m[e.planId] || 0) + minutesOf(e);
    return m;
  }, [entries]);
  const groups = useMemo(() => {
    const out = clients.map((c) => ({ client: c, list: shown.filter((p) => p.clientId === c.id) })).filter((g) => g.list.length);
    const loose = shown.filter((p) => !p.clientId || !clients.some((c) => c.id === p.clientId));
    if (loose.length) out.push({ client: null, list: loose });
    return out;
  }, [clients, shown]);

  const card = (p, withClient) => {
    const imgCount = (p.blocks || []).reduce((n, b) => n + (b.images || []).length + (b.files || []).length, 0);
    const banner = p.banner ? planFileUrl(p, p.banner) : null;
    const grad = !banner ? gradientCss(p.bannerGradient) : null;
    const bannerBg = banner ? `url("${banner}")` : grad || null;
    const avatar = p.avatar ? planFileUrl(p, p.avatar) : null;
    const min = minutesByPlan[p.id] || 0;
    const used = budgetMinutes(p, entries);
    const b = budgetState(p, used);
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
        <div className="card-sub plan-card-sub">
          {withClient && p.client && <span><Building2 size={13} /> {p.client}</span>}
          {fmtRange(p.start, p.end) && <span><CalendarRange size={13} /> {fmtRange(p.start, p.end)}</span>}
          {(min > 0 || b) && <span className={b ? `budget-${b.level}` : ''}><Clock size={13} /> {b ? budgetText(p, used) : `${(min / 60).toFixed(1)} h`}</span>}
          <span><Images size={13} /> {imgCount}</span>
        </div>
        {b && <span className={`plan-card-budget budget-${b.level}`} aria-hidden="true"><span style={{ width: `${Math.min(100, b.ratio * 100)}%` }} /></span>}
      </div>
    );
  };
  const newTile = (clientId, label = 'New project') => (
    <button key="new" className="gallery-new" onClick={() => onNewPlan(clientId ? { clientId } : undefined)}>
      <Plus size={26} /><span>{label}</span>
    </button>
  );

  return (
    <div>
      <div className="page-head-row">
        <div className="page-head">
          <h1>Projects</h1>
          <p>What you're working on — briefing, moodboard, storyboard, deliverables and a timeframe, grouped by client.</p>
        </div>
        {plans?.length > 0 && (
          <div className="segmented segmented-sm projects-view" role="group" aria-label="Show">
            {[['client', 'By client'], ['all', 'All']].map(([k, l]) => <button key={k} type="button" className={view === k ? 'on' : ''} onClick={() => setView(k)}>{l}</button>)}
          </div>
        )}
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
        plans.length ? (view === 'client' ? (
          <div className="project-groups">
            {groups.map((g) => (
              <section key={g.client?.id || 'none'} className="project-group">
                <div className="project-group-head">
                  {g.client ? (
                    <button type="button" className="project-group-client" onClick={() => navigate(`/clients/${g.client.id}`)} title={`Open ${g.client.name}`}>
                      <ClientAvatar client={g.client} size="sm" /><b>{g.client.name}</b><span className="count">{g.list.length}</span><ArrowRight size={14} className="project-group-go" />
                    </button>
                  ) : <span className="project-group-client none"><Building2 size={15} /><b>Without a client</b><span className="count">{g.list.length}</span></span>}
                </div>
                <div className="grid">
                  {g.list.map((p) => card(p, false))}
                  {!filter && newTile(g.client?.id)}
                </div>
              </section>
            ))}
            {!groups.length && filter && <div className="hint">No projects with this status.</div>}
            {!filter && !groups.some((g) => !g.client) && <div className="grid project-group-free">{newTile(null, 'New project')}</div>}
          </div>
        ) : (
          <div className="grid">
            {shown.map((p) => card(p, true))}
            {!filter && newTile(null)}
            {filter && !shown.length && <div className="hint">No projects with this status.</div>}
          </div>
        )) : (
          <div className="empty">
            <PencilRuler size={30} />
            <h3>No projects yet</h3>
            <p>Start from a launch-video or branding template, or an empty page — for a client or just for you.</p>
            <button className="btn btn-primary" onClick={() => onNewPlan()}><Plus size={16} /> New project</button>
          </div>
        )
      )}
    </div>
  );
}
