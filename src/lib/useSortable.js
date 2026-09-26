import { useRef, useState } from 'react';

/**
 * Reorder a list by dragging (mouse, pen or finger). Items in `container`
 * carry `data-sort-id`; `grab(id)` gives the props for whatever starts a drag
 * (a handle, or a whole block with `threshold` so a click still clicks).
 * While dragging: `drag` = { id, from, to, dx, dy, x, y } (x / y: the pointer);
 * on drop `onMove(from, to)` with list indexes.
 * `mode`: 'center' — the item whose centre is nearest is where it goes (grids,
 * strips of same-size items); 'rect' — the item under the pointer, before or
 * after it by which half the pointer is in (lists of tall, uneven items).
 */
export function useSortable({ ids, container, onMove, threshold = 4, axis = 'both', mode = 'center' }) {
  const [drag, setDrag] = useState(null);
  const moved = useRef(false); // swallow the click that ends a drag
  const grab = (id) => ({
    'data-sort-grab': '',
    onPointerDown: (e) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      if (e.target.closest('[data-no-sort]')) return;
      const from = ids.indexOf(id);
      if (from === -1) return;
      const x0 = e.clientX; const y0 = e.clientY;
      const st = { id, from, to: from, dx: 0, dy: 0, x: x0, y: y0, on: false };
      moved.current = false;
      const move = (ev) => {
        st.dx = ev.clientX - x0; st.dy = ev.clientY - y0; st.x = ev.clientX; st.y = ev.clientY;
        if (!st.on) {
          if (Math.hypot(st.dx, st.dy) < threshold) return;
          st.on = true;
          // No text gets selected while dragging.
          document.body.classList.add('sorting');
          window.getSelection?.()?.removeAllRanges();
        }
        ev.preventDefault();
        if (mode === 'rect') {
          // The item under the pointer (else the nearest one): before it in its upper half, after it in its lower half.
          let hit = null; let best = Infinity;
          for (const el of container.current?.querySelectorAll('[data-sort-id]') || []) {
            const r = el.getBoundingClientRect();
            const dx = Math.max(r.left - ev.clientX, 0, ev.clientX - r.right); const dy = Math.max(r.top - ev.clientY, 0, ev.clientY - r.bottom);
            const d = Math.hypot(dx, dy);
            if (d < best) { best = d; hit = { el, r }; }
          }
          const idx = hit ? ids.indexOf(hit.el.dataset.sortId) : -1;
          if (idx !== -1) {
            const upper = ev.clientY < hit.r.top + hit.r.height / 2;
            st.to = upper ? (idx > st.from ? idx - 1 : idx) : (idx >= st.from ? idx : idx + 1);
            st.to = Math.max(0, Math.min(ids.length - 1, st.to));
          }
        } else {
          // The item whose centre is nearest (along the axis) is where it goes.
          let best = Infinity;
          for (const el of container.current?.querySelectorAll('[data-sort-id]') || []) {
            const r = el.getBoundingClientRect();
            const cx = r.left + r.width / 2; const cy = r.top + r.height / 2;
            const d = axis === 'x' ? Math.abs(ev.clientX - cx) : axis === 'y' ? Math.abs(ev.clientY - cy) : Math.hypot(ev.clientX - cx, ev.clientY - cy);
            if (d < best) { best = d; st.to = ids.indexOf(el.dataset.sortId); }
          }
        }
        // Scroll the page near its edges.
        if (axis !== 'x') {
          if (ev.clientY < 70) window.scrollBy(0, -14);
          else if (ev.clientY > window.innerHeight - 70) window.scrollBy(0, 14);
        }
        setDrag({ ...st });
      };
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', up);
        document.body.classList.remove('sorting');
        if (st.on) {
          moved.current = true;
          setTimeout(() => { moved.current = false; }, 0);
          if (st.to !== -1 && st.to !== st.from) onMove(st.from, st.to);
        }
        setDrag(null);
      };
      window.addEventListener('pointermove', move, { passive: false });
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', up);
    },
    onClickCapture: (e) => { if (moved.current) { e.stopPropagation(); e.preventDefault(); } },
  });
  // Classes / style for an item while something is dragged.
  const itemState = (id) => {
    if (!drag?.on) return { className: '', style: undefined };
    if (drag.id === id) return { className: 'sort-dragging', style: { transform: `translate(${axis === 'y' ? 0 : drag.dx}px, ${axis === 'x' ? 0 : drag.dy}px)` } };
    const i = ids.indexOf(id);
    if (i === drag.to) return { className: drag.to > drag.from ? 'sort-after' : 'sort-before', style: undefined };
    return { className: '', style: undefined };
  };
  return { drag: drag?.on ? drag : null, grab, itemState };
}

/** Move one item of a list from index `from` to index `to`. */
export function moveItem(list, from, to) {
  const next = [...list];
  const [x] = next.splice(from, 1);
  next.splice(to, 0, x);
  return next;
}
