import { useEffect, useState } from 'react';
import { X } from 'lucide-react';

/** Small modal to create or rename a gallery. */
export default function GalleryNameModal({ title = 'Neue Galerie', initialName = '', submitLabel = 'Erstellen', onSubmit, onClose }) {
  const [name, setName] = useState(initialName);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, busy]);

  const submit = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    try { await onSubmit(name.trim()); } finally { setBusy(false); }
  };

  return (
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true" style={{ maxWidth: 400 }}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} disabled={busy}><X size={18} /></button>
        </div>
        <div className="modal-body">
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Name</label>
            <input className="input" value={name} autoFocus placeholder="z. B. Grüne Tech Firmen"
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') submit(); }} />
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={onClose} disabled={busy}>Abbrechen</button>
          <button className="btn btn-primary" onClick={submit} disabled={!name.trim() || busy}>{submitLabel}</button>
        </div>
      </div>
    </div>
  );
}
