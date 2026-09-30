import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, Plus, Play, Square, MoreHorizontal, Trash2, FileSpreadsheet, Clock, Briefcase, PackageCheck, CalendarClock,
  Flag, Cake, Users, Mail, Phone, Globe, Pencil, Check, FileText, UploadCloud, ExternalLink, Receipt, StickyNote,
  ImageOff, Timer, Wallet, ArrowRight, Library,
} from 'lucide-react';
import { api, clientFileUrl } from '../lib/api.js';
import { useSaver } from '../lib/autosave.js';
import { TAG_COLORS, tagColor } from '../lib/types.js';
import { useToast } from '../components/Toast.jsx';
import { useConfirm } from '../components/ConfirmDialog.jsx';
import Menu from '../components/Menu.jsx';
import ClientAvatar from '../components/ClientAvatar.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import AutoTextarea from '../components/AutoTextarea.jsx';
import { useFromApp } from '../components/FromApp.jsx';
import { DELIVERABLE_STATUS } from '../components/plan/DeliverablesBlock.jsx';
import { useTimeTracker, tracker, dayKey } from '../lib/timeTracker.js';
import {
  minutesOf, fmtHours, fmtMoney, amountOf, budgetMinutes, budgetState, budgetText, nextBirthday, turnsOn, useCurrency,
} from '../lib/clients.js';
import '../styles/clients.css';

const rid = () => Math.random().toString(36).slice(2, 10);
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const today0 = () => { const t = new Date(); t.setHours(0, 0, 0, 0); return t; };
const dateOf = (iso) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); };
const daysTo = (iso) => Math.round((dateOf(iso) - today0()) / 86400000);
const when = (iso) => { const n = daysTo(iso); return n === 0 ? 'today' : n === 1 ? 'tomorrow' : n === -1 ? 'yesterday' : n < 0 ? `${-n} days ago` : `in ${n} days`; };
const fmtDate = (iso, opts = { day: 'numeric', month: 'short', year: 'numeric' }) => (iso ? dateOf(iso).toLocaleDateString(undefined, opts) : '');
const isOpen = (p) => p.status !== 'delivered' && p.status !== 'archived';
const statusOfDl = (k) => DELIVERABLE_STATUS.find((s) => s.key === k) || DELIVERABLE_STATUS[0];
const spec = (d) => [d.aspect, d.resolution, d.fps && `${d.fps} fps`, d.codec, d.length].filter((x) => x && String(x).trim()).join(' · ');
const hrefOf = (url) => (/^https?:\/\//i.test(url) ? url : `https://${url}`);

/**
 * A client: who they are (contacts with birthdays, billing details, notes),
 * what you do for them (projects with hours, budget and rate, every
 * deliverable, what's coming up) and what you've billed (invoice PDFs).
 */
export default function ClientDetail({ onNewPlan }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [dialog, ask] = useConfirm();
  const saver = useSaver(600);
  const currency = useCurrency();
  const t = useTimeTracker();
  const [client, setClient] = useState(null);
  const [plans, setPlans] = useState([]);
  const [entries, setEntries] = useState([]);
  const [error, setError] = useState(null);
  const pending = useRef({});
  const logoRef = useRef(null);
  const [appPicker, pickFromApp] = useFromApp();

  useEffect(() => {
    let alive = true;
    setClient(null); setError(null);
    api.getClient(id).then((c) => { if (alive) setClient(c); }).catch((e) => { if (alive) setError(e.message); });
    api.listPlans().then((p) => { if (alive) setPlans(p); }).catch(() => {});
    api.getTime({ client: id }).then((d) => { if (alive) setEntries(d.entries); }).catch(() => {});
    return () => { alive = false; };
  }, [id, t.running?.startedAt]); // again once a tracker stops

  // Fields are saved together shortly after typing; a name someone else has comes back as a message.
  const patch = (fields) => {
    setClient((c) => ({ ...c, ...fields }));
    Object.assign(pending.current, fields);
    const cid = id;
    saver.schedule('fields', async () => {
      const body = pending.current; pending.current = {};
      try { await api.updateClient(cid, body); } catch (e) { toast(/^409/.test(e.message) ? 'You already have a client with that name — pick another one.' : `Could not save: ${e.message}`, 'error'); }
    });
  };

  const mine = useMemo(() => plans.filter((p) => p.clientId === id)
    .sort((a, b) => Number(isOpen(b)) - Number(isOpen(a)) || (b.createdAt || 0) - (a.createdAt || 0)), [plans, id]);
  const planById = useMemo(() => Object.fromEntries(plans.map((p) => [p.id, p])), [plans]);
  const running = t.running && (t.running.clientId === id || planById[t.running.planId]?.clientId === id) ? t.running : null;
  const liveMin = running ? Math.floor(t.elapsed / 60000) : 0;

  if (error) return <div className="center-msg">Couldn’t load: {error} <button className="btn btn-sm" onClick={() => navigate('/clients')}>Back to clients</button></div>;
  if (!client) return <div className="spinner" />;

  // ---- numbers
  const month = dayKey().slice(0, 7);
  const minOf = (list) => list.reduce((n, e) => n + minutesOf(e), 0);
  const totalMin = minOf(entries) + liveMin;
  const monthMin = minOf(entries.filter((e) => e.date.startsWith(month))) + liveMin;
  const byPlan = (pid) => entries.filter((e) => e.planId === pid);
  const liveFor = (pid) => (running?.planId === pid ? liveMin : 0);
  const value = mine.reduce((n, p) => n + (amountOf(minOf(byPlan(p.id)) + liveFor(p.id), p.rate) || 0), 0);
  const deliverables = mine.flatMap((p) => (p.blocks || []).filter((b) => b.type === 'deliverables')
    .flatMap((b) => (b.items || []).map((d) => ({ ...d, plan: p, blockId: b.id }))));
  const delivered = deliverables.filter((d) => d.status === 'delivered').length;
  const invoices = [...client.invoices].sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.addedAt - a.addedAt);
  const openSum = invoices.filter((i) => i.status === 'open').reduce((n, i) => n + (i.amount || 0), 0);
  const paidSum = invoices.filter((i) => i.status === 'paid').reduce((n, i) => n + (i.amount || 0), 0);

  // ---- actions
  const track = async () => {
    try {
      if (running) { const e = await tracker.stop(); toast(e ? 'Time saved' : 'Under a minute — nothing saved'); return; }
      if (t.running) await tracker.stop(); // one at a time
      await tracker.start({ clientId: id });
      toast(`Tracking time for ${client.name}`);
    } catch (e) { toast(e.message, 'error'); }
  };
  const setLogo = async (file) => {
    if (!file) return;
    try { setClient(await api.setClientLogo(id, file)); } catch (e) { toast(`Upload failed: ${e.message}`, 'error'); }
  };
  const removeLogo = async () => { try { setClient(await api.removeClientLogo(id)); } catch (e) { toast(e.message, 'error'); } };
  const remove = () => ask({
    title: `Delete ${client.name}?`,
    message: `The client goes to the Trash (with its invoices). ${mine.length ? `Its ${plural(mine.length, 'project')} stay, without a client; ` : ''}restoring it links everything again.`,
    confirmLabel: 'Delete', danger: true,
    onConfirm: async () => {
      try {
        await saver.flush();
        const { trashId } = await api.removeClient(id);
        toast(`${client.name} moved to Trash`, 'ok', { label: 'Undo', onClick: async () => { await api.restoreTrash(trashId); navigate(`/clients/${id}`); } });
        navigate('/clients');
      } catch (e) { toast(`Could not delete: ${e.message}`, 'error'); }
    },
  });
  const exportUrl = (() => {
    let lang = 'de'; let style = 'app';
    try { lang = localStorage.getItem('ttExportLang') || 'de'; style = localStorage.getItem('ttExportStyle') || 'app'; } catch { /* ignore */ }
    return api.timeExportUrl({ client: id, lang, style });
  })();

  // ---- what's coming up: milestones and deadlines of open projects, birthdays
  const upcoming = [
    ...mine.filter(isOpen).flatMap((p) => [
      ...(p.milestones || []).filter((m) => m.date && !m.done).map((m) => ({ key: `${p.id}:${m.id}`, date: m.date, label: m.title || 'Milestone', sub: p.name, icon: CalendarClock, to: `/plan/${p.id}` })),
      ...(p.end ? [{ key: `${p.id}:end`, date: p.end, label: 'Deadline', sub: p.name, icon: Flag, to: `/plan/${p.id}`, end: true }] : []),
    ]).filter((x) => daysTo(x.date) >= -7),
    ...client.contacts.map((c) => {
      const next = nextBirthday(c.birthday);
      if (!next || (next - today0()) / 86400000 > 60) return null;
      const age = turnsOn(c.birthday, next);
      return { key: `b:${c.id}`, date: dayKey(next), label: `${c.name || 'Birthday'}${age ? ` turns ${age}` : '’s birthday'}`, sub: 'Birthday', icon: Cake, bday: true };
    }).filter(Boolean),
  ].sort((a, b) => a.date.localeCompare(b.date)).slice(0, 8);

  return (
    <div className="client-page">
      <button type="button" className="detail-back" onClick={() => navigate('/clients')}><ArrowLeft size={16} /> Clients</button>

      {/* Who */}
      <header className="client-head">
        <Menu align="left" trigger={(
          <button type="button" className="client-logo-btn" aria-label="Logo and colour" title="Logo and colour"><ClientAvatar client={client} size="xl" /></button>
        )} items={[
          { label: client.logo ? 'Replace logo…' : 'Upload logo…', icon: <UploadCloud size={15} />, onClick: () => logoRef.current?.click() },
          { label: 'Logo from the app…', icon: <Library size={15} />, onClick: async () => { const got = await pickFromApp({ title: 'Logo from the app' }); if (got) setLogo({ source: got.source }); } },
          ...(client.logo ? [{ label: 'Remove logo', icon: <ImageOff size={15} />, onClick: removeLogo }] : []),
          { separator: true },
          { heading: 'Colour' },
          ...TAG_COLORS.map((c) => ({ label: c.key[0].toUpperCase() + c.key.slice(1), icon: <span className="status-dot" style={{ background: c.fg }} />, checked: client.color === c.key, keepOpen: true, onClick: () => patch({ color: c.key }) })),
        ]} />
        <input ref={logoRef} type="file" accept="image/*" hidden onChange={(e) => { setLogo(e.target.files?.[0]); e.target.value = ''; }} />
        {appPicker}
        <div className="client-head-main">
          <input className="client-name" value={client.name} onChange={(e) => patch({ name: e.target.value })} onBlur={() => { if (!client.name.trim()) patch({ name: 'Client' }); }} aria-label="Client name" />
          <div className="client-head-meta">
            {client.customerNumber && <span className="client-chip">#{client.customerNumber}</span>}
            {client.website && <a className="client-chip" href={hrefOf(client.website)} target="_blank" rel="noreferrer"><Globe size={13} /> {client.website.replace(/^https?:\/\//, '').replace(/\/$/, '')}</a>}
            {client.email && <a className="client-chip" href={`mailto:${client.email}`}><Mail size={13} /> {client.email}</a>}
            {client.phone && <a className="client-chip" href={`tel:${client.phone.replace(/\s+/g, '')}`}><Phone size={13} /> {client.phone}</a>}
          </div>
        </div>
        <div className="client-head-actions">
          <button type="button" className="btn btn-primary" onClick={() => onNewPlan({ clientId: id })}><Plus size={16} /> New project</button>
          <button type="button" className={`btn ${running ? 'tt-stop' : ''}`} onClick={track} title={running ? 'Stop tracking' : `Track time for ${client.name} (no project)`}>
            {running ? <><Square size={14} fill="currentColor" /> Stop</> : <><Play size={14} fill="currentColor" /> Track time</>}
          </button>
          <Menu align="right" trigger={<button type="button" className="icon-btn" aria-label="More"><MoreHorizontal size={18} /></button>} items={[
            { label: 'All time entries', icon: <Clock size={15} />, onClick: () => navigate(`/time?client=${id}`) },
            { label: 'Export hours (.xlsx)', icon: <FileSpreadsheet size={15} />, onClick: () => { window.location.href = exportUrl; } },
            { separator: true },
            { label: 'Delete client', icon: <Trash2 size={15} />, danger: true, onClick: remove },
          ]} />
        </div>
      </header>

      {/* The numbers */}
      <div className="client-stats">
        <Stat icon={Timer} value={fmtHours(totalMin)} label="tracked in all" />
        <Stat icon={Clock} value={fmtHours(monthMin)} label="this month" />
        <Stat icon={Briefcase} value={`${mine.filter(isOpen).length} / ${mine.length}`} label="projects open" />
        <Stat icon={PackageCheck} value={deliverables.length ? `${delivered} / ${deliverables.length}` : '—'} label="delivered" />
        {value > 0 && <Stat icon={Wallet} value={fmtMoney(value, currency)} label="tracked × rate" />}
        <Stat icon={Receipt} value={openSum ? fmtMoney(openSum, currency) : paidSum ? fmtMoney(paidSum, currency) : '—'} label={openSum ? 'invoiced, open' : 'invoiced, paid'} tone={openSum ? 'warn' : ''} />
      </div>

      <div className="client-layout">
        <div className="client-main">
          <Projects plans={mine} entriesOf={byPlan} liveFor={liveFor} currency={currency} onOpen={(pid) => navigate(`/plan/${pid}`)} onNew={() => onNewPlan({ clientId: id })} />
          <Deliverables list={deliverables} onOpen={(d) => navigate(`/plan/${d.plan.id}?block=${d.blockId}`)} />
          <TimeSection entries={entries} plans={mine} liveMin={liveMin} running={running} exportUrl={exportUrl} onAll={() => navigate(`/time?client=${id}`)} />
          <Invoices client={client} setClient={setClient} invoices={invoices} plans={mine} currency={currency} openSum={openSum} paidSum={paidSum} saver={saver} toast={toast} />
        </div>
        <aside className="client-side">
          <section className="client-card-sec">
            <h2><CalendarClock size={15} /> Coming up</h2>
            {upcoming.length ? (
              <ul className="client-upcoming">
                {upcoming.map((u) => (
                  <li key={u.key} className={`${u.bday ? 'bday' : ''} ${u.end ? 'end' : ''} ${daysTo(u.date) < 0 ? 'late' : ''}`}>
                    <button type="button" onClick={() => u.to && navigate(u.to)} disabled={!u.to}>
                      <span className="client-up-ico"><u.icon size={14} /></span>
                      <span className="client-up-what"><b>{u.label}</b><span>{u.sub}</span></span>
                      <span className="client-up-when"><b>{fmtDate(u.date, { day: 'numeric', month: 'short' })}</b><span>{when(u.date)}</span></span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : <p className="client-empty">No dates in the next weeks — milestones, deadlines and birthdays show here.</p>}
          </section>
          <Contacts contacts={client.contacts} onChange={(contacts) => patch({ contacts })} toast={toast} />
          <Details client={client} patch={patch} />
          <section className="client-card-sec">
            <h2><StickyNote size={15} /> Notes</h2>
            <AutoTextarea className="client-notes" value={client.notes} placeholder="How they like to work, payment terms, preferences…" onChange={(e) => patch({ notes: e.target.value })} aria-label="Notes" />
          </section>
        </aside>
      </div>
      {dialog}
    </div>
  );
}

function Stat({ icon: Icon, value, label, tone = '' }) {
  return <div className={`tt-stat ${tone}`}><span className="tt-stat-ico"><Icon size={16} /></span><b>{value}</b><span>{label}</span></div>;
}

/** The client's projects: status, dates, deliverables, hours with budget or amount. */
function Projects({ plans, entriesOf, liveFor, currency, onOpen, onNew }) {
  return (
    <section className="client-card-sec">
      <div className="client-sec-head"><h2><Briefcase size={15} /> Projects <span className="count">{plans.length}</span></h2>
        <button type="button" className="btn btn-sm" onClick={onNew}><Plus size={14} /> New project</button></div>
      {plans.length ? (
        <div className="client-projects">
          {plans.map((p) => {
            const list = entriesOf(p.id);
            const min = list.reduce((n, e) => n + minutesOf(e), 0) + liveFor(p.id);
            const used = budgetMinutes(p, list, liveFor(p.id));
            const b = budgetState(p, used);
            const amount = amountOf(min, p.rate);
            const dls = (p.blocks || []).filter((x) => x.type === 'deliverables').flatMap((x) => x.items || []);
            const done = dls.filter((d) => d.status === 'delivered').length;
            return (
              <button key={p.id} type="button" className={`client-project ${isOpen(p) ? '' : 'closed'}`} onClick={() => onOpen(p.id)}>
                <span className="client-project-emoji">{p.avatarEmoji || (p.name || '?')[0].toUpperCase()}</span>
                <span className="client-project-main">
                  <span className="client-project-name"><b>{p.name}</b><StatusBadge status={p.status} /></span>
                  <span className="client-project-sub">
                    {(p.start || p.end) && <span><CalendarClock size={12} /> {[p.start, p.end].filter(Boolean).map((d) => fmtDate(d, { day: 'numeric', month: 'short' })).join(' – ')}</span>}
                    {dls.length > 0 && <span><PackageCheck size={12} /> {done}/{dls.length} delivered</span>}
                    {p.rate ? <span><Wallet size={12} /> {fmtMoney(p.rate, currency)}/h</span> : null}
                  </span>
                </span>
                <span className={`client-project-time ${b ? `budget-${b.level}` : ''}`}>
                  <b>{b ? budgetText(p, used) : fmtHours(min)}</b>
                  {b ? <span className="client-budget-bar"><span style={{ width: `${Math.min(100, b.ratio * 100)}%` }} /></span>
                    : amount ? <span>{fmtMoney(amount, currency)}</span> : <span>{min ? 'tracked' : 'no time yet'}</span>}
                </span>
                <ArrowRight size={16} className="client-project-go" />
              </button>
            );
          })}
        </div>
      ) : <p className="client-empty">No projects yet. A new one starts with this client already set.</p>}
    </section>
  );
}

/** Every deliverable of the client's projects, by project. */
function Deliverables({ list, onOpen }) {
  const [show, setShow] = useState('open');
  if (!list.length) return null;
  const shown = list.filter((d) => (show === 'all' ? true : show === 'done' ? d.status === 'delivered' : d.status !== 'delivered'));
  const groups = [];
  for (const d of shown) { let g = groups.find((x) => x.plan.id === d.plan.id); if (!g) { g = { plan: d.plan, items: [] }; groups.push(g); } g.items.push(d); }
  const counts = { open: list.filter((d) => d.status !== 'delivered').length, done: list.filter((d) => d.status === 'delivered').length, all: list.length };
  return (
    <section className="client-card-sec">
      <div className="client-sec-head"><h2><PackageCheck size={15} /> Deliverables</h2>
        <div className="segmented segmented-sm">{[['open', 'Open'], ['done', 'Delivered'], ['all', 'All']].map(([k, l]) => (
          <button key={k} type="button" className={show === k ? 'on' : ''} onClick={() => setShow(k)}>{l} <span className="count">{counts[k]}</span></button>
        ))}</div>
      </div>
      {groups.length ? groups.map((g) => (
        <div key={g.plan.id} className="client-dl-group">
          <div className="client-dl-plan">{g.plan.avatarEmoji ? `${g.plan.avatarEmoji} ` : ''}{g.plan.name}</div>
          {g.items.map((d) => {
            const st = statusOfDl(d.status); const c = tagColor(st.color);
            return (
              <button key={`${d.blockId}:${d.id}`} type="button" className={`client-dl ${d.status === 'delivered' ? 'done' : ''}`} onClick={() => onOpen(d)}>
                <span className="client-dl-name">{d.name || 'Deliverable'}</span>
                <span className="client-dl-spec">{spec(d)}</span>
                <span className="dl-status" style={{ background: c.bg, color: c.fg }}>{st.label}</span>
              </button>
            );
          })}
        </div>
      )) : <p className="client-empty">{show === 'done' ? 'Nothing delivered yet.' : 'Everything’s delivered. 🎉'}</p>}
    </section>
  );
}

/** Hours per project and the latest entries. */
function TimeSection({ entries, plans, liveMin, running, exportUrl, onAll }) {
  const rows = [
    ...plans.map((p) => ({ key: p.id, label: p.name, min: entries.filter((e) => e.planId === p.id).reduce((n, e) => n + minutesOf(e), 0) + (running?.planId === p.id ? liveMin : 0) })),
    { key: '_client', label: 'Without a project', min: entries.filter((e) => !e.planId).reduce((n, e) => n + minutesOf(e), 0) + (running && !running.planId ? liveMin : 0) },
  ].filter((r) => r.min > 0).sort((a, b) => b.min - a.min);
  const recent = [...entries].sort((a, b) => (b.date + b.start).localeCompare(a.date + a.start)).slice(0, 6);
  const nameOf = (e) => plans.find((p) => p.id === e.planId)?.name || e.project || 'Without a project';
  return (
    <section className="client-card-sec">
      <div className="client-sec-head"><h2><Clock size={15} /> Time</h2>
        <span className="client-sec-actions">
          <button type="button" className="btn btn-sm btn-ghost" onClick={onAll}>All entries</button>
          <a className="btn btn-sm" href={exportUrl} download><FileSpreadsheet size={14} /> Export .xlsx</a>
        </span>
      </div>
      {rows.length ? (
        <>
          {rows.map((r) => (
            <div key={r.key} className="tt-bar-row">
              <span className="tt-bar-label">{r.label}</span>
              <span className="tt-bar"><span style={{ width: `${(r.min / rows[0].min) * 100}%` }} /></span>
              <span className="tt-bar-val">{fmtHours(r.min)}</span>
            </div>
          ))}
          <ul className="client-entries">
            {recent.map((e) => (
              <li key={e.id}>
                <span className="client-entry-date">{fmtDate(e.date, { day: 'numeric', month: 'short' })}</span>
                <span className="client-entry-what"><b>{nameOf(e)}</b>{(e.activity || e.details) && <span>{[e.activity, e.details].filter(Boolean).join(' · ')}</span>}</span>
                <span className="client-entry-dur">{Math.floor(minutesOf(e) / 60)}:{String(minutesOf(e) % 60).padStart(2, '0')}</span>
              </li>
            ))}
          </ul>
        </>
      ) : <p className="client-empty">No time tracked yet — start the tracker here, on a project or in the Time Tracker.</p>}
    </section>
  );
}

/** The people: name, role, email, phone, birthday (it shows in the dashboard's calendar). */
function Contacts({ contacts, onChange, toast }) {
  const [editing, setEditing] = useState(null);
  const set = (cid, p) => onChange(contacts.map((c) => (c.id === cid ? { ...c, ...p } : c)));
  const add = () => { const c = { id: rid(), name: '', role: '', email: '', phone: '', birthday: '' }; onChange([...contacts, c]); setEditing(c.id); };
  const remove = (c) => {
    const before = contacts;
    onChange(contacts.filter((x) => x.id !== c.id));
    toast(`${c.name || 'Contact'} removed`, 'ok', { label: 'Undo', onClick: () => onChange(before) });
  };
  return (
    <section className="client-card-sec">
      <div className="client-sec-head"><h2><Users size={15} /> Contacts</h2><button type="button" className="btn btn-sm" onClick={add}><Plus size={14} /> Add</button></div>
      {!contacts.length && <p className="client-empty">Who you talk to — with email, phone and birthday.</p>}
      {contacts.map((c) => (editing === c.id ? (
        <div key={c.id} className="client-contact editing">
          <div className="client-form">
            <label><span>Name</span><input className="input" value={c.name} autoFocus onChange={(e) => set(c.id, { name: e.target.value })} /></label>
            <label><span>Role</span><input className="input" value={c.role} placeholder="e.g. Marketing lead" onChange={(e) => set(c.id, { role: e.target.value })} /></label>
            <label><span>Email</span><input className="input" type="email" value={c.email} onChange={(e) => set(c.id, { email: e.target.value })} /></label>
            <label><span>Phone</span><input className="input" type="tel" value={c.phone} onChange={(e) => set(c.id, { phone: e.target.value })} /></label>
            <label><span>Birthday</span><input className="input" type="date" value={c.birthday} onChange={(e) => set(c.id, { birthday: e.target.value })} /></label>
          </div>
          <div className="client-contact-foot">
            <button type="button" className="btn btn-sm btn-ghost danger-text" onClick={() => { setEditing(null); remove(c); }}><Trash2 size={14} /> Remove</button>
            <button type="button" className="btn btn-sm btn-primary" onClick={() => setEditing(null)}><Check size={14} /> Done</button>
          </div>
        </div>
      ) : (
        <div key={c.id} className="client-contact">
          <div className="client-contact-top">
            <span className="client-contact-name"><b>{c.name || 'Unnamed contact'}</b>{c.role && <span>{c.role}</span>}</span>
            <button type="button" className="icon-btn" onClick={() => setEditing(c.id)} aria-label={`Edit ${c.name || 'contact'}`}><Pencil size={14} /></button>
          </div>
          <div className="client-contact-lines">
            {c.email && <a href={`mailto:${c.email}`}><Mail size={13} /> {c.email}</a>}
            {c.phone && <a href={`tel:${c.phone.replace(/\s+/g, '')}`}><Phone size={13} /> {c.phone}</a>}
            {c.birthday && (() => {
              const next = nextBirthday(c.birthday); const age = next ? turnsOn(c.birthday, next) : null;
              return <span><Cake size={13} /> {fmtDate(c.birthday, { day: 'numeric', month: 'long' })}{next ? ` · ${when(dayKey(next))}${age ? ` (${age})` : ''}` : ''}</span>;
            })()}
          </div>
        </div>
      )))}
    </section>
  );
}

/** Company details and billing: website, general email / phone, addresses, VAT ID, customer number. */
function Details({ client, patch }) {
  const f = (key, label, props = {}) => (
    <label><span>{label}</span><input className="input" value={client[key]} onChange={(e) => patch({ [key]: e.target.value })} {...props} /></label>
  );
  return (
    <section className="client-card-sec">
      <h2><FileText size={15} /> Details &amp; billing</h2>
      <div className="client-form">
        {f('customerNumber', 'Customer number', { placeholder: 'e.g. K-1042' })}
        {f('vatId', 'VAT ID', { placeholder: 'e.g. DE123456789' })}
        {f('email', 'Email (general / invoices)', { type: 'email' })}
        {f('phone', 'Phone', { type: 'tel' })}
        {f('website', 'Website', { placeholder: 'acme.com' })}
        <label className="wide"><span>Address</span><AutoTextarea className="input" value={client.address} onChange={(e) => patch({ address: e.target.value })} /></label>
        <label className="wide"><span>Billing address <i>{client.billingAddress ? '' : 'if it’s another one'}</i></span><AutoTextarea className="input" value={client.billingAddress} onChange={(e) => patch({ billingAddress: e.target.value })} /></label>
      </div>
    </section>
  );
}

/** Invoice PDFs: number, date, amount, project, open / paid. */
function Invoices({ client, setClient, invoices, plans, currency, openSum, paidSum, saver, toast }) {
  const fileRef = useRef(null);
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const upload = async (files) => {
    const list = [...(files || [])].filter((f) => /\.(pdf|png|jpe?g|webp)$/i.test(f.name));
    if (!list.length) { toast('Pick a PDF (or a picture of the invoice).', 'error'); return; }
    setBusy(true);
    try {
      const { client: c } = await api.addInvoices(client.id, list, { date: dayKey(), planId: plans.length === 1 ? plans[0].id : '' });
      setClient((x) => ({ ...x, invoices: c.invoices }));
      toast(list.length === 1 ? 'Invoice added — add its number and amount' : `${list.length} invoices added`);
    } catch (e) { toast(`Upload failed: ${e.message}`, 'error'); } finally { setBusy(false); }
  };
  const waiting = useRef({}); // per invoice: the changes not sent yet (all of them go together)
  const edit = (inv, p) => {
    setClient((x) => ({ ...x, invoices: x.invoices.map((i) => (i.id === inv.id ? { ...i, ...p } : i)) }));
    waiting.current[inv.id] = { ...waiting.current[inv.id], ...p };
    saver.schedule(`inv:${inv.id}`, () => {
      const body = waiting.current[inv.id]; delete waiting.current[inv.id];
      return api.updateInvoice(client.id, inv.id, body).catch((e) => toast(`Could not save: ${e.message}`, 'error'));
    }, { immediate: 'status' in p || 'planId' in p });
  };
  const remove = async (inv) => {
    try {
      const { trashId } = await api.removeInvoice(client.id, inv.id);
      setClient((x) => ({ ...x, invoices: x.invoices.filter((i) => i.id !== inv.id) }));
      toast('Invoice moved to Trash', 'ok', { label: 'Undo', onClick: async () => { await api.restoreTrash(trashId); setClient(await api.getClient(client.id)); } });
    } catch (e) { toast(e.message, 'error'); }
  };
  return (
    <section className={`client-card-sec client-invoices ${drag ? 'drag' : ''}`}
      onDragOver={(e) => { if ([...e.dataTransfer.types].includes('Files')) { e.preventDefault(); setDrag(true); } }}
      onDragLeave={() => setDrag(false)} onDrop={(e) => { e.preventDefault(); setDrag(false); upload(e.dataTransfer.files); }}>
      <div className="client-sec-head"><h2><Receipt size={15} /> Invoices <span className="count">{invoices.length}</span></h2>
        <button type="button" className="btn btn-sm" onClick={() => fileRef.current?.click()} disabled={busy}><UploadCloud size={14} /> {busy ? 'Uploading…' : 'Upload'}</button></div>
      <input ref={fileRef} type="file" accept="application/pdf,.pdf,image/*" multiple hidden onChange={(e) => { upload(e.target.files); e.target.value = ''; }} />
      {(openSum > 0 || paidSum > 0) && (
        <div className="client-inv-sums"><span className="open">{fmtMoney(openSum, currency)} open</span><span>{fmtMoney(paidSum, currency)} paid</span></div>
      )}
      {!invoices.length && <button type="button" className="client-inv-drop" onClick={() => fileRef.current?.click()}><UploadCloud size={20} /><span>Drop invoice PDFs here, or click to pick them</span></button>}
      {invoices.map((inv) => (
        <div key={inv.id} className={`client-inv ${inv.status}`}>
          <div className="client-inv-top">
            <a className="client-inv-file" href={clientFileUrl(client, inv.file)} target="_blank" rel="noreferrer" title={`Open ${inv.name}`}><FileText size={16} /></a>
            <input className="client-inv-num" value={inv.number} placeholder="Invoice no." onChange={(e) => edit(inv, { number: e.target.value })} aria-label="Invoice number" />
            <button type="button" className={`client-inv-status ${inv.status}`} onClick={() => edit(inv, { status: inv.status === 'paid' ? 'open' : 'paid' })} title="Open ↔ paid">
              {inv.status === 'paid' ? <><Check size={12} /> Paid</> : 'Open'}
            </button>
            <Menu align="right" trigger={<button type="button" className="icon-btn" aria-label="Invoice options"><MoreHorizontal size={15} /></button>} items={[
              { label: 'Open the PDF', icon: <ExternalLink size={15} />, onClick: () => window.open(clientFileUrl(client, inv.file), '_blank', 'noopener') },
              { separator: true },
              { label: 'Delete', icon: <Trash2 size={15} />, danger: true, onClick: () => remove(inv) },
            ]} />
          </div>
          <div className="client-inv-fields">
            <input type="date" className="input" value={inv.date} onChange={(e) => edit(inv, { date: e.target.value })} aria-label="Invoice date" />
            <span className="client-inv-amount">
              <input className="input" inputMode="decimal" defaultValue={inv.amount != null ? inv.amount.toFixed(2) : ''} key={`${inv.id}:${inv.amount ?? ''}`} placeholder="Amount"
                onBlur={(e) => { const v = e.target.value.trim().replace(',', '.'); const n = v === '' ? null : Number(v); if (v === '' || Number.isFinite(n)) edit(inv, { amount: n }); }} aria-label="Amount" />
              <i>{currency}</i>
            </span>
            <select className="input" value={inv.planId || ''} onChange={(e) => edit(inv, { planId: e.target.value || null })} aria-label="Project">
              <option value="">No project</option>
              {plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div className="client-inv-name" title={inv.name}>{inv.name}</div>
        </div>
      ))}
      {invoices.length > 0 && <button type="button" className="client-inv-more" onClick={() => fileRef.current?.click()}><Plus size={14} /> Add invoice PDFs (or drop them here)</button>}
    </section>
  );
}
