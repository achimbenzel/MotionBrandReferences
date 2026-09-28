import { useEffect, useRef, useState } from 'react';
import { RotateCw, Layers, Download } from 'lucide-react';
import Menu from './Menu.jsx';
import { useToast } from './Toast.jsx';
import { isTouch } from '../lib/useMedia.js';
import { CardViewer, PAPER_FINISHES, PAPER_THICKNESS, PAPER_EDGES, PAPER_CORNERS, paperOf } from '../lib/card3d.js';

const options = (heading, table, value, pick, note) => [
  { heading },
  ...Object.entries(table).map(([key, o]) => ({ label: o.label, hint: note?.(o), checked: value === key, keepOpen: true, onClick: () => pick(key) })),
];

/**
 * The card in 3D (three.js): its real size and thickness, the front and back
 * printed on it, studio light and a soft shadow underneath. Drag to turn it,
 * flip it, pick the paper (saved with the card), save the view as a PNG.
 */
export default function BusinessCard3D({ front, back, size, paper, onPaper, name = 'business-card' }) {
  const toast = useToast();
  const ref = useRef(null);
  const viewer = useRef(null);
  const [side, setSide] = useState('front');
  const [failed, setFailed] = useState(false);
  const p = paperOf(paper);

  useEffect(() => {
    let v;
    try { v = new CardViewer(ref.current, { size, onSide: setSide }); } catch { setFailed(true); return undefined; }
    viewer.current = v;
    return () => { v.dispose(); viewer.current = null; };
  }, [size.w, size.h]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { viewer.current?.setSides({ front, back }); }, [front, back, size.w, size.h]);
  useEffect(() => { viewer.current?.setPaper(p); }, [p.finish, p.thickness, p.edge, p.corners, size.w, size.h]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (key) => (value) => onPaper?.({ ...p, [key]: value });
  const save = async () => {
    try {
      const blob = await viewer.current?.snapshot(2);
      if (!blob) return;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${String(name).replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '') || 'business-card'}-3d.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    } catch (e) { toast(`Could not save the picture: ${e.message}`, 'error'); }
  };

  if (failed) return <div className="bc3d-scene bc3d-fail">The 3D view needs WebGL, which this browser doesn’t offer right now.</div>;
  return (
    <div className="bc3d">
      <div className="bc3d-scene" ref={ref} />
      <div className="bc3d-controls">
        <span className="hint">{isTouch() ? 'Drag to turn' : 'Drag to turn · double-click to flip'}</span>
        <button type="button" className="btn btn-sm" onClick={() => viewer.current?.flip()}><RotateCw size={15} /> {side === 'front' ? 'Show back' : 'Show front'}</button>
        <Menu align="left" title="Paper" trigger={(
          <button type="button" className="btn btn-sm btn-ghost"><Layers size={15} /> {PAPER_FINISHES[p.finish].label} · {PAPER_THICKNESS[p.thickness].note}</button>
        )} items={[
          ...options('Finish', PAPER_FINISHES, p.finish, set('finish')),
          ...options('Thickness', PAPER_THICKNESS, p.thickness, set('thickness'), (o) => o.note),
          ...options('Edge', PAPER_EDGES, p.edge, set('edge')),
          ...options('Corners', PAPER_CORNERS, p.corners, set('corners')),
        ]} />
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => viewer.current?.reset()}>Reset</button>
        <button type="button" className="icon-btn" onClick={save} title="Save this view as a PNG" aria-label="Save this view as a PNG"><Download size={16} /></button>
      </div>
    </div>
  );
}
