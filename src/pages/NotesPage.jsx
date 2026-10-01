import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, NotebookPen, Search, Pin, Images } from 'lucide-react';
import { api, noteFileUrl } from '../lib/api.js';
import { tagColor } from '../lib/types.js';
import { useToast } from '../components/Toast.jsx';
import '../styles/notes.css';
import { fmtDate } from '../lib/format.js';

const ago = (t) => {
  if (!t) return '';
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  const d = new Date(t);
  return fmtDate(d, { day: 'numeric', month: 'short', year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
};

/**
 * Notes: everything that isn't a project, a to-do or a reference — ideas,
 * call notes, pricing, a list of fonts to try. A title, text and pictures;
 * pinned ones on top, then the one you changed last.
 */
export default function NotesPage({ reloadKey }) {
  const navigate = useNavigate();
  const toast = useToast();
  const [notes, setNotes] = useState(null);
  const [error, setError] = useState(null);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);

  const [changed, setChanged] = useState(0);
  useEffect(() => {
    const on = () => setChanged((n) => n + 1);
    window.addEventListener('notes:changed', on);
    return () => window.removeEventListener('notes:changed', on);
  }, []);
  useEffect(() => {
    let alive = true;
    api.listNotes().then((n) => { if (alive) setNotes(n); }).catch((e) => { if (alive) setError(e.message); });
    return () => { alive = false; };
  }, [reloadKey, changed]);

  const create = async () => {
    if (busy) return;
    setBusy(true);
    try { const n = await api.createNote({}); navigate(`/notes/${n.id}`, { state: { fresh: true } }); }
    catch (e) { toast(`Could not add a note: ${e.message}`, 'error'); setBusy(false); }
  };
  const needle = q.trim().toLowerCase();
  const shown = useMemo(() => (notes || []).filter((n) => !needle || `${n.title}\n${n.body}`.toLowerCase().includes(needle)), [notes, needle]);
  const pinned = shown.filter((n) => n.pinned);
  const rest = shown.filter((n) => !n.pinned);

  const card = (n) => {
    const c = n.color ? tagColor(n.color) : null;
    const cover = n.images[0] ? noteFileUrl(n, n.images[0].file) : null;
    const lines = n.body.trim().split('\n').filter((l) => l.trim()).slice(0, 5).join('\n');
    return (
      <button key={n.id} type="button" className={`note-card ${c ? 'tinted' : ''}`} onClick={() => navigate(`/notes/${n.id}`)}
        style={c ? { background: c.bg, borderColor: 'transparent' } : undefined}>
        {cover && <span className="note-card-cover"><img src={cover} alt="" loading="lazy" />{n.images.length > 1 && <i><Images size={12} /> {n.images.length}</i>}</span>}
        <span className="note-card-body">
          <b className={n.title ? '' : 'untitled'}>{n.title || 'Untitled note'}</b>
          {lines && <span className="note-card-text">{lines}</span>}
          <span className="note-card-meta">{n.pinned && <Pin size={11} />}{ago(n.updatedAt)}</span>
        </span>
      </button>
    );
  };

  return (
    <div className="notes-page">
      <div className="page-head-row">
        <div className="page-head">
          <h1>Notes</h1>
          <p>Ideas, call notes, prices, lists — with pictures. Pinned ones stay on top.</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={create} disabled={busy}><Plus size={16} /> New note</button>
      </div>
      {error && <div className="center-msg">Couldn’t load: {error}</div>}
      {!notes && !error && <div className="spinner" />}
      {notes && notes.length > 0 && (
        <label className="clients-search"><Search size={15} /><input value={q} placeholder="Find in your notes…" onChange={(e) => setQ(e.target.value)} aria-label="Find in your notes" /></label>
      )}
      {notes && (notes.length ? (
        <>
          {pinned.length > 0 && <div className="notes-group"><div className="notes-group-head"><Pin size={13} /> Pinned</div><div className="notes-grid">{pinned.map(card)}</div></div>}
          {rest.length > 0 && (
            <div className="notes-group">
              {pinned.length > 0 && <div className="notes-group-head">Others</div>}
              <div className="notes-grid">{rest.map(card)}</div>
            </div>
          )}
          {needle && !shown.length && <div className="hint">No note contains “{q.trim()}”.</div>}
        </>
      ) : (
        <div className="empty">
          <NotebookPen size={30} />
          <h3>No notes yet</h3>
          <p>Write down an idea, notes from a call or a list — and add pictures to it.</p>
          <button className="btn btn-primary" onClick={create} disabled={busy}><Plus size={16} /> New note</button>
        </div>
      ))}
    </div>
  );
}
