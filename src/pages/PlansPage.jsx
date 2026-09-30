import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, PencilRuler, CalendarRange, Images, Building2, Clock, ArrowRight, Pin, Search, ArrowDownUp, X } from 'lucide-react';
import { api, planFileUrl } from '../lib/api.js';
import { gradientCss, PLAN_STATUSES, tagColor } from '../lib/types.js';
import { useToast } from '../components/Toast.jsx';
import Menu from '../components/Menu.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import ClientAvatar from '../components/ClientAvatar.jsx';
import { minutesOf, budgetMinutes, budgetState, budgetText } from '../lib/clients.js';
import '../styles/plan.css';

const fmtRange = (s, e) => {
  if (s && e) return `${s} – ${e}`;
  return s || e || '';
};
const VIEW_KEY = 'projectsView';
const SORT_KEY = 'projectsSort';
const NONE = '-'; // the client filter: projects without a client

const stage = (p) => { const i = PLAN_STATUSES.findIndex((s) => s.key === p.status); return i < 0 ? -1 : i; };
const byName = (a, b) => (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base', numeric: true });
// Soonest first; projects without that date go last.
const byDate = (field) => (a, b) => (a[field] ? 0 : 1) - (b[field] ? 0 : 1) || String(a[field] || '').localeCompare(String(b[field] || '')) || byName(a, b);
const SORTS = {
  recent: { label: 'Recently added', cmp: (a, b) => (b.createdAt || 0) - (a.createdAt || 0) },
  deadline: { label: 'Deadline', cmp: byDate('end') },
  start: { label: 'Start date', cmp: byDate('start') },
  name: { label: 'Name (A–Z)', cmp: byName },
  status: { label: 'Status', cmp: (a, b) => stage(a) - stage(b) || byName(a, b) },
  hours: { label: 'Hours tracked', cmp: null }, // needs the entries — see below
};
const stored = (key, ok, fallback) => { try { const v = localStorage.getItem(key); return ok(v) ? v : fallback; } catch { return fallback; } };
const store = (key, v) => { try { localStorage.setItem(key, v); } catch { /* ignore */ } };

/**
 * Projects (stored as "plans"): pinned ones on top, then by client — each
 * client's projects together, then those without one — or all in one grid.
 * Find by name, filter by client and status, sort by date added, deadline,
 * start, name, status or hours.
 */
export default function PlansPage({ reloadKey, onNewPlan }) {
  const navigate = useNavigate();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [plans, setPlans] = useState(null);
  const [clients, setClients] = useState([]);
  const [entries, setEntries] = useState([]);
  const [error, setError] = useState(null);
  const [q, setQ] = useState('');
  const [view, setViewState] = useState(() => stored(VIEW_KEY, (v) => v === 'client' || v === 'all', 'client'));
  const [sort, setSortState] = useState(() => stored(SORT_KEY, (v) => !!SORTS[v], 'recent'));
  const filter = params.get('status') || ''; // '' = everything but archived
  const clientFilter = params.get('client') || '';

  useEffect(() => {
    let alive = true;
    setPlans(null); setError(null);
    api.listPlans().then((p) => { if (alive) setPlans(p); }).catch((e) => { if (alive) setError(e.message); });
    api.listClients().then((c) => { if (alive) setClients(c); }).catch(() => {});
    api.getTime().then((d) => { if (alive) setEntries(d.entries); }).catch(() => {});
    return () => { alive = false; };
  }, [reloadKey]);

  const setView = (v) => { setViewState(v); store(VIEW_KEY, v); };
  const setSort = (v) => { setSortState(v); store(SORT_KEY, v); };
  const setParam = (key, value) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    setParams(next, { replace: true });
  };
  const setFilter = (key) => setParam('status', key);
  const setClientFilter = (key) => setParam('client', key);

  const minutesByPlan = useMemo(() => {
    const m = {};
    for (const e of entries) if (e.planId) m[e.planId] = (m[e.planId] || 0) + minutesOf(e);
    return m;
  }, [entries]);
  const known = useMemo(() => new Set(clients.map((c) => c.id)), [clients]);
  const clientOf = (p) => (p.clientId && known.has(p.clientId) ? p.clientId : NONE);

  // Everything but the status: what the status chips count.
  const needle = q.trim().toLowerCase();
  const found = useMemo(() => (plans || []).filter((p) => (!clientFilter || clientOf(p) === clientFilter)
    && (!needle || `${p.name} ${p.client || ''} ${PLAN_STATUSES.find((s) => s.key === p.status)?.label || ''}`.toLowerCase().includes(needle))),
  [plans, clientFilter, needle, known]); // eslint-disable-line react-hooks/exhaustive-deps
  const count = (key) => found.filter((p) => (p.status || '') === key).length;
  const chips = PLAN_STATUSES.filter((s) => count(s.key) > 0);
  const shown = useMemo(() => {
    const cmp = sort === 'hours' ? (a, b) => (minutesByPlan[b.id] || 0) - (minutesByPlan[a.id] || 0) || byName(a, b) : SORTS[sort].cmp;
    return found.filter((p) => (filter ? (p.status || '') === filter : p.status !== 'archived')).sort(cmp);
  }, [found, filter, sort, minutesByPlan]);
  // Pinned ones show on top as well — they keep their place in the list below too.
  const pinned = shown.filter((p) => p.pinned);
  const groups = useMemo(() => {
    const out = clients.map((c) => ({ client: c, list: shown.filter((p) => p.clientId === c.id) })).filter((g) => g.list.length);
    const loose = shown.filter((p) => clientOf(p) === NONE);
    if (loose.length) out.push({ client: null, list: loose });
    return out;
  }, [clients, shown]); // eslint-disable-line react-hooks/exhaustive-deps
  const narrowed = !!(filter || clientFilter || needle);
  const clientCounts = useMemo(() => {
    const m = {};
    for (const p of plans || []) if (p.status !== 'archived') m[clientOf(p)] = (m[clientOf(p)] || 0) + 1;
    return m;
  }, [plans, known]); // eslint-disable-line react-hooks/exhaustive-deps

  const togglePin = async (p) => {
    const pin = !p.pinned;
    setPlans((ps) => ps.map((x) => (x.id === p.id ? { ...x, pinned: pin } : x)));
    try { await api.updatePlan(p.id, { pinned: pin }); }
    catch (e) {
      setPlans((ps) => ps.map((x) => (x.id === p.id ? { ...x, pinned: !pin } : x)));
      toast(`Could not ${pin ? 'pin' : 'unpin'} it: ${e.message}`, 'error');
    }
  };

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
          <button type="button" className={`plan-card-pin ${p.pinned ? 'on' : ''}`} onClick={(e) => { e.stopPropagation(); togglePin(p); }}
            aria-pressed={!!p.pinned} aria-label={p.pinned ? `Unpin ${p.name}` : `Pin ${p.name}`} title={p.pinned ? 'Unpin' : 'Pin to the top'}>
            <Pin size={14} fill={p.pinned ? 'currentColor' : 'none'} />
          </button>
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
  const noneMatch = (
    <div className="hint projects-none">
      No project matches. {narrowed && <button type="button" className="btn btn-sm btn-ghost" onClick={() => { setQ(''); setParams({}, { replace: true }); }}><X size={13} /> Clear filters</button>}
    </div>
  );

  return (
    <div>
      <div className="page-head-row">
        <div className="page-head">
          <h1>Projects</h1>
          <p>What you're working on — briefing, moodboard, storyboard, deliverables and a timeframe, grouped by client. Pin the current ones to keep them on top.</p>
        </div>
        {plans?.length > 0 && (
          <div className="segmented segmented-sm projects-view" role="group" aria-label="Show">
            {[['client', 'By client'], ['all', 'All']].map(([k, l]) => <button key={k} type="button" className={view === k ? 'on' : ''} onClick={() => setView(k)}>{l}</button>)}
          </div>
        )}
      </div>

      {error && <div className="center-msg">Couldn’t load: {error}</div>}
      {!plans && !error && <div className="spinner" />}

      {plans?.length > 0 && !error && (
        <div className="projects-tools">
          <label className="clients-search projects-search"><Search size={15} />
            <input value={q} placeholder="Find a project…" onChange={(e) => setQ(e.target.value)} aria-label="Find a project" />
            {q && <button type="button" className="icon-btn" onClick={() => setQ('')} aria-label="Clear"><X size={13} /></button>}
          </label>
          {clients.length > 0 && (
            <select className="input projects-client" value={clientFilter} onChange={(e) => setClientFilter(e.target.value)} aria-label="Client">
              <option value="">All clients</option>
              {clients.filter((c) => clientCounts[c.id]).map((c) => <option key={c.id} value={c.id}>{c.name} ({clientCounts[c.id]})</option>)}
              {clientCounts[NONE] > 0 && <option value={NONE}>Without a client ({clientCounts[NONE]})</option>}
            </select>
          )}
          <Menu align="right" title="Sort" trigger={<button type="button" className="btn btn-sm projects-sort"><ArrowDownUp size={14} /> {SORTS[sort].label}</button>}
            items={[{ heading: 'Sort by' }, ...Object.entries(SORTS).map(([k, s]) => ({ label: s.label, checked: sort === k, onClick: () => setSort(k) }))]} />
        </div>
      )}

      {plans && !error && chips.length > 0 && (
        <div className="filter-row status-filter">
          <button className={`chip status-chip ${filter === '' ? 'on' : ''}`} onClick={() => setFilter('')}>
            All <span className="count">{found.filter((p) => p.status !== 'archived').length}</span>
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
          <div className="project-groups">
            {pinned.length > 0 && (
              <section className="project-group project-group-pinned">
                <div className="project-group-head">
                  <span className="project-group-client none"><Pin size={15} /><b>Pinned</b><span className="count">{pinned.length}</span></span>
                </div>
                <div className="grid">{pinned.map((p) => card(p, true))}</div>
              </section>
            )}
            {view === 'client' ? (
              <>
                {groups.map((g) => (
                  <section key={g.client?.id || 'none'} className="project-group">
                    <div className="project-group-head">
                      {g.client ? (
                        <button type="button" className="project-group-client" onClick={() => navigate(`/clients/${g.client.id}`)} title={`Open ${g.client.name}`}>
                          <ClientAvatar client={g.client} size="sm" /><b>{g.client.name}</b><span className="count">{g.list.length}</span><ArrowRight size={14} className="project-group-go" />
                        </button>
                      ) : <span className="project-group-client none"><Building2 size={15} /><b>Without a client</b><span className="count">{g.list.length}</span></span>}
                    </div>
                    <div className="grid">{g.list.map((p) => card(p, false))}</div>
                  </section>
                ))}
                {narrowed && !shown.length && noneMatch}
              </>
            ) : (
              <section className="project-group">
                {pinned.length > 0 && shown.length > 0 && <div className="project-group-head"><span className="project-group-client none"><b>All projects</b><span className="count">{shown.length}</span></span></div>}
                <div className="grid">{shown.map((p) => card(p, true))}</div>
                {narrowed && !shown.length && noneMatch}
              </section>
            )}
          </div>
        ) : (
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
