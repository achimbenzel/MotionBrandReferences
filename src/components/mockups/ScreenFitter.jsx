import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { X, Maximize, Minimize, Crosshair, RotateCcw, Grid3x3 } from 'lucide-react';
import { contentBox } from '../../lib/mockup3d/fit.js';
import Range from '../Range.jsx';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const round = (v, d = 4) => Math.round(v * 10 ** d) / 10 ** d;
const SNAP_PX = 7;
// What shows behind the picture — a black logo is lost on black, a white one on white.
const BACKDROPS = [
  { key: 'checker', label: 'Checker', title: 'Checkerboard (transparent)' },
  { key: 'light', label: 'Light', swatch: '#f4f4f6' },
  { key: 'grey', label: 'Grey', swatch: '#8a8a92' },
  { key: 'dark', label: 'Dark', swatch: '#000' },
];
const GRIDS = [
  { key: 'thirds', label: 'Thirds' },
  { key: 'fine', label: 'Fine' },
  { key: 'off', label: 'Off' },
];

// A point of the screen (u, v in its UV space, v up) → where you see it on the
// upright screen (x, y as fractions, y down).
function toView(u, v, aspect, q) {
  const px = (u - 0.5) * aspect; const py = v - 0.5;
  const a = (q * Math.PI) / 2;
  const rx = Math.cos(a) * px + Math.sin(a) * py; const ry = -Math.sin(a) * px + Math.cos(a) * py;
  const vw = q % 2 ? 1 : aspect; const vh = q % 2 ? aspect : 1;
  return [0.5 + rx / vw, 0.5 - ry / vh];
}

/** The screen's shape as you see it: corner radii (px), cut-outs and safe area (fractions). */
function viewGuide(guide, aspect, q, widthPx) {
  if (!guide) return { radii: [0, 0, 0, 0], cutouts: [], safe: null };
  const vw = q % 2 ? 1 : aspect;
  const pxPerUnit = widthPx / vw;
  // Screen corners tl, tr, br, bl in UV; each lands on some corner of the view.
  const corners = [[0, 1], [1, 1], [1, 0], [0, 0]];
  const radii = [0, 0, 0, 0];
  corners.forEach(([u, v], k) => {
    const [x, y] = toView(u, v, aspect, q);
    const at = y < 0.5 ? (x < 0.5 ? 0 : 1) : (x < 0.5 ? 3 : 2);
    radii[at] = (guide.radius?.[k] || 0) * aspect * pxPerUnit;
  });
  const cutouts = (guide.cutouts || []).map((c) => {
    const [x, y] = toView(c.u, c.v, aspect, q);
    const wu = c.w * aspect; const hv = c.h; // screen units
    const vh = q % 2 ? aspect : 1;
    const w = (q % 2 ? hv : wu) / vw; const h = (q % 2 ? wu : hv) / vh;
    return { x: x - w / 2, y: y - h / 2, w, h, round: c.round };
  });
  let safe = null;
  if (guide.safe) {
    const s = guide.safe;
    const [ax, ay] = toView(s.left || 0, 1 - (s.top || 0), aspect, q);
    const [bx, by] = toView(1 - (s.right || 0), s.bottom || 0, aspect, q);
    safe = { x: Math.min(ax, bx), y: Math.min(ay, by), w: Math.abs(bx - ax), h: Math.abs(by - ay) };
  }
  return { radii, cutouts, safe };
}

/**
 * Size and place the picture inside a device's screen: the screen as you see
 * it (its real shape, island / notch, safe area) with a grid; drag to move,
 * scroll / pinch / corner handles to zoom; it snaps to the middle and edges.
 * Changes apply to the 3D device live.
 */
export default function ScreenFitter({ info, src, kind, fit: fit0, adjust: adj0, onChange, onClose, title = 'Position & size on the screen' }) {
  const [fit, setFit] = useState(fit0 || 'cover');
  const [adj, setAdj] = useState(() => ({ scale: 1, x: 0, y: 0, ...adj0 }));
  const [grid, setGrid] = useState(() => { try { return localStorage.getItem('mkFitterGrid') || 'thirds'; } catch { return 'thirds'; } });
  const [showSafe, setShowSafe] = useState(true);
  const [backdrop, setBackdropState] = useState(() => { try { return localStorage.getItem('mkFitterBackdrop') || 'checker'; } catch { return 'checker'; } });
  const setBackdrop = (b) => { setBackdropState(b); try { localStorage.setItem('mkFitterBackdrop', b); } catch { /* only remembered for this visit */ } };
  const [snapped, setSnapped] = useState({ x: null, y: null });
  const [natural, setNatural] = useState(info?.contentAspect || null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const areaRef = useRef(null);
  const drag = useRef(null);
  const pointers = useRef(new Map());

  const aspect = info?.aspect || 16 / 9;
  const q = (((Math.round(info?.turn || 0)) % 4) + 4) % 4;
  const cAspect = natural || 1;
  const base = useMemo(() => contentBox({ screenAspect: aspect, contentAspect: cAspect, turn: q, fit }), [aspect, cAspect, q, fit]);
  const view = base.viewAspect;

  useEffect(() => { try { localStorage.setItem('mkFitterGrid', grid); } catch { /* private mode */ } }, [grid]);
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // The screen as large as the area allows.
  useLayoutEffect(() => {
    const el = areaRef.current;
    if (!el) return undefined;
    const measure = () => {
      const aw = el.clientWidth - 48; const ah = el.clientHeight - 48;
      let w = aw; let h = aw / view;
      if (h > ah) { h = ah; w = ah * view; }
      setBox({ w: Math.max(40, Math.floor(w)), h: Math.max(40, Math.floor(h)) });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [view]);

  const commit = useCallback((nextAdj, nextFit = fit) => {
    const a = { scale: round(clamp(nextAdj.scale, 0.05, 8)), x: round(clamp(nextAdj.x, -3, 3)), y: round(clamp(nextAdj.y, -3, 3)) };
    setAdj(a);
    onChange({ fit: nextFit, adjust: a });
  }, [fit, onChange]);

  // The picture's box on the screen (fractions of it).
  const pw = base.w * adj.scale; const ph = base.h * adj.scale;
  const left = 0.5 + adj.x - pw / 2; const top = 0.5 + adj.y - ph / 2;

  // Snap the centre / edges to the screen's middle and edges.
  const snap = (x, y, s = adj.scale) => {
    const w = base.w * s; const h = base.h * s;
    const tx = SNAP_PX / (box.w || 1); const ty = SNAP_PX / (box.h || 1);
    let sx = null; let sy = null;
    for (const [target, key] of [[0, 'center'], [-0.5 + w / 2, 'left'], [0.5 - w / 2, 'right']]) {
      if (Math.abs(x - target) < tx) { x = target; sx = key; break; }
    }
    for (const [target, key] of [[0, 'middle'], [-0.5 + h / 2, 'top'], [0.5 - h / 2, 'bottom']]) {
      if (Math.abs(y - target) < ty) { y = target; sy = key; break; }
    }
    return { x, y, sx, sy };
  };

  const zoomAt = (factor, cx = 0.5, cy = 0.5) => {
    const s = clamp(adj.scale * factor, 0.05, 8);
    const k = s / adj.scale;
    // Keep the point under the pointer where it is.
    const px = cx - 0.5; const py = cy - 0.5;
    commit({ scale: s, x: px + (adj.x - px) * k, y: py + (adj.y - py) * k });
  };

  const rel = (e) => {
    const r = areaRef.current.querySelector('.sf-screen-box').getBoundingClientRect();
    return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height];
  };

  const onPointerDown = (e) => {
    if (e.button !== undefined && e.button !== 0 && e.pointerType === 'mouse') return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, rel(e));
    const handle = e.target.closest?.('[data-handle]');
    const pts = [...pointers.current.values()];
    if (pts.length === 2) {
      const [a, b] = pts;
      drag.current = { mode: 'pinch', dist: Math.hypot((a[0] - b[0]) * box.w, (a[1] - b[1]) * box.h), mid: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], start: adj };
    } else if (handle) {
      const [x, y] = rel(e);
      const d0 = Math.hypot((x - 0.5 - adj.x) * box.w, (y - 0.5 - adj.y) * box.h);
      drag.current = { mode: 'scale', d0: Math.max(4, d0), start: adj };
    } else {
      drag.current = { mode: 'move', from: rel(e), start: adj };
    }
  };
  const onPointerMove = (e) => {
    if (!pointers.current.has(e.pointerId) || !drag.current) return;
    pointers.current.set(e.pointerId, rel(e));
    const d = drag.current;
    if (d.mode === 'move') {
      const [x, y] = rel(e);
      const s = snap(d.start.x + x - d.from[0], d.start.y + y - d.from[1]);
      setSnapped({ x: s.sx, y: s.sy });
      commit({ ...d.start, x: s.x, y: s.y });
    } else if (d.mode === 'scale') {
      const [x, y] = rel(e);
      const dist = Math.hypot((x - 0.5 - d.start.x) * box.w, (y - 0.5 - d.start.y) * box.h);
      commit({ ...d.start, scale: d.start.scale * (dist / d.d0) });
    } else if (d.mode === 'pinch') {
      const pts = [...pointers.current.values()];
      if (pts.length < 2) return;
      const [a, b] = pts;
      const dist = Math.hypot((a[0] - b[0]) * box.w, (a[1] - b[1]) * box.h);
      const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      const k = dist / (d.dist || 1);
      const s = clamp(d.start.scale * k, 0.05, 8); const kk = s / d.start.scale;
      const px = d.mid[0] - 0.5; const py = d.mid[1] - 0.5;
      commit({ scale: s, x: px + (d.start.x - px) * kk + (mid[0] - d.mid[0]), y: py + (d.start.y - py) * kk + (mid[1] - d.mid[1]) });
    }
  };
  const onPointerUp = (e) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size === 0) { drag.current = null; setSnapped({ x: null, y: null }); }
  };
  const onWheel = (e) => {
    const [x, y] = rel(e);
    zoomAt(Math.exp(-e.deltaY * 0.0015), x, y);
  };
  // Scrolling on the area zooms instead of scrolling the page.
  useEffect(() => {
    const el = areaRef.current;
    if (!el) return undefined;
    const stop = (e) => e.preventDefault();
    el.addEventListener('wheel', stop, { passive: false });
    return () => el.removeEventListener('wheel', stop);
  }, []);
  const onKeyDown = (e) => {
    const step = e.shiftKey ? 0.05 : 0.005;
    const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (moves[e.key]) { e.preventDefault(); commit({ ...adj, x: adj.x + moves[e.key][0], y: adj.y + moves[e.key][1] }); }
    if (e.key === '+' || e.key === '=') zoomAt(1.05);
    if (e.key === '-') zoomAt(1 / 1.05);
  };

  const setMode = (f) => { setFit(f); commit({ scale: 1, x: 0, y: 0 }, f); };
  const g = viewGuide(info?.guide, aspect, q, box.w);
  const radius = g.radii.map((r) => `${Math.round(r)}px`).join(' ');
  const pctStyle = { left: `${left * 100}%`, top: `${top * 100}%`, width: `${pw * 100}%`, height: `${ph * 100}%` };
  const media = (cls) => (kind === 'video'
    ? <video className={cls} src={src} muted loop autoPlay playsInline onLoadedMetadata={(e) => setNatural(e.target.videoWidth / e.target.videoHeight || null)} />
    : <img className={cls} src={src} alt="" draggable={false} onLoad={(e) => setNatural(e.target.naturalWidth / e.target.naturalHeight || null)} />);
  const lines = grid === 'off' ? [] : grid === 'thirds' ? [1 / 3, 2 / 3] : Array.from({ length: 11 }, (_, i) => (i + 1) / 12);
  const linesY = grid === 'off' ? [] : grid === 'thirds' ? [1 / 3, 2 / 3] : Array.from({ length: Math.max(1, Math.round(12 / view) - 1) }, (_, i) => (i + 1) / Math.round(12 / view));

  return (
    <div className="overlay sf-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal sf" role="dialog" aria-modal="true" aria-label="Position and size of the picture">
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>
        <div className="sf-body">
          <div className="sf-area" ref={areaRef} tabIndex={0} onKeyDown={onKeyDown}
            onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} onWheel={onWheel}>
            <div className="sf-screen-box" style={{ width: box.w, height: box.h }}>
              {/* What falls outside the screen, faint */}
              <div className="sf-pic sf-ghost" style={pctStyle}>{media('')}</div>
              <div className={`sf-screen bd-${backdrop}`} style={{ borderRadius: radius }}>
                <div className="sf-pic" style={pctStyle}>{media('')}</div>
                <svg className="sf-grid" viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-hidden="true">
                  {lines.map((x) => <line key={`x${x}`} x1={x * 1000} x2={x * 1000} y1="0" y2="1000" />)}
                  {linesY.map((y) => <line key={`y${y}`} y1={y * 1000} y2={y * 1000} x1="0" x2="1000" />)}
                  <line className={`sf-mid ${snapped.x === 'center' ? 'on' : ''}`} x1="500" x2="500" y1="0" y2="1000" />
                  <line className={`sf-mid ${snapped.y === 'middle' ? 'on' : ''}`} y1="500" y2="500" x1="0" x2="1000" />
                  {showSafe && g.safe && <rect className="sf-safe" x={g.safe.x * 1000} y={g.safe.y * 1000} width={g.safe.w * 1000} height={g.safe.h * 1000} />}
                </svg>
                {g.cutouts.map((c, i) => (
                  <div key={i} className="sf-cutout" style={{ left: `${c.x * 100}%`, top: `${c.y * 100}%`, width: `${c.w * 100}%`, height: `${c.h * 100}%`, borderRadius: c.round ? 999 : '0 0 6px 6px' }} />
                ))}
              </div>
              <div className={`sf-frame ${snapped.x && snapped.x !== 'center' ? 'snap-x' : ''} ${snapped.y && snapped.y !== 'middle' ? 'snap-y' : ''}`} style={pctStyle}>
                {['tl', 'tr', 'br', 'bl'].map((k) => <span key={k} data-handle={k} className={`sf-handle ${k}`} />)}
              </div>
            </div>
          </div>

          <div className="sf-tools">
            <div className="segmented sf-seg" role="group" aria-label="Fit">
              <button type="button" className={fit === 'cover' ? 'on' : ''} onClick={() => setMode('cover')}><Maximize size={13} /> Fill</button>
              <button type="button" className={fit === 'contain' ? 'on' : ''} onClick={() => setMode('contain')}><Minimize size={13} /> Fit</button>
            </div>
            <label className="sf-zoom">
              Size
              <Range min={Math.log(0.1)} max={Math.log(6)} step="0.001" value={Math.log(adj.scale)} onChange={(e) => commit({ ...adj, scale: Math.exp(Number(e.target.value)) })} aria-label="Size" />
              <span>{Math.round(adj.scale * 100)}%</span>
            </label>
            <div className="sf-nums">
              <label>X <input className="input" type="number" step="0.5" value={round(adj.x * 100, 1)} onChange={(e) => commit({ ...adj, x: Number(e.target.value) / 100 || 0 })} />%</label>
              <label>Y <input className="input" type="number" step="0.5" value={round(adj.y * 100, 1)} onChange={(e) => commit({ ...adj, y: Number(e.target.value) / 100 || 0 })} />%</label>
            </div>
            <div className="sf-row">
              <button type="button" className="btn btn-sm" onClick={() => commit({ ...adj, x: 0, y: 0 })}><Crosshair size={13} /> Centre</button>
              <button type="button" className="btn btn-sm" onClick={() => setMode(fit)}><RotateCcw size={13} /> Reset</button>
            </div>
            <div className="sf-row sf-grid-pick">
              <Grid3x3 size={14} />
              <div className="segmented segmented-sm" role="group" aria-label="Grid">
                {GRIDS.map((x) => <button key={x.key} type="button" className={grid === x.key ? 'on' : ''} onClick={() => setGrid(x.key)}>{x.label}</button>)}
              </div>
            </div>
            <div className="sf-row sf-grid-pick" title="What shows behind the picture">
              <span className="sf-label">Behind</span>
              <div className="sf-backdrops" role="group" aria-label="Behind the picture">
                {BACKDROPS.map((x) => (
                  <button key={x.key} type="button" className={`sf-bd bd-${x.key} ${backdrop === x.key ? 'on' : ''}`} onClick={() => setBackdrop(x.key)}
                    title={x.title || x.label} aria-label={x.title || x.label} aria-pressed={backdrop === x.key} />
                ))}
              </div>
            </div>
            {g.safe && <label className="mke-check"><input type="checkbox" checked={showSafe} onChange={(e) => setShowSafe(e.target.checked)} /> Safe area (status bar, home bar…)</label>}
            <div className="hint">Drag to move · scroll, pinch or drag a corner to resize · arrow keys nudge (⇧ = more). It snaps to the middle and the edges.</div>
            <button type="button" className="btn btn-primary sf-done" onClick={onClose}>Done</button>
          </div>
        </div>
      </div>
    </div>
  );
}
