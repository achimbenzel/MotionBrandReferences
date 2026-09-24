import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useMediaQuery, PHONE } from '../lib/useMedia.js';

/**
 * Lightweight dropdown menu. `trigger` is the clickable element; `items` is an
 * array of { label, icon, onClick, danger } (or { separator: true }).
 * `align` = 'left' | 'right'. On phones it opens as a bottom action sheet
 * instead — big rows within thumb reach, never clipped by the screen edge.
 */
export default function Menu({ trigger, items, align = 'right', direction = 'down', title }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const sheetRef = useRef(null);
  const asSheet = useMediaQuery(PHONE);

  useEffect(() => {
    if (!open) return undefined;
    const inside = (t) => ref.current?.contains(t) || sheetRef.current?.contains(t);
    const onDoc = (e) => { if (!inside(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const list = items.map((it, i) => it.separator ? (
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
  ));

  return (
    <div className="menu-wrap" ref={ref}>
      <span onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}>{trigger}</span>
      {open && !asSheet && (
        <div className={`menu ${align} ${direction === 'up' ? 'up' : ''}`} role="menu">{list}</div>
      )}
      {open && asSheet && createPortal(
        <div className="sheet-backdrop" onClick={(e) => { e.stopPropagation(); setOpen(false); }}>
          <div className="sheet" role="menu" ref={sheetRef} onClick={(e) => e.stopPropagation()}>
            <div className="sheet-grip" aria-hidden="true" />
            {title && <div className="sheet-title">{title}</div>}
            {list}
            <button className="menu-item sheet-cancel" onClick={() => setOpen(false)}>Cancel</button>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
