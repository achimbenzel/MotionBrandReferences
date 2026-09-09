import { useEffect, useState } from 'react';
import { Trash2, RotateCcw, X, FileText, PencilRuler, FolderOpen } from 'lucide-react';
import { api } from '../lib/api.js';
import { useToast } from '../components/Toast.jsx';

const timeAgo = (ts) => {
  const s = Math.max(1, Math.floor((Date.now() - ts) / 1000));
  for (const [name, secs] of [['day', 86400], ['hour', 3600], ['minute', 60]]) {
    const v = Math.floor(s / secs);
    if (v >= 1) return `${v} ${name}${v > 1 ? 's' : ''} ago`;
  }
  return 'just now';
};

export default function TrashPage() {
  const toast = useToast();
  const [items, setItems] = useState(null);
  const [ttl, setTtl] = useState(30);
  const [busy, setBusy] = useState(false);

  const load = () => api.listTrash()
    .then(({ items: list, ttlDays }) => { setItems(list); setTtl(ttlDays || 30); })
    .catch((e) => toast(`Could not load trash: ${e.message}`, 'error'));
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const restore = async (it) => {
    setBusy(true);
    try { await api.restoreTrash(it.trashId); toast('Restored'); load(); }
    catch (e) { toast(`Restore failed: ${e.message}`, 'error'); }
    finally { setBusy(false); }
  };
  const purge = async (it) => {
    if (!window.confirm(`Permanently delete “${it.title}”? This can’t be undone.`)) return;
    setBusy(true);
    try { await api.purgeTrash(it.trashId); load(); }
    catch (e) { toast(`Failed: ${e.message}`, 'error'); }
    finally { setBusy(false); }
  };
  const empty = async () => {
    if (!items?.length) return;
    if (!window.confirm(`Permanently delete all ${items.length} item(s) in Trash? This can’t be undone.`)) return;
    setBusy(true);
    try { await api.emptyTrash(); toast('Trash emptied'); load(); }
    catch (e) { toast(`Failed: ${e.message}`, 'error'); }
    finally { setBusy(false); }
  };

  return (
    <div>
      <div className="page-head-row">
        <div className="page-head">
          <h1>Trash</h1>
          <p>Deleted projects, plans and galleries. Items are removed permanently after {ttl} days.</p>
        </div>
        {items?.length > 0 && (
          <button className="btn btn-ghost" onClick={empty} disabled={busy}><Trash2 size={15} /> Empty trash</button>
        )}
      </div>

      {!items && <div className="spinner" />}
      {items && items.length === 0 && (
        <div className="empty">
          <Trash2 size={30} />
          <h3>Trash is empty</h3>
          <p>Deleted projects, plans and galleries land here and can be restored.</p>
        </div>
      )}
      {items && items.length > 0 && (
        <div className="trash-list">
          {items.map((it) => (
            <div className="trash-row" key={it.trashId}>
              <span className="trash-thumb">{it.thumb ? <img src={it.thumb} alt="" /> : <Ico kind={it.kind} />}</span>
              <span className="trash-meta">
                <span className="trash-title">{it.title}</span>
                <span className="trash-sub">{it.subtitle} · deleted {timeAgo(it.deletedAt)}</span>
              </span>
              <button className="btn btn-sm" onClick={() => restore(it)} disabled={busy}><RotateCcw size={14} /> Restore</button>
              <button className="btn btn-sm btn-ghost trash-purge" onClick={() => purge(it)} disabled={busy} title="Delete permanently"><X size={15} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Ico({ kind }) {
  if (kind === 'plan') return <PencilRuler size={20} />;
  if (kind === 'gallery') return <FolderOpen size={20} />;
  return <FileText size={20} />;
}
