import { useEffect, useMemo, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  Clock, Play, Square, X, Plus, FileSpreadsheet, Pencil, Copy, Trash2, MoreHorizontal, Check, CalendarDays, Timer, Briefcase, Tag, Download, Building2,
} from 'lucide-react';
import { api } from '../lib/api.js';
import { useToast } from '../components/Toast.jsx';
import Menu from '../components/Menu.jsx';
import { useTimeTracker, tracker, fmtElapsed, dayKey, hhmm } from '../lib/timeTracker.js';
import { whoOf, entryLabel } from '../lib/clients.js';

const OTHER = '__other__';
const minutesOf = (e) => { const t = (x) => { const [h, m] = x.split(':').map(Number); return h * 60 + m; }; return (t(e.end) - t(e.start) + 1440) % 1440; };
const fmtH = (min) => `${(min / 60).toFixed(2)} h`;
const fmtHM = (min) => `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`;
const dateOf = (iso) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); };
const fmtDay = (iso) => dateOf(iso).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: dateOf(iso).getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });

// The periods to look at.
function periodRange(key, custom) {
  const t = new Date(); t.setHours(0, 0, 0, 0);
  const monday = new Date(t); monday.setDate(t.getDate() - ((t.getDay() + 6) % 7));
  const add = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  switch (key) {
    case 'week': return [dayKey(monday), dayKey(add(monday, 6))];
    case 'lastweek': return [dayKey(add(monday, -7)), dayKey(add(monday, -1))];
    case 'month': return [dayKey(new Date(t.getFullYear(), t.getMonth(), 1)), dayKey(new Date(t.getFullYear(), t.getMonth() + 1, 0))];
    case 'lastmonth': return [dayKey(new Date(t.getFullYear(), t.getMonth() - 1, 1)), dayKey(new Date(t.getFullYear(), t.getMonth(), 0))];
    case 'custom': return [custom.from || '', custom.to || ''];
    default: return ['', ''];
  }
}
const PERIODS = [['week', 'This week'], ['lastweek', 'Last week'], ['month', 'This month'], ['lastmonth', 'Last month'], ['all', 'All'], ['custom', 'Custom']];

/**
 * Who the time is for: a project (grouped by client), a client without a
 * project, or any other name typed in.
 */
function ProjectPick({ plans, clients, planId, clientId, project, onChange }) {
  const [free, setFree] = useState(!planId && !clientId && !!project); // typing another name
  const open = plans.filter((p) => p.status !== 'archived' || p.id === planId);
  const groups = clients.map((c) => ({ c, list: open.filter((p) => p.clientId === c.id) }));
  const loose = open.filter((p) => !p.clientId);
  const value = free ? OTHER : planId ? `p:${planId}` : clientId ? `c:${clientId}` : '';
  const pick = (v) => {
    if (v === OTHER) { setFree(true); onChange({ planId: null, clientId: null, project: project || '' }); return; }
    setFree(false);
    if (v.startsWith('p:')) onChange({ planId: v.slice(2), clientId: null, project: '' });
    else if (v.startsWith('c:')) onChange({ planId: null, clientId: v.slice(2), project: '' });
    else onChange({ planId: null, clientId: null, project: '' });
  };
  const opt = (p) => <option key={p.id} value={`p:${p.id}`}>{p.avatarEmoji ? `${p.avatarEmoji} ` : ''}{p.name}</option>;
  return (
    <span className={`tt-project ${free ? 'free' : ''}`}>
      <select className="input" value={value} aria-label="Client / project" onChange={(e) => pick(e.target.value)}>
        <option value="">No project</option>
        {groups.map(({ c, list }) => (
          <optgroup key={c.id} label={c.name}>
            <option value={`c:${c.id}`}>{c.name} — no project</option>
            {list.map(opt)}
          </optgroup>
        ))}
        {loose.length > 0 && <optgroup label="Without a client">{loose.map(opt)}</optgroup>}
        <option value={OTHER}>Something else (type a name)…</option>
      </select>
      {free && <input className="input" value={project || ''} placeholder="Project / client" onChange={(e) => onChange({ planId: null, clientId: null, project: e.target.value })} aria-label="Project / client" />}
    </span>
  );
}

/** An entry being written or changed. */
function EntryEditor({ initial, plans, clients, activities, onSave, onCancel }) {
  const [e, setE] = useState(initial);
  const set = (p) => setE((x) => ({ ...x, ...p }));
  const min = e.start && e.end ? minutesOf(e) : 0;
  const ok = e.date && e.start && e.end;
  const save = () => { if (ok) onSave(e); };
  return (
    <div className="tt-editor" onKeyDown={(ev) => { if (ev.key === 'Escape') onCancel(); if (ev.key === 'Enter' && ev.target.tagName === 'INPUT') { ev.preventDefault(); save(); } }}>
      <div className="tt-editor-row">
        <label className="tt-f"><span>Date</span><input type="date" className="input" value={e.date} onChange={(ev) => set({ date: ev.target.value })} /></label>
        <label className="tt-f"><span>From</span><input type="time" className="input" value={e.start} onChange={(ev) => set({ start: ev.target.value })} /></label>
        <label className="tt-f"><span>To</span><input type="time" className="input" value={e.end} onChange={(ev) => set({ end: ev.target.value })} /></label>
        <span className="tt-f tt-dur"><span>Duration</span><b>{fmtHM(min)}</b></span>
      </div>
      <div className="tt-editor-row">
        <label className="tt-f grow"><span>Client / project</span><ProjectPick plans={plans} clients={clients} planId={e.planId} clientId={e.clientId} project={e.project} onChange={set} /></label>
        <label className="tt-f"><span>Activity</span>
          <input className="input" list="tt-activities" value={e.activity} placeholder="Design, Website…" onChange={(ev) => set({ activity: ev.target.value })} />
        </label>
      </div>
      <label className="tt-f grow"><span>Details &amp; results</span><input className="input" value={e.details} placeholder="What got done" onChange={(ev) => set({ details: ev.target.value })} /></label>
      <datalist id="tt-activities">{activities.map((a) => <option key={a} value={a} />)}</datalist>
      <div className="tt-editor-foot">
        <button type="button" className="btn btn-sm" onClick={onCancel}>Cancel</button>
        <button type="button" className="btn btn-sm btn-primary" onClick={save} disabled={!ok}><Check size={14} /> Save</button>
      </div>
    </div>
  );
}

/** The export: which period (from the filters), language, look. */
function ExportDialog({ query, count, scope, onClose }) {
  const [lang, setLang] = useState(() => { try { return localStorage.getItem('ttExportLang') || 'de'; } catch { return 'de'; } });
  const [style, setStyle] = useState(() => { try { return localStorage.getItem('ttExportStyle') || 'app'; } catch { return 'app'; } });
  const url = api.timeExportUrl({ ...query, lang, style });
  const keep = () => { try { localStorage.setItem('ttExportLang', lang); localStorage.setItem('ttExportStyle', style); } catch { /* ignore */ } };
  return (
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal tt-export" role="dialog" aria-modal="true" aria-label="Export as Excel">
        <div className="modal-head"><h2><FileSpreadsheet size={17} /> Export as Excel</h2><button className="icon-btn" onClick={onClose} aria-label="Close"><X size={18} /></button></div>
        <div className="modal-body">
          <p className="tt-export-what"><b>{count} entr{count === 1 ? 'y' : 'ies'}</b> — {scope}</p>
          <div className="tt-export-opt"><span>Headers</span>
            <div className="segmented segmented-sm">{[['de', 'Deutsch'], ['en', 'English']].map(([k, l]) => <button key={k} type="button" className={lang === k ? 'on' : ''} onClick={() => setLang(k)}>{l}</button>)}</div>
          </div>
          <div className="tt-export-opt"><span>Look</span>
            <div className="segmented segmented-sm">{[['app', 'Like the app'], ['classic', 'Classic blue']].map(([k, l]) => <button key={k} type="button" className={style === k ? 'on' : ''} onClick={() => setStyle(k)}>{l}</button>)}</div>
          </div>
          <div className={`tt-export-preview ${style}`} aria-hidden="true">
            {(lang === 'de' ? ['Datum', 'Startzeit', 'Endzeit', 'Dauer (h)', 'Kunde', 'Projekt', 'Tätigkeit'] : ['Date', 'Start', 'End', 'Duration (h)', 'Client', 'Project', 'Activity']).map((h) => <span key={h}>{h}</span>)}
          </div>
          <ul className="tt-export-list">
            <li>Filter buttons and a frozen header row; the drop-downs offer only the clients, projects and activities in this export</li>
            <li>Durations as formulas (past midnight too), a total of the visible rows</li>
            <li>Rate and amount when a project has an hourly rate</li>
            <li>A summary sheet: hours by client, project, activity and month</li>
          </ul>
        </div>
        <div className="modal-foot">
          <button type="button" className="btn" onClick={onClose}>Close</button>
          <a className="btn btn-primary" href={url} download onClick={() => { keep(); setTimeout(onClose, 300); }}><Download size={15} /> Download .xlsx</a>
        </div>
      </div>
    </div>
  );
}

/**
 * Time Tracker: track working time per project or client — live (start /
 * stop, it keeps running across pages and devices) or after the fact — look
 * at a period, a client, a project or an activity, and export it as an Excel sheet.
 */
export default function TimeTracker() {
  const toast = useToast();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const t = useTimeTracker();
  const [entries, setEntries] = useState(null);
  const [plans, setPlans] = useState([]);
  const [clients, setClients] = useState([]);
  const [period, setPeriod] = useState(() => { try { return localStorage.getItem('ttPeriod') || 'week'; } catch { return 'week'; } });
  const [custom, setCustom] = useState({ from: '', to: '' });
  const [planF, setPlanF] = useState(params.get('plan') || '');
  const [clientF, setClientF] = useState(params.get('client') || '');
  const [actF, setActF] = useState('');
  const [editing, setEditing] = useState(null); // entry id | 'new'
  const [draft, setDraft] = useState({ planId: params.get('plan') || null, clientId: null, project: '', activity: '', details: '' });
  const [exporting, setExporting] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.getTime().then((d) => { setEntries(d.entries); tracker.apply(d); }).catch((e) => { setEntries([]); toast(e.message, 'error'); });
    api.listPlans().then(setPlans).catch(() => {});
    api.listClients().then(setClients).catch(() => {});
  }, [toast]);
  useEffect(() => { if (params.get('plan') || params.get('client')) setParams({}, { replace: true }); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { try { localStorage.setItem('ttPeriod', period); } catch { /* ignore */ } }, [period]);
  // While it runs, the tracker's own fields are the draft.
  useEffect(() => {
    if (t.running) setDraft({ planId: t.running.planId, clientId: t.running.clientId || null, project: t.running.project, activity: t.running.activity, details: t.running.details });
  }, [t.running?.startedAt]); // eslint-disable-line react-hooks/exhaustive-deps

  const planById = useMemo(() => Object.fromEntries(plans.map((p) => [p.id, p])), [plans]);
  const clientById = useMemo(() => Object.fromEntries(clients.map((c) => [c.id, c])), [clients]);
  const labelOf = (e) => entryLabel(e, planById, clientById) || 'No project';
  const [from, to] = periodRange(period, custom);
  const shown = useMemo(() => (entries || [])
    .filter((e) => (!from || e.date >= from) && (!to || e.date <= to))
    .filter((e) => !clientF || (clientF === 'none' ? !whoOf(e, planById, clientById).client : whoOf(e, planById, clientById).client?.id === clientF))
    .filter((e) => !planF || (planF === 'none' ? !e.planId : e.planId === planF))
    .filter((e) => !actF || e.activity === actF), [entries, from, to, clientF, planF, actF, planById, clientById]);
  const filterPlans = plans.filter((p) => !clientF || (clientF === 'none' ? !p.clientId : p.clientId === clientF));
  const total = shown.reduce((m, e) => m + minutesOf(e), 0);
  const days = useMemo(() => {
    const m = new Map();
    for (const e of shown) { if (!m.has(e.date)) m.set(e.date, []); m.get(e.date).push(e); }
    return [...m].sort((a, b) => b[0].localeCompare(a[0])).map(([d, list]) => ({ date: d, list: list.sort((a, b) => b.start.localeCompare(a.start)), min: list.reduce((n, e) => n + minutesOf(e), 0) }));
  }, [shown]);
  const sumBy = (key) => {
    const m = new Map();
    for (const e of shown) { const k = key(e); m.set(k, (m.get(k) || 0) + minutesOf(e)); }
    return [...m].sort((a, b) => b[1] - a[1]);
  };
  const byProject = sumBy(labelOf).slice(0, 6);
  const byActivity = sumBy((e) => e.activity || 'No activity');
  const today = dayKey();
  const [wFrom, wTo] = periodRange('week'); const [mFrom, mTo] = periodRange('month');
  const sumRange = (a, b) => (entries || []).filter((e) => e.date >= a && e.date <= b).reduce((n, e) => n + minutesOf(e), 0);
  const running = t.running;
  const liveMin = running ? Math.floor(t.elapsed / 60000) : 0;
  const activities = t.activities || [];
  const usedActs = [...new Set([...activities, ...(entries || []).map((e) => e.activity).filter(Boolean)])];

  // ---- the live tracker
  const start = async () => {
    setBusy(true);
    try { await tracker.start(draft); } catch (e) { toast(`Could not start: ${e.message}`, 'error'); } finally { setBusy(false); }
  };
  const stop = async () => {
    setBusy(true);
    try {
      const entry = await tracker.stop({ details: draft.details });
      if (entry) { setEntries((l) => [entry, ...(l || [])]); toast(`Saved · ${fmtHM(minutesOf(entry))} h`, 'ok', { label: 'Edit', onClick: () => setEditing(entry.id) }); } else toast('Under a minute — nothing saved');
    } catch (e) { toast(`Could not stop: ${e.message}`, 'error'); } finally { setBusy(false); }
  };
  const changeLive = (p) => { setDraft((d) => ({ ...d, ...p })); if (running) tracker.update(p).catch(() => {}); };
  const pickActivity = (a) => changeLive({ activity: draft.activity === a ? '' : a });
  const addActivity = async (name) => {
    const a = name.trim();
    if (!a) return;
    if (!activities.some((x) => x.toLowerCase() === a.toLowerCase())) await tracker.setActivities([...activities, a]).catch(() => {});
    changeLive({ activity: a });
  };
  const editStart = async (v) => {
    if (!running || !/^\d\d:\d\d$/.test(v)) return;
    const [h, m] = v.split(':').map(Number);
    const d = new Date(running.startedAt); d.setHours(h, m, 0, 0);
    if (d.getTime() > Date.now()) d.setDate(d.getDate() - 1); // a time later than now was yesterday
    try { await tracker.update({ startedAt: d.getTime() }); } catch (e) { toast(e.message, 'error'); }
  };

  // ---- entries
  const saveEntry = async (e) => {
    try {
      const body = { date: e.date, start: e.start, end: e.end, planId: e.planId || null, clientId: e.planId ? null : e.clientId || null, project: e.project || '', activity: e.activity || '', details: e.details || '' };
      if (e.id) { const x = await api.updateTimeEntry(e.id, body); setEntries((l) => l.map((y) => (y.id === x.id ? x : y))); } else { const x = await api.addTimeEntry(body); setEntries((l) => [x, ...l]); }
      setEditing(null);
    } catch (err) { toast(`Could not save: ${err.message}`, 'error'); }
  };
  const duplicate = async (e) => {
    try { const x = await api.addTimeEntry({ ...e, id: undefined, date: today }); setEntries((l) => [x, ...l]); setEditing(x.id); } catch (err) { toast(err.message, 'error'); }
  };
  const remove = async (e) => {
    try {
      const { trashId } = await api.removeTimeEntry(e.id);
      setEntries((l) => l.filter((x) => x.id !== e.id));
      toast('Entry removed', 'ok', { label: 'Undo', onClick: async () => { await api.restoreTrash(trashId); setEntries((l) => [e, ...l]); } });
    } catch (err) { toast(err.message, 'error'); }
  };
  const newEntry = () => {
    const last = (entries || []).filter((x) => x.date === today).sort((a, b) => b.end.localeCompare(a.end))[0];
    const now = hhmm();
    const planId = planF && planF !== 'none' ? planF : null;
    return { date: today, start: last ? last.end : hhmm(Date.now() - 3600000), end: now, planId, clientId: !planId && clientF && clientF !== 'none' ? clientF : null, project: '', activity: actF || '', details: '' };
  };

  return (
    <div className="tt-page">
      <div className="page-head-row">
        <div className="page-head">
          <h1>Time Tracker</h1>
          <p>Your working time per project and client — tracked live or entered after the fact — and as an Excel sheet for invoices or reports.</p>
        </div>
        <button type="button" className="btn" onClick={() => setExporting(true)} disabled={!shown.length}><FileSpreadsheet size={16} /> Export .xlsx</button>
      </div>

      {/* The live tracker */}
      <section className={`tt-live ${running ? 'running' : ''}`}>
        <div className="tt-live-main">
          <div className="tt-clock" aria-live="off">
            <span className="tt-clock-dot" aria-hidden="true" />
            <b>{fmtElapsed(running ? t.elapsed : 0)}</b>
            {running ? (
              <label className="tt-since">since <input type="time" value={hhmm(running.startedAt)} onChange={(e) => editStart(e.target.value)} aria-label="Started at" /></label>
            ) : <span className="tt-since">Ready when you are</span>}
          </div>
          <div className="tt-live-fields">
            <ProjectPick plans={plans} clients={clients} planId={draft.planId} clientId={draft.clientId} project={draft.project} onChange={changeLive} />
            <input className="input tt-live-details" value={draft.details} placeholder="What are you working on?" onChange={(e) => changeLive({ details: e.target.value })} aria-label="Details" />
          </div>
          <div className="tt-live-actions">
            {running ? (
              <>
                <button type="button" className="btn tt-stop" onClick={stop} disabled={busy}><Square size={15} fill="currentColor" /> Stop</button>
                <button type="button" className="icon-btn" onClick={() => tracker.discard().catch((e) => toast(e.message, 'error'))} title="Discard (don't save)" aria-label="Discard"><X size={16} /></button>
              </>
            ) : <button type="button" className="btn btn-primary tt-start" onClick={start} disabled={busy}><Play size={15} fill="currentColor" /> Start</button>}
          </div>
        </div>
        <div className="tt-acts" role="group" aria-label="Activity">
          <Tag size={13} className="tt-acts-ico" />
          {activities.map((a) => <button key={a} type="button" className={`tt-act ${draft.activity === a ? 'on' : ''}`} onClick={() => pickActivity(a)}>{a}</button>)}
          <ActivityAdd onAdd={addActivity} />
        </div>
      </section>

      {/* The numbers */}
      <div className="tt-stats">
        <div className="tt-stat"><span className="tt-stat-ico"><Timer size={16} /></span><b>{fmtHM(sumRange(today, today) + liveMin)}</b><span>today</span></div>
        <div className="tt-stat"><span className="tt-stat-ico"><CalendarDays size={16} /></span><b>{fmtHM(sumRange(wFrom, wTo) + liveMin)}</b><span>this week</span></div>
        <div className="tt-stat"><span className="tt-stat-ico"><CalendarDays size={16} /></span><b>{fmtHM(sumRange(mFrom, mTo) + liveMin)}</b><span>this month</span></div>
        <div className="tt-stat accent"><span className="tt-stat-ico"><Clock size={16} /></span><b>{fmtH(total)}</b><span>{PERIODS.find((p) => p[0] === period)?.[1].toLowerCase()}{clientF || planF || actF ? ' · filtered' : ''}</span></div>
      </div>

      {/* Filters */}
      <div className="tt-filters">
        <div className="segmented segmented-sm tt-periods">{PERIODS.map(([k, l]) => <button key={k} type="button" className={period === k ? 'on' : ''} onClick={() => setPeriod(k)}>{l}</button>)}</div>
        {period === 'custom' && (
          <span className="tt-range">
            <input type="date" className="input" value={custom.from} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} aria-label="From" /> –
            <input type="date" className="input" value={custom.to} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} aria-label="To" />
          </span>
        )}
        <select className="input tt-filter" value={clientF} onChange={(e) => { setClientF(e.target.value); setPlanF(''); }} aria-label="Client">
          <option value="">All clients</option>
          {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          <option value="none">Without a client</option>
        </select>
        <select className="input tt-filter" value={planF} onChange={(e) => setPlanF(e.target.value)} aria-label="Project">
          <option value="">All projects</option>
          {filterPlans.map((p) => <option key={p.id} value={p.id}>{clientF ? p.name : entryLabel({ planId: p.id }, planById, clientById)}</option>)}
          <option value="none">Without a project</option>
        </select>
        <select className="input tt-filter" value={actF} onChange={(e) => setActF(e.target.value)} aria-label="Activity">
          <option value="">All activities</option>
          {usedActs.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>

      {/* Where the time went */}
      {shown.length > 0 && (
        <div className="tt-break">
          <div className="tt-break-card">
            <div className="dash-card-kicker"><Briefcase size={14} /> By project</div>
            {byProject.map(([k, min]) => (
              <div key={k} className="tt-bar-row" title={`${k}: ${fmtH(min)}`}>
                <span className="tt-bar-label">{k}</span>
                <span className="tt-bar"><span style={{ width: `${(min / byProject[0][1]) * 100}%` }} /></span>
                <span className="tt-bar-val">{fmtH(min)}</span>
              </div>
            ))}
          </div>
          <div className="tt-break-card">
            <div className="dash-card-kicker"><Tag size={14} /> By activity</div>
            <div className="tt-chips">
              {byActivity.map(([k, min]) => (
                <button key={k} type="button" className={`tt-chip ${actF === k ? 'on' : ''}`} onClick={() => setActF(actF === k ? '' : k)}>
                  {k} <b>{fmtHM(min)}</b> <span>{Math.round((min / total) * 100)}%</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* The entries, by day */}
      <div className="tt-list-head">
        <h2>Entries <span className="count">{shown.length}</span></h2>
        <button type="button" className="btn btn-sm" onClick={() => setEditing('new')}><Plus size={15} /> Add entry</button>
      </div>
      {editing === 'new' && <EntryEditor initial={newEntry()} plans={plans} clients={clients} activities={usedActs} onSave={saveEntry} onCancel={() => setEditing(null)} />}
      {entries === null ? <div className="spinner" /> : !days.length ? (
        <div className="empty tt-empty">
          <Clock size={28} />
          <h3>Nothing tracked {period === 'all' ? 'yet' : 'in this period'}</h3>
          <p>Start the tracker above, or add what you worked on with <b>Add entry</b>.</p>
        </div>
      ) : days.map((d) => (
        <section key={d.date} className="tt-day">
          <div className="tt-day-head"><span>{d.date === today ? 'Today' : fmtDay(d.date)}</span><b>{fmtH(d.min)}</b></div>
          {d.list.map((e) => (editing === e.id ? (
            <EntryEditor key={e.id} initial={e} plans={plans} clients={clients} activities={usedActs} onSave={saveEntry} onCancel={() => setEditing(null)} />
          ) : (
            <div key={e.id} className="tt-row">
              <button type="button" className="tt-row-main" onClick={() => setEditing(e.id)} title="Edit">
                <span className="tt-row-time">{e.start}–{e.end}</span>
                <span className="tt-row-dur">{fmtHM(minutesOf(e))}</span>
                <span className="tt-row-what">
                  <span className="tt-row-project">{planById[e.planId]?.avatarEmoji ? `${planById[e.planId].avatarEmoji} ` : ''}{labelOf(e)}</span>
                  {e.details && <span className="tt-row-details">{e.details}</span>}
                </span>
                {e.activity && <span className="tt-row-act">{e.activity}</span>}
              </button>
              <Menu align="right" trigger={<button className="icon-btn tt-row-menu" aria-label="Entry options"><MoreHorizontal size={16} /></button>} items={[
                { label: 'Edit', icon: <Pencil size={15} />, onClick: () => setEditing(e.id) },
                { label: 'Again today', icon: <Copy size={15} />, onClick: () => duplicate(e) },
                ...(e.planId && planById[e.planId] ? [{ label: 'Open the project', icon: <Briefcase size={15} />, onClick: () => navigate(`/plan/${e.planId}`) }] : []),
                ...(whoOf(e, planById, clientById).client ? [{ label: 'Open the client', icon: <Building2 size={15} />, onClick: () => navigate(`/clients/${whoOf(e, planById, clientById).client.id}`) }] : []),
                { separator: true },
                { label: 'Delete', icon: <Trash2 size={15} />, danger: true, onClick: () => remove(e) },
              ]} />
            </div>
          )))}
        </section>
      ))}

      {exporting && (
        <ExportDialog query={{ from, to, client: clientF, plan: planF, activity: actF }} count={shown.length} onClose={() => setExporting(false)}
          scope={[
            clientF === 'none' ? 'without a client' : clientById[clientF]?.name,
            planF === 'none' ? 'without a project' : planById[planF]?.name,
            actF, period === 'all' ? 'all time' : period === 'custom' ? `${from || '…'} – ${to || '…'}` : PERIODS.find((x) => x[0] === period)?.[1].toLowerCase(),
          ].filter(Boolean).join(' · ')} />
      )}
    </div>
  );
}

/** "+" → a field for an activity of your own. */
function ActivityAdd({ onAdd }) {
  const [open, setOpen] = useState(false);
  const [v, setV] = useState('');
  if (!open) return <button type="button" className="tt-act tt-act-add" onClick={() => setOpen(true)} aria-label="Your own activity" title="Your own activity"><Plus size={13} /></button>;
  const done = () => { if (v.trim()) onAdd(v); setV(''); setOpen(false); };
  return (
    <input autoFocus className="tt-act-input" value={v} placeholder="Activity…" onChange={(e) => setV(e.target.value)} onBlur={done}
      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); done(); } if (e.key === 'Escape') { setV(''); setOpen(false); } }} />
  );
}
