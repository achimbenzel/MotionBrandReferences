import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useMediaQuery, PHONE } from '../lib/useMedia.js';

const GAP = 6;
const EDGE = 8;

/**
 * A small panel under (or above) `anchor` — for pickers and little forms that
 * a Menu can't hold. It floats above the page (never clipped by a card) and
 * closes on Escape or a click outside. On phones it's a bottom sheet.
 */
export default function Popover({ anchor, onClose, children, width = 300, align = 'left', label }) {
  const ref = useRef(null);
  const phone = useMediaQuery(PHONE);
  const [pos, setPos] = useState(null);

  useEffect(() => {
    const inside = (t) => ref.current?.contains(t) || anchor?.current?.contains(t);
    const onDoc = (e) => { if (!inside(e.target)) onClose(); };
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey, true);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey, true); };
  }, [anchor, onClose]);

  useLayoutEffect(() => {
    if (phone) return undefined;
    const place = () => {
      const a = anchor?.current?.getBoundingClientRect();
      const el = ref.current;
      if (!a || !el) return;
      const w = Math.min(width, window.innerWidth - EDGE * 2);
      const h = el.scrollHeight;
      const below = window.innerHeight - a.bottom - GAP - EDGE;
      const up = below < Math.min(h, 320) && a.top > below;
      let left = align === 'right' ? a.right - w : a.left;
      left = Math.max(EDGE, Math.min(left, window.innerWidth - w - EDGE));
      const room = up ? a.top - GAP - EDGE : below;
      setPos({ left: Math.round(left), width: w, maxHeight: Math.max(160, Math.floor(room)), ...(up ? { bottom: Math.round(window.innerHeight - a.top + GAP) } : { top: Math.round(a.bottom + GAP) }) });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
  }, [anchor, phone, width, align]);

  if (phone) {
    return createPortal(
      <div className="sheet-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <div className="sheet popover-sheet" ref={ref} role="dialog" aria-label={label}>
          <div className="sheet-grip" aria-hidden="true" />
          {children}
        </div>
      </div>,
      document.body,
    );
  }
  return createPortal(
    <div ref={ref} className={`popover ${pos ? 'placed' : ''}`} role="dialog" aria-label={label}
      style={pos || { top: -9999, left: -9999, width }}>
      {children}
    </div>,
    document.body,
  );
}
