import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Building2, Search, Clock, Cake, FileText, X, Briefcase } from 'lucide-react';
import { api } from '../lib/api.js';
import { useToast } from '../components/Toast.jsx';
import ClientAvatar from '../components/ClientAvatar.jsx';
import { isTouch } from '../lib/useMedia.js';
import { dayKey } from '../lib/timeTracker.js';
import { whoOf, minutesOf, fmtHours, fmtMoney, upcomingBirthdays, useCurrency } from '../lib/clients.js';

const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const inDays = (iso) => {
  const t = new Date(); t.setHours(0, 0, 0, 0);
  const [y, m, d] = iso.split('-').map(Number);
  const n = Math.round((new Date(y, m - 1, d) - t) / 86400000);
  return n === 0 ? 'today' : n === 1 ? 'tomorrow' : `in ${n} days`;
};

/** "New client": just a name — everything else on its page. */
function NewClientModal({ onClose, onCreated }) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const create = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      const { client, existed } = await api.createClient({ name: name.trim() });
      if (existed) toast(`You already have “${client.name}”`);
      onCreated(client);
    } catch (e) { toast(`Could not add the client: ${e.message}`, 'error'); setBusy(false); }
  };
  return (
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div className="modal client-new-modal" role="dialog" aria-modal="true" aria-label="New client">
        <div className="modal-head"><h2>New client</h2><button className="icon-btn" onClick={onClose} aria-label="Close"><X size={18} /></button></div>
        <div className="modal-body">
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Name</label>
            <input className="input" value={name} autoFocus={!isTouch()} placeholder="e.g. Acme GmbH" onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') create(); if (e.key === 'Escape') onClose(); }} />
            <div className="hint">Contacts, billing details, notes and invoices go on the client's page.</div>
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn btn-primary" onClick={create} disabled={busy || !name.trim()}>{busy ? 'Adding…' : 'Add client'}</button>
        </div>
      </div>
    </div>
  );
}

/**
 * Clients: everyone you work for — their projects, this month's hours,
 * open invoices and birthdays coming up. A client's page has the rest.
 */
export default function ClientsPage({ reloadKey }) {
  const navigate = useNavigate();
  const currency = useCurrency();
  const [clients, setClients] = useState(null);
  const [plans, setPlans] = useState([]);
  const [entries, setEntries] = useState([]);
  const [error, setError] = useState(null);
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    let alive = true;
    api.listClients().then((c) => { if (alive) setClients(c); }).catch((e) => { if (alive) setError(e.message); });
    api.listPlans().then((p) => { if (alive) setPlans(p); }).catch(() => {});
    api.getTime().then((d) => { if (alive) setEntries(d.entries); }).catch(() => {});
    return () => { alive = false; };
  }, [reloadKey]);

  const stats = useMemo(() => {
    const planById = Object.fromEntries(plans.map((p) => [p.id, p]));
    const clientById = Object.fromEntries((clients || []).map((c) => [c.id, c]));
    const month = dayKey().slice(0, 7);
    const out = {};
    for (const c of clients || []) out[c.id] = { projects: 0, open: 0, total: 0, month: 0 };
    for (const p of plans) {
      const s = out[p.clientId];
      if (!s) continue;
      s.projects += 1;
      if (p.status !== 'delivered' && p.status !== 'archived') s.open += 1;
    }
    for (const e of entries) {
      const c = whoOf(e, planById, clientById).client;
      if (!c || !out[c.id]) continue;
      const m = minutesOf(e);
      out[c.id].total += m;
      if (e.date.startsWith(month)) out[c.id].month += m;
    }
    return out;
  }, [clients, plans, entries]);
  const birthdays = useMemo(() => upcomingBirthdays(clients, 30), [clients]);
  const needle = q.trim().toLowerCase();
  const shown = (clients || []).filter((c) => !needle || [c.name, c.customerNumber, ...c.contacts.map((p) => p.name)].join(' ').toLowerCase().includes(needle));

  return (
    <div className="clients-page">
      <div className="page-head-row">
        <div className="page-head">
          <h1>Clients</h1>
          <p>Who you work for — their projects, hours, deliverables, contacts and invoices in one place.</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setAdding(true)}><Plus size={16} /> New client</button>
      </div>

      {error && <div className="center-msg">Couldn’t load: {error}</div>}
      {!clients && !error && <div className="spinner" />}
      {clients && clients.length > 6 && (
        <label className="clients-search"><Search size={15} /><input value={q} placeholder="Find a client or contact…" onChange={(e) => setQ(e.target.value)} aria-label="Find a client" /></label>
      )}
      {clients && (clients.length ? (
        <div className="clients-grid">
          {shown.map((c) => {
            const s = stats[c.id] || {};
            const bday = birthdays.find((b) => b.client.id === c.id);
            const openInv = c.invoices.filter((i) => i.status === 'open');
            const openSum = openInv.reduce((n, i) => n + (i.amount || 0), 0);
            return (
              <button key={c.id} type="button" className="client-card" onClick={() => navigate(`/clients/${c.id}`)}>
                <span className="client-card-head">
                  <ClientAvatar client={c} size="lg" />
                  <span className="client-card-name">
                    <b>{c.name}</b>
                    <span>{c.customerNumber ? `#${c.customerNumber}` : c.contacts[0]?.name || c.website.replace(/^https?:\/\//, '') || 'Client'}</span>
                  </span>
                </span>
                <span className="client-card-stats">
                  <span><Briefcase size={13} /> {s.projects ? `${plural(s.projects, 'project')}${s.open ? ` · ${s.open} open` : ''}` : 'No projects yet'}</span>
                  <span><Clock size={13} /> {fmtHours(s.month || 0)} this month · {fmtHours(s.total || 0)} in all</span>
                  {openInv.length > 0 && <span className="client-card-due"><FileText size={13} /> {openSum ? `${fmtMoney(openSum, currency)} open` : `${plural(openInv.length, 'invoice')} open`}</span>}
                  {bday && <span className="client-card-bday"><Cake size={13} /> {bday.contact.name || 'Birthday'} · {inDays(bday.date)}</span>}
                </span>
              </button>
            );
          })}
          {!needle && (
            <button type="button" className="gallery-new client-new" onClick={() => setAdding(true)}><Plus size={26} /><span>New client</span></button>
          )}
          {needle && !shown.length && <div className="hint">No client matches “{q.trim()}”.</div>}
        </div>
      ) : (
        <div className="empty">
          <Building2 size={30} />
          <h3>No clients yet</h3>
          <p>Add the people and companies you work for — or give a project a client and it shows up here.</p>
          <button className="btn btn-primary" onClick={() => setAdding(true)}><Plus size={16} /> New client</button>
        </div>
      ))}
      {adding && <NewClientModal onClose={() => setAdding(false)} onCreated={(c) => { setAdding(false); navigate(`/clients/${c.id}`); }} />}
    </div>
  );
}
