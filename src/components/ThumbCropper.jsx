import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ZoomIn } from 'lucide-react';
import { cropToBlob, sourceSize } from '../lib/imaging.js';

/**
 * Pan + zoom crop stage. `source` is an HTMLImageElement or canvas.
 * Exposes capture() -> { blob, meta } via ref. The crop frame keeps `aspect`.
 */
const ThumbCropper = forwardRef(function ThumbCropper({ source, aspect = 16 / 10, initial }, ref) {
  const wrapRef = useRef(null);
  const [W, setW] = useState(520);
  const H = Math.round(W / aspect);
  const { w: sw, h: sh } = useMemo(() => sourceSize(source), [source]);

  // A display URL for the source (canvas -> dataURL, image -> its src).
  const displaySrc = useMemo(() => (
    source.tagName === 'CANVAS' ? source.toDataURL('image/webp', 0.92) : source.src
  ), [source]);

  const baseScale = Math.max(W / sw, H / sh);
  const [z, setZ] = useState(initial?.z || 1);
  const [pos, setPos] = useState(null); // {tx,ty} in display px

  // Measure available width.
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => setW(Math.max(240, Math.round(el.clientWidth)));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const scale = baseScale * z;
  const dispW = sw * scale;
  const dispH = sh * scale;

  const clamp = (tx, ty) => ({
    tx: Math.min(0, Math.max(W - dispW, tx)),
    ty: Math.min(0, Math.max(H - dispH, ty)),
  });

  // Initialize / re-center when geometry changes.
  useEffect(() => {
    setPos((prev) => {
      if (prev && prev._for === W + 'x' + z) return prev;
      let tx, ty;
      if (initial && initial.txN != null) {
        tx = initial.txN * W; ty = initial.tyN * H;
      } else if (prev) {
        // keep center on zoom change
        const cx = (W / 2 - prev.tx) / prev.scale;
        const cy = (H / 2 - prev.ty) / prev.scale;
        tx = W / 2 - cx * scale;
        ty = H / 2 - cy * scale;
      } else {
        tx = (W - dispW) / 2; ty = (H - dispH) / 2;
      }
      const c = clamp(tx, ty);
      return { ...c, scale, _for: W + 'x' + z };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [W, z, sw, sh]);

  // Drag to pan.
  const drag = useRef(null);
  const onDown = (e) => {
    e.preventDefault();
    const p = 'touches' in e ? e.touches[0] : e;
    drag.current = { x: p.clientX, y: p.clientY, tx: pos.tx, ty: pos.ty };
  };
  useEffect(() => {
    const onMove = (e) => {
      if (!drag.current) return;
      const p = 'touches' in e ? e.touches[0] : e;
      const dx = p.clientX - drag.current.x;
      const dy = p.clientY - drag.current.y;
      setPos((prev) => ({ ...prev, ...clamp(drag.current.tx + dx, drag.current.ty + dy) }));
    };
    const onUp = () => { drag.current = null; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [W, z, dispW, dispH]);

  useImperativeHandle(ref, () => ({
    async capture(out) {
      const p = pos || clamp((W - dispW) / 2, (H - dispH) / 2);
      const sx = -p.tx / scale;
      const sy = -p.ty / scale;
      const sCropW = W / scale;
      const sCropH = H / scale;
      const target = out || { w: 900, h: Math.round(900 / aspect) };
      const blob = await cropToBlob(source, { sx, sy, sw: sCropW, sh: sCropH }, target);
      return { blob, meta: { z, txN: p.tx / W, tyN: p.ty / H } };
    },
  }), [pos, scale, W, H, dispW, dispH, z, source, aspect]);

  return (
    <div>
      <div
        ref={wrapRef}
        className="cropper-stage"
        style={{ height: H }}
        onMouseDown={onDown}
        onTouchStart={onDown}
      >
        {pos && (
          <img
            src={displaySrc}
            alt=""
            draggable={false}
            style={{ position: 'absolute', left: pos.tx, top: pos.ty, width: dispW, height: dispH, maxWidth: 'none', userSelect: 'none' }}
          />
        )}
        <div className="cropper-grid" />
      </div>
      <div className="cropper-zoom">
        <ZoomIn size={15} />
        <input
          type="range"
          min="1"
          max="4"
          step="0.01"
          value={z}
          onChange={(e) => setZ(Number(e.target.value))}
        />
      </div>
    </div>
  );
});

export default ThumbCropper;
