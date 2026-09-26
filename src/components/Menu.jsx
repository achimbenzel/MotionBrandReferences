import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check } from 'lucide-react';
import { useMediaQuery, PHONE } from '../lib/useMedia.js';

const GAP = 6;    // between the trigger and the menu
const EDGE = 8;   // kept free at the window's edges

/**
 * Lightweight dropdown menu. `trigger` is the clickable element; `items` is an
 * array of { label, icon, onClick, danger } (or { separator: true }, or
 * { heading: 'text' }). A row with `checked` (true / false) is a checkbox —
 * with `keepOpen` the menu stays open to tick several; `hint` is a small
 * note on its right (a count), `disabled` greys it out.
 * `align` = 'left' | 'right'. The menu floats above the page (it's placed next
 * to the trigger, never cut off by a card or a scrolling list around it) and
 * opens upwards when there's no room below. On phones it opens as a bottom
 * action sheet instead — big rows within thumb reach.
 */
export default function Menu({ trigger, items, align = 'right', direction = 'down', title }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null); // { top, left, maxHeight, up }
  const ref = useRef(null);
  const menuRef = useRef(null);
  const sheetRef = useRef(null);
  const asSheet = useMediaQuery(PHONE);

  useEffect(() => {
    if (!open) return undefined;
    const inside = (t) => ref.current?.contains(t) || menuRef.current?.contains(t) || sheetRef.current?.contains(t);
    const onDoc = (e) => { if (!inside(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open]);

  // Next to the trigger, inside the window: below it (or above, when that's where the room is).
  useLayoutEffect(() => {
    if (!open || asSheet) { setPos(null); return undefined; }
    let raf = 0;
    const place = () => {
      raf = 0;
      const t = ref.current?.getBoundingClientRect();
      const m = menuRef.current;
      if (!t || !m) return;
      const w = m.offsetWidth; const h = m.scrollHeight;
      const vw = window.innerWidth; const vh = window.innerHeight;
      const below = vh - t.bottom - GAP - EDGE; const above = t.top - GAP - EDGE;
      const up = direction === 'up' ? (above >= h || above > below) : (below < h && above > below);
      const room = up ? above : below;
      let left = align === 'left' ? t.left : t.right - w;
      left = Math.max(EDGE, Math.min(left, vw - w - EDGE));
      const height = Math.min(h, room);
      const top = up ? t.top - GAP - height : t.bottom + GAP;
      setPos({ top: Math.round(top), left: Math.round(left), maxHeight: Math.max(120, Math.floor(room)), up });
    };
    place();
    const again = () => { if (!raf) raf = requestAnimationFrame(place); };
    window.addEventListener('resize', again);
    window.addEventListener('scroll', again, true); // any scrolling list around the trigger
    return () => { window.removeEventListener('resize', again); window.removeEventListener('scroll', again, true); if (raf) cancelAnimationFrame(raf); };
  }, [open, asSheet, align, direction]);

  const list = items.map((it, i) => it.separator ? (
    <div key={i} className="menu-sep" />
  ) : it.heading ? (
    <div key={i} className="menu-heading">{it.heading}</div>
  ) : (
    <button
      key={i}
      type="button"
      className={`menu-item ${it.danger ? 'danger' : ''} ${it.checked !== undefined ? 'checkable' : ''} ${it.checked ? 'checked' : ''}`}
      role={it.checked !== undefined ? 'menuitemcheckbox' : 'menuitem'}
      aria-checked={it.checked !== undefined ? !!it.checked : undefined}
      disabled={it.disabled}
      onClick={(e) => { e.stopPropagation(); if (!it.keepOpen) setOpen(false); it.onClick(); }}
    >
      {it.icon}<span className="menu-label">{it.label}</span>
      {it.hint !== undefined && <span className="menu-hint">{it.hint}</span>}
      {it.checked !== undefined && <span className="menu-check" aria-hidden="true">{it.checked && <Check size={12} strokeWidth={3} />}</span>}
    </button>
  ));

  return (
    <div className="menu-wrap" ref={ref}>
      <span onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}>{trigger}</span>
      {open && !asSheet && createPortal(
        <div ref={menuRef} className={`menu menu-float ${align} ${pos?.up ? 'up' : ''} ${pos ? 'placed' : ''}`} role="menu"
          style={pos ? { top: pos.top, left: pos.left, maxHeight: pos.maxHeight } : { top: -9999, left: -9999 }}
          onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
          {list}
        </div>,
        document.body,
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
