import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { HardDrive, MoreVertical, X } from 'lucide-react';
import { api } from '../lib/api.js';
import { useToast } from './Toast.jsx';
import Menu from './Menu.jsx';

const GB = 1024 * 1024 * 1024;
const fmt = (bytes) => {
  if (bytes >= GB) return `${(bytes / GB).toFixed(1)} GB`;
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(mb < 10 ? 1 : 0)} MB`;
  return `${Math.max(0, Math.round(bytes / 1024))} KB`;
};

export default function StorageMeter({ refreshKey }) {
  const toast = useToast();
  const { pathname } = useLocation();
  const [data, setData] = useState(null);
  const [editing, setEditing] = useState(false);
  const [gb, setGb] = useState('80');

  const load = () => api.storage().then(setData).catch(() => setData(null));
  // Refetch on navigation (covers create/delete) and when the parent bumps the key.
  useEffect(() => { load(); }, [pathname, refreshKey]);

  const openEdit = () => {
    if (data) setGb(String(+(data.limitBytes / GB).toFixed(2)).replace(/\.00$/, ''));
    setEditing(true);
  };

  const saveLimit = async () => {
    const v = parseFloat(String(gb).replace(',', '.'));
    if (!(v > 0)) { toast('Enter a number greater than 0', 'error'); return; }
    try {
      await api.setStorageLimit(Math.round(v * GB));
      setEditing(false);
      load();
      toast('Storage limit updated');
    } catch (e) { toast(`Could not update: ${e.message}`, 'error'); }
  };

  const pct = data ? Math.min(100, (data.usedBytes / data.limitBytes) * 100) : 0;
  const over = pct >= 90;

  return (
    <>
      <div className="storage-pill" title="Used space in the data folder">
        <HardDrive size={15} />
        <div className="storage-text">
          <div className="storage-nums">
            {data ? <>{fmt(data.usedBytes)} <span className="of">/ {fmt(data.limitBytes)}</span></> : '…'}
          </div>
          <div className="storage-bar"><span style={{ width: `${pct}%`, background: over ? 'var(--danger)' : 'var(--accent)' }} /></div>
        </div>
        <Menu
          align="right"
          trigger={<button className="icon-btn storage-dots" title="Storage options"><MoreVertical size={15} /></button>}
          items={[{ label: 'Edit limit', onClick: openEdit }, { label: 'Refresh', onClick: load }]}
        />
      </div>

      {editing && (
        <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) setEditing(false); }}>
          <div className="modal" role="dialog" aria-modal="true" style={{ maxWidth: 360 }}>
            <div className="modal-head">
              <h2>Storage limit</h2>
              <button className="icon-btn" onClick={() => setEditing(false)}><X size={18} /></button>
            </div>
            <div className="modal-body">
              <div className="field" style={{ marginBottom: 0 }}>
                <label>Limit in GB</label>
                <input className="input" type="number" min="1" step="1" value={gb} autoFocus
                  onChange={(e) => setGb(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') saveLimit(); }} />
                <div className="hint" style={{ marginTop: 8 }}>Used space is summed from everything in the <code>data/</code> folder.</div>
              </div>
            </div>
            <div className="modal-foot">
              <button className="btn btn-ghost" onClick={() => setEditing(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={saveLimit}>Save</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
