import { createContext, useCallback, useContext, useState } from 'react';
import { CheckCircle2, AlertTriangle } from 'lucide-react';

const ToastCtx = createContext(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null);

  const show = useCallback((message, kind = 'ok') => {
    setToast({ message, kind });
    clearTimeout(show._t);
    show._t = setTimeout(() => setToast(null), 3200);
  }, []);

  return (
    <ToastCtx.Provider value={show}>
      {children}
      {toast && (
        <div className={`toast ${toast.kind === 'error' ? 'error' : ''}`} role="status">
          {toast.kind === 'error'
            ? <AlertTriangle size={16} className="danger" />
            : <CheckCircle2 size={16} style={{ color: 'var(--accent)' }} />}
          {toast.message}
        </div>
      )}
    </ToastCtx.Provider>
  );
}
