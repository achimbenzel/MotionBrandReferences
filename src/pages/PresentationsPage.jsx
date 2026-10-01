import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Presentation as DeckIcon, MoreHorizontal, Play, Copy, Trash2, Pin, PinOff, Search, X, Check } from 'lucide-react';
import { api } from '../lib/api.js';
import { DECK_TEMPLATES, DECK_KINDS } from '../lib/slides.js';
import { fmtDate } from '../lib/format.js';
import { useToast } from '../components/Toast.jsx';
import Menu from '../components/Menu.jsx';
import { SlideView } from '../components/presentations/Slide.jsx';
import Presenter from '../components/presentations/Presenter.jsx';
import '@fontsource/dm-sans/600.css';
import '@fontsource/dm-sans/800.css';
import '@fontsource/dm-sans/400-italic.css';
import '@fontsource/jetbrains-mono/600.css';
import '../styles/presentation.css';

const kindLabel = (k) => DECK_KINDS.find((x) => x.key === k)?.label || 'Presentation';

/**
 * Presentations: decks for clients — a project proposal, a brand identity, a
 * case study — in the style of your proposal template. Each card shows its
 * cover; open it to edit, present it fullscreen or export a PDF.
 */
export default function PresentationsPage({ reloadKey }) {
  const navigate = useNavigate();
  const toast = useToast();
  const [data, setData] = useState(null); // { presentations, defaults }
  const [error, setError] = useState(null);
  const [clients, setClients] = useState([]);
  const [creating, setCreating] = useState(false);
  const [q, setQ] = useState('');
  const [presenting, setPresenting] = useState(null);

  const load = () => api.listPresentations().then(setData).catch((e) => setError(e.message));
  useEffect(() => { load(); api.listClients().then(setClients).catch(() => {}); }, [reloadKey]);

  const clientName = useMemo(() => new Map(clients.map((c) => [c.id, c.name])), [clients]);
  const needle = q.trim().toLowerCase();
  const list = (data?.presentations || []).filter((p) => !needle || `${p.title} ${clientName.get(p.clientId) || ''} ${kindLabel(p.kind)}`.toLowerCase().includes(needle));

  const patch = async (p, body) => {
    try { const x = await api.updatePresentation(p.id, body); setData((d) => ({ ...d, presentations: d.presentations.map((y) => (y.id === x.id ? x : y)) })); load(); } catch (e) { toast(e.message, 'error'); }
  };
  const duplicate = async (p) => { try { const x = await api.duplicatePresentation(p.id); navigate(`/presentations/${x.id}`); } catch (e) { toast(e.message, 'error'); } };
  const remove = async (p) => {
    try {
      const { trashId } = await api.removePresentation(p.id);
      setData((d) => ({ ...d, presentations: d.presentations.filter((x) => x.id !== p.id) }));
      toast(`“${p.title || 'Presentation'}” moved to Trash`, 'ok', { label: 'Undo', onClick: async () => { await api.restoreTrash(trashId); load(); } });
    } catch (e) { toast(e.message, 'error'); }
  };

  if (error) return <div className="center-msg">Couldn’t load: {error}</div>;
  if (!data) return <div className="spinner" />;
  return (
    <div className="pz-list-page">
      <div className="page-head-row">
        <div className="page-head">
          <h1>Presentations</h1>
          <p>Project proposals, brand identities, case studies — in the style of your proposal template. Present them fullscreen or send them as PDF.</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}><Plus size={16} /> New presentation</button>
      </div>
      {data.presentations.length > 0 && (
        <div className="pz-list-head">
          <label className="clients-search pz-search"><Search size={15} /><input value={q} placeholder="Find…" onChange={(e) => setQ(e.target.value)} aria-label="Find a presentation" /></label>
        </div>
      )}
      {!data.presentations.length ? (
        <div className="empty pz-empty">
          <DeckIcon size={30} />
          <h3>No presentations yet</h3>
          <p>Start from a project proposal, a brand identity or a case study — the slides are there, you fill in your text and pictures.</p>
          <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}><Plus size={16} /> New presentation</button>
        </div>
      ) : (
        <div className="pz-grid-list">
          {list.map((p) => (
            <div key={p.id} className="pz-deck" role="button" tabIndex={0} onClick={() => navigate(`/presentations/${p.id}`)} onKeyDown={(e) => { if (e.key === 'Enter') navigate(`/presentations/${p.id}`); }}>
              <div className="pz-deck-cover"><SlideView deck={p} slide={p.slides[0]} index={0} total={p.slides.length} /></div>
              <div className="pz-deck-meta">
                <b>{p.pinned && <Pin size={12} className="pz-pin" />}{p.title || 'Untitled presentation'}</b>
                <small>{[kindLabel(p.kind), clientName.get(p.clientId), `${p.slides.length} slide${p.slides.length === 1 ? '' : 's'}`, fmtDate(p.updatedAt, { day: 'numeric', month: 'short' })].filter(Boolean).join(' · ')}</small>
              </div>
              <span onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                <Menu align="right" trigger={<button type="button" className="icon-btn pz-deck-menu" aria-label="Presentation options"><MoreHorizontal size={16} /></button>} items={[
                  { label: 'Present', icon: <Play size={15} />, disabled: !p.slides.some((s) => !s.hidden), onClick: () => setPresenting(p) },
                  { label: p.pinned ? 'Unpin' : 'Pin to the top', icon: p.pinned ? <PinOff size={15} /> : <Pin size={15} />, onClick: () => patch(p, { pinned: !p.pinned }) },
                  { label: 'Duplicate', icon: <Copy size={15} />, onClick: () => duplicate(p) },
                  { separator: true },
                  { label: 'Delete', icon: <Trash2 size={15} />, danger: true, onClick: () => remove(p) },
                ]} />
              </span>
            </div>
          ))}
          {!list.length && <p className="hint">Nothing matches “{q.trim()}”.</p>}
        </div>
      )}
      {creating && <NewPresentation defaults={data.defaults} clients={clients} onClose={() => setCreating(false)} onMade={(p) => navigate(`/presentations/${p.id}`)} />}
      {presenting && <Presenter deck={presenting} onClose={() => setPresenting(null)} />}
    </div>
  );
}

/** Pick what to start from — each shown by its cover in your look — and who it's for. */
function NewPresentation({ defaults, clients, onClose, onMade }) {
  const toast = useToast();
  const [template, setTemplate] = useState('proposal');
  const [clientId, setClientId] = useState('');
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const client = clients.find((c) => c.id === clientId);
  // The covers in your look (pictures aside): what a new deck from each will start like.
  const preview = (key) => {
    const t = DECK_TEMPLATES[key];
    const first = t.slides()[0];
    const fill = (v) => String(v).replaceAll('[Client]', client?.name || 'Client');
    return {
      deck: { id: 'preview', title: t.label, label: t.deckLabel, theme: defaults?.theme || {}, brand: { ...(defaults?.brand || {}), logo: null, mark: null }, meta: { preparedFor: client?.name || '', preparedBy: defaults?.preparedBy || defaults?.brand?.name || '', version: 'v1.0' } },
      slide: { ...first, id: key, data: { ...first.data, title: fill(first.data.title) } },
    };
  };
  const make = async () => {
    setBusy(true);
    try { onMade(await api.createPresentation({ template, clientId, title })); } catch (e) { toast(e.message, 'error'); setBusy(false); }
  };
  return (
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div className="modal pz-new" role="dialog" aria-modal="true" aria-label="New presentation">
        <div className="modal-head">
          <h2>New presentation</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>
        <div className="modal-body">
          <div className="pz-templates" role="radiogroup" aria-label="Start from">
            {Object.entries(DECK_TEMPLATES).map(([key, t]) => {
              const { deck, slide } = preview(key);
              return (
                <button key={key} type="button" role="radio" aria-checked={template === key} className={`pz-template ${template === key ? 'on' : ''}`} onClick={() => setTemplate(key)}>
                  <SlideView deck={deck} slide={slide} index={0} total={1} />
                  <b>{template === key && <Check size={14} />}{t.label} <em>{t.slides().length} slides</em></b>
                  <small>{t.hint}</small>
                </button>
              );
            })}
          </div>
          <div className="pz-new-fields">
            <label className="field"><span>For <em>optional</em></span>
              <select className="input" value={clientId} onChange={(e) => setClientId(e.target.value)}>
                <option value="">No client</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <label className="field"><span>Name <em>optional</em></span>
              <input className="input" value={title} placeholder={`${DECK_TEMPLATES[template].label}${client ? ` · ${client.name}` : ''}`} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') make(); }} />
            </label>
          </div>
          {!defaults?.brand?.name && <p className="hint">Your logo, name and contact go in once (Presentation → From) — “Use this look for new ones” keeps them for every new deck.</p>}
        </div>
        <div className="modal-foot">
          <button type="button" className="btn" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={make} disabled={busy}><Plus size={16} /> {busy ? 'Creating…' : 'Create'}</button>
        </div>
      </div>
    </div>
  );
}
