import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';

/**
 * A small yes/no confirmation modal used before destructive or committing
 * actions (deleting a plugin/expression/group, downloading a file…).
 * Pass `danger` to style the confirm button as destructive.
 */
export default function ConfirmDialog({
  title = 'Are you sure?', message, confirmLabel = 'Confirm', cancelLabel = 'Cancel',
  danger = false, icon, onConfirm, onClose,
}) {
  const [busy, setBusy] = useState(false);
  const okRef = useRef(null);

  useEffect(() => {
    okRef.current?.focus();
    const onKey = (e) => { if (e.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, busy]);

  const confirm = async () => {
    if (busy) return;
    setBusy(true);
    try { await onConfirm(); onClose(); } finally { setBusy(false); }
  };

  return (
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div className="modal confirm-modal" role="alertdialog" aria-modal="true" style={{ maxWidth: 400 }}>
        <div className="modal-head">
          <h2>{icon || (danger && <AlertTriangle size={18} className="confirm-danger-icon" />)} {title}</h2>
          <button className="icon-btn" onClick={onClose} disabled={busy}><X size={18} /></button>
        </div>
        {message && <div className="modal-body"><p className="confirm-message">{message}</p></div>}
        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={onClose} disabled={busy}>{cancelLabel}</button>
          <button ref={okRef} className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} onClick={confirm} disabled={busy}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

/**
 * Hook form: `const [dialog, ask] = useConfirm();` then render `{dialog}` and
 * call `ask({ title, message, confirmLabel, danger, onConfirm })`.
 */
export function useConfirm() {
  const [opts, setOpts] = useState(null);
  const ask = useCallback((o) => setOpts(o), []);
  const close = useCallback(() => setOpts(null), []);
  const dialog = opts ? <ConfirmDialog {...opts} onClose={close} /> : null;
  return [dialog, ask];
}
