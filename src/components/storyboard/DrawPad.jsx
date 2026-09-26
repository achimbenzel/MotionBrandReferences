import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { X, Undo2, Redo2, Trash2, PenLine, Highlighter, Eraser, Eye, EyeOff, Check } from 'lucide-react';

const COLORS = ['#111111', '#6b6b73', '#ffffff', '#e5484d', '#2f80ed', '#27ae60', '#f2c94c', '#2ec5d3'];
const SIZES = [{ key: 's', label: 'Fine', w: 3 }, { key: 'm', label: 'Medium', w: 7 }, { key: 'l', label: 'Bold', w: 16 }];
const TOOLS = [
  { key: 'pen', label: 'Pen', icon: PenLine },
  { key: 'marker', label: 'Marker', icon: Highlighter },
  { key: 'eraser', label: 'Eraser', icon: Eraser },
];
const LONG = 1600; // the drawing's long side in px

// One stroke onto a context: smooth curves through the points; the marker is
// wide and see-through, the eraser takes the drawing away (not the frame).
function drawStroke(ctx, s, k = 1) {
  const pts = s.points;
  if (!pts.length) return;
  ctx.save();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.globalCompositeOperation = s.tool === 'eraser' ? 'destination-out' : 'source-over';
  ctx.strokeStyle = s.color;
  ctx.fillStyle = s.color;
  ctx.globalAlpha = s.tool === 'marker' ? 0.35 : 1;
  const width = (p) => s.width * k * (s.tool === 'pen' ? 0.45 + 0.9 * (p ?? 0.5) : 1) * (s.tool === 'marker' ? 2.6 : 1);
  if (pts.length === 1) {
    ctx.beginPath(); ctx.arc(pts[0].x * k, pts[0].y * k, width(pts[0].p) / 2, 0, Math.PI * 2); ctx.fill();
  } else if (s.tool === 'marker') {
    // One path, so the see-through ink doesn't darken where segments meet.
    ctx.lineWidth = width();
    ctx.beginPath(); ctx.moveTo(pts[0].x * k, pts[0].y * k);
    for (let i = 1; i < pts.length - 1; i += 1) {
      const mx = (pts[i].x + pts[i + 1].x) / 2; const my = (pts[i].y + pts[i + 1].y) / 2;
      ctx.quadraticCurveTo(pts[i].x * k, pts[i].y * k, mx * k, my * k);
    }
    ctx.lineTo(pts[pts.length - 1].x * k, pts[pts.length - 1].y * k);
    ctx.stroke();
  } else {
    // Segment by segment, so pen pressure can change the width.
    for (let i = 1; i < pts.length; i += 1) {
      const a = pts[i - 1]; const b = pts[i];
      const c = pts[i + 1] || b;
      ctx.lineWidth = width((a.p + b.p) / 2);
      ctx.beginPath();
      ctx.moveTo(((a.x + b.x) / 2) * k, ((a.y + b.y) / 2) * k);
      ctx.quadraticCurveTo(b.x * k, b.y * k, ((b.x + c.x) / 2) * k, ((b.y + c.y) / 2) * k);
      ctx.stroke();
    }
  }
  ctx.restore();
}

/**
 * Draw a frame: a blank sheet in the storyboard's shape, or sketch over the
 * shot's frame. Pen (pressure-sensitive with a stylus), marker, eraser,
 * colours, sizes, undo / redo. Saved as a new frame — the old one stays as a
 * variant of the shot.
 */
export default function DrawPad({ ratio, background, title, onSave, onClose }) {
  const W = ratio >= 1 ? LONG : Math.round(LONG * ratio);
  const H = ratio >= 1 ? Math.round(LONG / ratio) : LONG;
  const [tool, setTool] = useState('pen');
  const [color, setColor] = useState(COLORS[0]);
  const [size, setSize] = useState('m');
  const [strokes, setStrokes] = useState([]);
  const [undone, setUndone] = useState([]);
  const [showBg, setShowBg] = useState(true);
  const [bgImg, setBgImg] = useState(null);
  const [saving, setSaving] = useState(false);
  const [view, setView] = useState({ w: 600, h: 400 });
  const areaRef = useRef(null);
  const inkRef = useRef(null);
  const live = useRef(null); // the stroke being drawn

  useEffect(() => {
    if (!background) return;
    const im = new Image();
    im.crossOrigin = 'anonymous';
    im.onload = () => setBgImg(im);
    im.src = background;
  }, [background]);

  // Fit the sheet into the window.
  useLayoutEffect(() => {
    const el = areaRef.current;
    if (!el) return undefined;
    const measure = () => {
      const k = Math.min((el.clientWidth - 24) / W, (el.clientHeight - 24) / H);
      setView({ w: Math.round(W * k), h: Math.round(H * k) });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [W, H]);

  // The ink layer at full resolution (strokes are stored in sheet pixels).
  const redraw = useCallback((list) => {
    const c = inkRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, W, H);
    for (const s of list) drawStroke(ctx, s);
  }, [W, H]);
  useEffect(() => { redraw(strokes); }, [strokes, redraw]);

  const at = (e) => {
    const r = inkRef.current.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H, p: e.pressure || 0.5 };
  };
  const down = (e) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const w = SIZES.find((x) => x.key === size).w * (W / 1000);
    live.current = { tool, color, width: w, points: [at(e)] };
    redraw([...strokes, live.current]);
  };
  const move = (e) => {
    const s = live.current;
    if (!s) return;
    const evs = e.nativeEvent.getCoalescedEvents?.() || [e.nativeEvent];
    for (const ev of evs) s.points.push(at(ev));
    redraw([...strokes, s]);
  };
  const up = () => {
    const s = live.current;
    live.current = null;
    if (!s) return;
    setStrokes((list) => [...list, s]);
    setUndone([]);
  };
  const undo = () => setStrokes((list) => { if (!list.length) return list; setUndone((u) => [...u, list[list.length - 1]]); return list.slice(0, -1); });
  const redo = () => setUndone((u) => { if (!u.length) return u; setStrokes((list) => [...list, u[u.length - 1]]); return u.slice(0, -1); });

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
      if (!e.metaKey && !e.ctrlKey) {
        if (e.key === 'p') setTool('pen'); if (e.key === 'm') setTool('marker'); if (e.key === 'e') setTool('eraser');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const save = async () => {
    setSaving(true);
    try {
      const out = document.createElement('canvas');
      out.width = W; out.height = H;
      const ctx = out.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, W, H);
      if (bgImg && showBg) {
        const k = Math.max(W / bgImg.width, H / bgImg.height); // fills the frame, as the storyboard shows it
        ctx.drawImage(bgImg, (W - bgImg.width * k) / 2, (H - bgImg.height * k) / 2, bgImg.width * k, bgImg.height * k);
      }
      ctx.drawImage(inkRef.current, 0, 0);
      const blob = await new Promise((r) => { out.toBlob(r, 'image/png'); });
      await onSave(blob);
    } finally { setSaving(false); }
  };

  return (
    <div className="overlay dp-overlay">
      <div className="modal dp" role="dialog" aria-modal="true" aria-label="Draw a frame">
        <div className="modal-head">
          <h2>{title || 'Draw'}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>
        <div className="dp-tools">
          <div className="segmented segmented-sm" role="group" aria-label="Tool">
            {TOOLS.map((t) => <button key={t.key} type="button" className={tool === t.key ? 'on' : ''} onClick={() => setTool(t.key)} title={`${t.label} (${t.key[0]})`}><t.icon size={14} /> <span>{t.label}</span></button>)}
          </div>
          <div className="segmented segmented-sm" role="group" aria-label="Size">
            {SIZES.map((x) => <button key={x.key} type="button" className={size === x.key ? 'on' : ''} onClick={() => setSize(x.key)} title={x.label}><i className="dp-dot" style={{ width: 4 + x.w / 1.6, height: 4 + x.w / 1.6 }} /></button>)}
          </div>
          <div className="dp-colors" role="group" aria-label="Colour">
            {COLORS.map((c) => <button key={c} type="button" className={`dp-color ${color === c ? 'on' : ''}`} style={{ background: c }} onClick={() => { setColor(c); if (tool === 'eraser') setTool('pen'); }} aria-label={c} />)}
            <label className="dp-color dp-custom" title="Any colour"><input type="color" value={color} onChange={(e) => { setColor(e.target.value); if (tool === 'eraser') setTool('pen'); }} /></label>
          </div>
          <span className="dp-grow" />
          {background && (
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => setShowBg((v) => !v)} title="The frame underneath — kept in the drawing when shown">
              {showBg ? <Eye size={14} /> : <EyeOff size={14} />} Frame
            </button>
          )}
          <button type="button" className="icon-btn" onClick={undo} disabled={!strokes.length} aria-label="Undo"><Undo2 size={16} /></button>
          <button type="button" className="icon-btn" onClick={redo} disabled={!undone.length} aria-label="Redo"><Redo2 size={16} /></button>
          <button type="button" className="icon-btn" onClick={() => { setUndone(strokes.slice().reverse()); setStrokes([]); }} disabled={!strokes.length} aria-label="Clear"><Trash2 size={15} /></button>
        </div>
        <div className="dp-area" ref={areaRef}>
          <div className="dp-sheet" style={{ width: view.w, height: view.h }}>
            {bgImg && showBg && <img src={background} alt="" className="dp-bg" draggable={false} />}
            <canvas ref={inkRef} width={W} height={H} className={`dp-ink tool-${tool}`}
              onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} />
          </div>
        </div>
        <div className="dp-foot">
          <span className="hint">P pen · M marker · E eraser · ⌘Z undo. {background ? 'Saved as the new frame — the one you drew over stays as a variant.' : 'Saved as the frame of this shot.'}</span>
          <button type="button" className="btn btn-sm" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-sm btn-primary" onClick={save} disabled={saving || (!strokes.length && !(bgImg && showBg))}><Check size={14} /> {saving ? 'Saving…' : 'Use as frame'}</button>
        </div>
      </div>
    </div>
  );
}
