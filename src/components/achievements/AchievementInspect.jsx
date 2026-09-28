import { useEffect, useRef, useState } from 'react';
import { X, ChevronLeft, ChevronRight, Pencil, RotateCw } from 'lucide-react';
import { RARITIES, fmtDate, fmtValue, progressOf } from '../../lib/achievements.js';
import AchievementCard, { CardBack } from './AchievementCard.jsx';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const TILT_X = 22; const TILT_Y = 30; // how far it leans towards the pointer

/**
 * One card big, to look at: it leans towards the pointer (the light and the
 * holo move with it), drag it to turn it — all the way round to its back —
 * and let go to have it settle. ← / → for the next card.
 */
export default function AchievementInspect({ list, index, metrics, onIndex, onClose, onEdit }) {
  const a = list[index];
  const [rot, setRot] = useState({ x: 0, y: 0 });
  const [motion, setMotion] = useState('tilt'); // 'tilt' | 'drag' | 'settle'
  const face = useRef(0); // the side it rests on: 0 (front) or a multiple of 180
  const drag = useRef(null);
  const cardRef = useRef(null);

  useEffect(() => { face.current = 0; setRot({ x: 0, y: 0 }); setMotion('settle'); }, [index]);
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight' && index < list.length - 1) onIndex(index + 1);
      else if (e.key === 'ArrowLeft' && index > 0) onIndex(index - 1);
      else if (e.key === 'f') turn();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const turn = () => { face.current += 180; setMotion('settle'); setRot({ x: 0, y: face.current }); };
  const onDown = (e) => {
    if (e.target.closest('button')) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, rx: rot.x, ry: rot.y, moved: false, onCard: !!cardRef.current?.contains(e.target) };
    setMotion('drag');
  };
  const onMove = (e) => {
    const d = drag.current;
    if (d) {
      const dx = e.clientX - d.x; const dy = e.clientY - d.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) d.moved = true;
      setRot({ y: d.ry + dx * 0.5, x: clamp(d.rx - dy * 0.4, -55, 55) });
      return;
    }
    if (e.pointerType !== 'mouse' || !cardRef.current) return;
    const r = cardRef.current.getBoundingClientRect();
    const nx = clamp((e.clientX - (r.left + r.width / 2)) / (r.width / 2 + 160), -1, 1);
    const ny = clamp((e.clientY - (r.top + r.height / 2)) / (r.height / 2 + 120), -1, 1);
    if (motion !== 'tilt') setMotion('tilt');
    setRot({ x: -ny * TILT_X, y: face.current + nx * TILT_Y });
  };
  const onUp = () => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (!d.moved && !d.onCard) { onClose(); return; } // a click beside the card
    if (!d.moved) { setMotion('tilt'); return; }
    face.current = Math.round(rot.y / 180) * 180;
    setMotion('settle');
    setRot({ x: 0, y: face.current });
  };
  const onLeave = () => { if (!drag.current) { setMotion('settle'); setRot({ x: 0, y: face.current }); } };

  if (!a) return null;
  const r = RARITIES[a.rarity] || RARITIES.stone;
  const p = progressOf(a, metrics);
  const lean = rot.y - face.current;
  const transition = motion === 'drag' ? 'none' : motion === 'tilt' ? 'transform .12s ease-out' : 'transform .8s cubic-bezier(.2, .9, .25, 1.12)';

  return (
    <div className="ach-inspect" style={{ '--rc': r.color }} role="dialog" aria-modal="true" aria-label={a.title || 'Achievement'}
      onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onPointerLeave={onLeave}>
      <button type="button" className="icon-btn ach-inspect-close" onClick={onClose} aria-label="Close"><X size={18} /></button>
      <div className="ach-inspect-stage">
        <div ref={cardRef} className={`ach-inspect-flip ${motion === 'drag' ? 'dragging' : ''}`}
          style={{ transform: `rotateX(${rot.x}deg) rotateY(${rot.y}deg)`, transition, '--mx': `${clamp(50 + lean * 1.8, -20, 120)}%`, '--my': `${clamp(45 - rot.x * 2, -20, 120)}%` }}>
          <div className="ach-inspect-face"><AchievementCard a={a} metrics={metrics} as="div" still /><i className="ach-inspect-glare" /></div>
          <div className="ach-inspect-face back"><CardBack a={a} /><i className="ach-inspect-glare" /></div>
        </div>
      </div>
      <div className="ach-inspect-info">
        <span className="ach-inspect-meta">
          <b>{r.label}</b> · {r.xp} XP · {a.group}
          {a.achievedAt ? <> · unlocked {fmtDate(a.achievedAt)}</> : p != null ? <> · {fmtValue(a.metric, metrics?.[a.metric] || 0)} / {fmtValue(a.metric, a.target)}</> : <> · not reached yet</>}
        </span>
        <div className="ach-inspect-tools">
          <button type="button" className="icon-btn" onClick={() => onIndex(index - 1)} disabled={index === 0} aria-label="Previous card"><ChevronLeft size={18} /></button>
          <button type="button" className="btn btn-sm" onClick={turn}><RotateCw size={14} /> Turn</button>
          <button type="button" className="btn btn-sm" onClick={() => onEdit(a)}><Pencil size={14} /> Edit</button>
          <button type="button" className="icon-btn" onClick={() => onIndex(index + 1)} disabled={index === list.length - 1} aria-label="Next card"><ChevronRight size={18} /></button>
        </div>
        <span className="ach-inspect-hint">Drag the card to turn it · ← → next card</span>
      </div>
    </div>
  );
}
