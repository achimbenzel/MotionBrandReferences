import { useEffect, useRef, useState } from 'react';

/**
 * Lightweight dropdown menu. `trigger` is the clickable element; `items` is an
 * array of { label, icon, onClick, danger } (or { separator: true }).
 * `align` = 'left' | 'right'.
 */
export default function Menu({ trigger, items, align = 'right' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open]);

  return (
    <div className="menu-wrap" ref={ref}>
      <span onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}>{trigger}</span>
      {open && (
        <div className={`menu ${align}`} role="menu">
          {items.map((it, i) => it.separator ? (
            <div key={i} className="menu-sep" />
          ) : (
            <button
              key={i}
              className={`menu-item ${it.danger ? 'danger' : ''}`}
              role="menuitem"
              onClick={(e) => { e.stopPropagation(); setOpen(false); it.onClick(); }}
            >
              {it.icon}{it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
