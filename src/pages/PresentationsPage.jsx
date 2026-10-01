import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Presentation as DeckIcon, MoreHorizontal, Play, Copy, Trash2, Pin, PinOff, Search } from 'lucide-react';
import { api } from '../lib/api.js';
import { DECK_KINDS } from '../lib/slides.js';
import { fmtDate } from '../lib/format.js';
import { useToast } from '../components/Toast.jsx';
import Menu from '../components/Menu.jsx';
import { SlideView } from '../components/presentations/Slide.jsx';
import Presenter from '../components/presentations/Presenter.jsx';
import NewPresentation from '../components/presentations/NewPresentation.jsx';
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
