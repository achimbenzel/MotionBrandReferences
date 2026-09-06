import { useEffect, useState } from 'react';
import { X, Check } from 'lucide-react';
import { fileUrl } from '../lib/api.js';

/**
 * Pick which projects belong to a gallery. `projects` are all projects of the
 * gallery's type; `selectedIds` are the current members. onSave(nextIds).
 */
export default function GalleryPicker({ projects, selectedIds, onSave, onClose }) {
  const [sel, setSel] = useState(new Set(selectedIds));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, busy]);

  const toggle = (id) => setSel((prev) => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const save = async () => {
    setBusy(true);
    try { await onSave([...sel]); } finally { setBusy(false); }
  };

  return (
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true" style={{ maxWidth: 720 }}>
        <div className="modal-head">
          <h2>Add projects</h2>
          <button className="icon-btn" onClick={onClose} disabled={busy}><X size={18} /></button>
        </div>
        <div className="modal-body">
          {projects.length === 0 ? (
            <div className="center-msg">No projects of this type yet.</div>
          ) : (
            <div className="picker-grid">
              {projects.map((p) => {
                const on = sel.has(p.id);
                const thumb = p.thumb ? fileUrl(p, p.thumb) : null;
                return (
                  <button key={p.id} type="button" className={`picker-item ${on ? 'on' : ''}`} onClick={() => toggle(p.id)}>
                    <div className="picker-thumb">
                      {thumb ? <img src={thumb} alt="" loading="lazy" /> : <div className="card-thumb-empty" />}
                      {on && <span className="picker-check"><Check size={14} /></span>}
                    </div>
                    <span className="picker-title">{p.title}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : `Save (${sel.size})`}</button>
        </div>
      </div>
    </div>
  );
}
