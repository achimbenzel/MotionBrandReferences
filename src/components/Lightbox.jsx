import { useEffect, useCallback, useRef, useState } from 'react';
import { X, ChevronLeft, ChevronRight, ZoomIn } from 'lucide-react';

const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
const MAX_ZOOM = 8;

/**
 * Fullscreen image viewer. `items` is an array of { src, caption }.
 * Zoom with the mouse wheel (toward the cursor), pan by dragging, double-click
 * to toggle zoom. `index` is the current position; onIndex(n) navigates.
 */
export default function Lightbox({ items, index, onIndex, onClose }) {
  const count = items.length;
  const go = useCallback((d) => onIndex((index + d + count) % count), [index, count, onIndex]);
  const figureRef = useRef(null);
  const drag = useRef(null); // { x, y, ox, oy }
  const [zoom, setZoom] = useState(1);
  const [off, setOff] = useState({ x: 0, y: 0 });

  // Reset the view whenever the image changes.
  useEffect(() => { setZoom(1); setOff({ x: 0, y: 0 }); }, [index]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'ArrowLeft') go(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, onClose]);

  // Wheel-to-zoom, anchored at the cursor. Attached natively so we can
  // preventDefault (React's onWheel is passive and can't stop page scroll).
  useEffect(() => {
    const el = figureRef.current;
    if (!el) return undefined;
    const onWheel = (e) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const cx = e.clientX - (rect.left + rect.width / 2);
      const cy = e.clientY - (rect.top + rect.height / 2);
      setZoom((z) => {
        const nz = clamp(z * (e.deltaY < 0 ? 1.18 : 1 / 1.18), 1, MAX_ZOOM);
        if (nz === 1) { setOff({ x: 0, y: 0 }); return 1; }
        // Keep the point under the cursor stationary.
        setOff((o) => ({
          x: cx - ((cx - o.x) * nz) / z,
          y: cy - ((cy - o.y) * nz) / z,
        }));
        return nz;
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const item = items[index];
  if (!item) return null;

  const onPointerDown = (e) => {
    if (zoom <= 1) return;
    drag.current = { x: e.clientX, y: e.clientY, ox: off.x, oy: off.y };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e) => {
    if (!drag.current) return;
    setOff({ x: drag.current.ox + (e.clientX - drag.current.x), y: drag.current.oy + (e.clientY - drag.current.y) });
  };
  const onPointerUp = () => { drag.current = null; };
  const toggleZoom = () => { if (zoom > 1) { setZoom(1); setOff({ x: 0, y: 0 }); } else setZoom(2.5); };
  const reset = () => { setZoom(1); setOff({ x: 0, y: 0 }); };

  return (
    <div className="lightbox" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <button className="lightbox-close icon-btn" onClick={onClose} aria-label="Close"><X size={20} /></button>
      {count > 1 && (
        <button className="lightbox-nav prev icon-btn" onClick={() => go(-1)} aria-label="Previous"><ChevronLeft size={26} /></button>
      )}
      <figure className="lightbox-figure" ref={figureRef}>
        <img
          src={item.src}
          alt={item.caption || ''}
          draggable={false}
          className={zoom > 1 ? 'zoomed' : ''}
          style={{ transform: `translate(${off.x}px, ${off.y}px) scale(${zoom})`, cursor: zoom > 1 ? (drag.current ? 'grabbing' : 'grab') : 'zoom-in' }}
          onDoubleClick={toggleZoom}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        />
        {(item.caption || count > 1) && (
          <figcaption>{item.caption}{count > 1 ? `${item.caption ? ' · ' : ''}${index + 1} / ${count}` : ''}</figcaption>
        )}
      </figure>
      {count > 1 && (
        <button className="lightbox-nav next icon-btn" onClick={() => go(1)} aria-label="Next"><ChevronRight size={26} /></button>
      )}
      {zoom > 1
        ? <button className="lightbox-zoom" onClick={reset} title="Reset zoom">{Math.round(zoom * 100)}% · reset</button>
        : <div className="lightbox-hint"><ZoomIn size={13} /> Scroll to zoom · drag to pan</div>}
    </div>
  );
}
