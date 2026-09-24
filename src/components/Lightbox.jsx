import { useEffect, useCallback, useRef, useState } from 'react';
import { X, ChevronLeft, ChevronRight, ZoomIn } from 'lucide-react';
import { isTouch } from '../lib/useMedia.js';

const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
const MAX_ZOOM = 8;
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * Fullscreen image viewer. `items` is an array of { src, caption }.
 * Mouse: wheel zooms toward the cursor, drag pans, double-click toggles zoom.
 * Touch: swipe left/right to browse, pinch to zoom, drag to pan, double-tap to
 * toggle zoom, swipe down to close. `index` is the current position;
 * onIndex(n) navigates.
 */
export default function Lightbox({ items, index, onIndex, onClose }) {
  const count = items.length;
  const go = useCallback((d) => onIndex((index + d + count) % count), [index, count, onIndex]);
  const figureRef = useRef(null);
  const pointers = useRef(new Map()); // pointerId → { x, y }
  const gesture = useRef(null);       // current drag / swipe / pinch
  const lastTap = useRef(0);
  // Zoom + pan live in one state, mirrored in a ref so gesture handlers always
  // compute from the latest values.
  const [view, setViewState] = useState({ zoom: 1, x: 0, y: 0 });
  const viewRef = useRef(view);
  const setView = useCallback((v) => { viewRef.current = v; setViewState(v); }, []);
  const [swipe, setSwipe] = useState({ x: 0, y: 0 }); // live finger offset while swiping at 1×
  const touch = isTouch();
  const { zoom } = view;

  // Reset the view whenever the image changes.
  useEffect(() => { setView({ zoom: 1, x: 0, y: 0 }); setSwipe({ x: 0, y: 0 }); }, [index, setView]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'ArrowLeft') go(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, onClose]);

  // Zoom to `nz` keeping the point (cx, cy) — relative to the figure centre —
  // where it is on screen.
  const zoomAt = useCallback((nz, cx, cy) => {
    const { zoom: z, x, y } = viewRef.current;
    const next = clamp(nz, 1, MAX_ZOOM);
    if (next === 1) { setView({ zoom: 1, x: 0, y: 0 }); return; }
    setView({ zoom: next, x: cx - ((cx - x) * next) / z, y: cy - ((cy - y) * next) / z });
  }, [setView]);
  const centreOf = (x, y) => {
    const r = figureRef.current.getBoundingClientRect();
    return { cx: x - (r.left + r.width / 2), cy: y - (r.top + r.height / 2) };
  };

  // Wheel-to-zoom, anchored at the cursor. Attached natively so we can
  // preventDefault (React's onWheel is passive and can't stop page scroll).
  useEffect(() => {
    const el = figureRef.current;
    if (!el) return undefined;
    const onWheel = (e) => {
      e.preventDefault();
      const { cx, cy } = centreOf(e.clientX, e.clientY);
      zoomAt(viewRef.current.zoom * (e.deltaY < 0 ? 1.18 : 1 / 1.18), cx, cy);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomAt]);

  const item = items[index];
  if (!item) return null;

  const toggleZoomAt = (x, y) => {
    if (viewRef.current.zoom > 1) { setView({ zoom: 1, x: 0, y: 0 }); return; }
    const { cx, cy } = centreOf(x, y);
    zoomAt(2.5, cx, cy);
  };
  const reset = () => setView({ zoom: 1, x: 0, y: 0 });

  const onPointerDown = (e) => {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = [...pointers.current.values()];
    if (pts.length === 2) {
      const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
      gesture.current = { type: 'pinch', d0: dist(pts[0], pts[1]), z0: viewRef.current.zoom, mid };
      setSwipe({ x: 0, y: 0 });
    } else if (pts.length === 1) {
      const v = viewRef.current;
      gesture.current = v.zoom > 1
        ? { type: 'pan', x: e.clientX, y: e.clientY, ox: v.x, oy: v.y }
        : { type: 'swipe', x: e.clientX, y: e.clientY };
    }
  };
  const onPointerMove = (e) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    if (!g) return;
    if (g.type === 'pinch') {
      const pts = [...pointers.current.values()];
      if (pts.length < 2) return;
      const { cx, cy } = centreOf(g.mid.x, g.mid.y);
      zoomAt(g.z0 * (dist(pts[0], pts[1]) / g.d0), cx, cy);
    } else if (g.type === 'pan') {
      setView({ ...viewRef.current, x: g.ox + (e.clientX - g.x), y: g.oy + (e.clientY - g.y) });
    } else if (g.type === 'swipe' && e.pointerType !== 'mouse') {
      setSwipe({ x: e.clientX - g.x, y: Math.max(0, e.clientY - g.y) });
    }
  };
  const onPointerUp = (e) => {
    const g = gesture.current;
    pointers.current.delete(e.pointerId);
    if (pointers.current.size > 0) {
      // A pinch lost one finger: continue as a pan with the remaining one.
      const [p] = [...pointers.current.values()];
      const v = viewRef.current;
      gesture.current = v.zoom > 1 ? { type: 'pan', x: p.x, y: p.y, ox: v.x, oy: v.y } : null;
      return;
    }
    gesture.current = null;
    if (g?.type === 'swipe' && e.pointerType !== 'mouse') {
      const dx = e.clientX - g.x; const dy = e.clientY - g.y;
      setSwipe({ x: 0, y: 0 });
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) && count > 1) { go(dx < 0 ? 1 : -1); return; }
      if (dy > 110 && dy > Math.abs(dx)) { onClose(); return; }
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10) {
        // A tap: two within 300 ms toggle zoom.
        const now = Date.now();
        if (now - lastTap.current < 300) { lastTap.current = 0; toggleZoomAt(e.clientX, e.clientY); }
        else lastTap.current = now;
      }
    }
  };

  const dragging = gesture.current?.type === 'pan';
  const swiping = swipe.x !== 0 || swipe.y !== 0;
  const transform = swiping
    ? `translate(${swipe.x}px, ${swipe.y}px) scale(${1 - Math.min(swipe.y, 300) / 1500})`
    : `translate(${view.x}px, ${view.y}px) scale(${zoom})`;

  return (
    <div className="lightbox" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={swipe.y ? { background: `rgba(0, 0, 0, ${Math.max(0.4, 0.92 - swipe.y / 500)})` } : undefined}>
      <button className="lightbox-close icon-btn" onClick={onClose} aria-label="Close"><X size={20} /></button>
      {count > 1 && (
        <button className="lightbox-nav prev icon-btn" onClick={() => go(-1)} aria-label="Previous"><ChevronLeft size={26} /></button>
      )}
      <figure className="lightbox-figure" ref={figureRef}>
        <img
          src={item.src}
          alt={item.caption || ''}
          draggable={false}
          className={`${zoom > 1 ? 'zoomed' : ''} ${swiping ? 'swiping' : ''}`}
          style={{ transform, cursor: zoom > 1 ? (dragging ? 'grabbing' : 'grab') : 'zoom-in' }}
          onDoubleClick={(e) => toggleZoomAt(e.clientX, e.clientY)}
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
        : (
          <div className="lightbox-hint">
            <ZoomIn size={13} /> {touch ? `Pinch to zoom${count > 1 ? ' · swipe to browse' : ''}` : 'Scroll to zoom · drag to pan'}
          </div>
        )}
    </div>
  );
}
