import { createContext, useCallback, useContext, useState } from 'react';
import { CheckCircle2, AlertTriangle } from 'lucide-react';

const ToastCtx = createContext(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null);

  // show(message, kind?, action?) — action = { label, onClick } renders a button
  // (e.g. Undo) and keeps the toast up a little longer.
  const show = useCallback((message, kind = 'ok', action = null) => {
    setToast({ message, kind, action });
    clearTimeout(show._t);
    show._t = setTimeout(() => setToast(null), action ? 6000 : 3200);
  }, []);

  const dismiss = () => { clearTimeout(show._t); setToast(null); };

  return (
    <ToastCtx.Provider value={show}>
      {children}
      {toast && (
        <div className={`toast ${toast.kind === 'error' ? 'error' : ''}`} role="status">
          {toast.kind === 'error'
            ? <AlertTriangle size={16} className="danger" />
            : <CheckCircle2 size={16} style={{ color: 'var(--accent)' }} />}
          <span>{toast.message}</span>
          {toast.action && (
            <button className="toast-action" onClick={() => { dismiss(); toast.action.onClick(); }}>
              {toast.action.label}
            </button>
          )}
        </div>
      )}
    </ToastCtx.Provider>
  );
}
