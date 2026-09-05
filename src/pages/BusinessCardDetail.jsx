import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { CreditCard, Tag, Maximize2, RotateCw, Box } from 'lucide-react';
import { api, fileUrl } from '../lib/api.js';
import { useToast } from '../components/Toast.jsx';
import TagInput from '../components/TagInput.jsx';
import Lightbox from '../components/Lightbox.jsx';
import NotesField from '../components/NotesField.jsx';
import { cardSize } from '../lib/types.js';

export default function BusinessCardDetail({ project, setProject }) {
  const toast = useToast();
  const size = cardSize(project.size);
  const ratio = `${size.w} / ${size.h}`;
  const [lightbox, setLightbox] = useState(-1);

  const saveTags = async (tags) => {
    try { setProject(await api.update(project.id, { tags })); }
    catch (e) { toast(`Could not save tags: ${e.message}`, 'error'); }
  };

  const front = project.front ? fileUrl(project, project.front) : null;
  const back = project.back ? fileUrl(project, project.back) : null;
  const sides = [
    front && { label: 'Front', src: front },
    back && { label: 'Back', src: back },
  ].filter(Boolean);

  return (
    <div>
      <div className="hint" style={{ marginBottom: 14 }}><CreditCard size={13} /> Size: <b>{size.label}</b></div>

      <div className="bc-detail">
        {sides.map((s, i) => (
          <figure key={s.label} className="media-frame bc-detail-side" onClick={() => setLightbox(i)} title="Fullscreen">
            <img src={s.src} alt={s.label} style={{ aspectRatio: ratio, objectFit: 'cover', width: '100%', maxHeight: 'none', borderRadius: 8 }} />
            <span className="bc-detail-label">{s.label}</span>
            <button className="media-fs icon-btn"><Maximize2 size={16} /></button>
          </figure>
        ))}
      </div>

      <div className="section">
        <div className="section-head"><h2><Box size={16} /> 3D-Ansicht</h2></div>
        <BusinessCard3D front={front} back={back} size={size} />
      </div>

      <div className="section">
        <div className="section-head"><h2><Tag size={16} /> Tags</h2></div>
        <TagInput tags={project.tags || []} onChange={saveTags} placeholder="color scheme, type…" />
      </div>

      <NotesField project={project} setProject={setProject} />

      {lightbox >= 0 && sides.length > 0 && (
        <Lightbox items={sides.map((s) => ({ src: s.src, caption: s.label }))} index={lightbox} onIndex={setLightbox} onClose={() => setLightbox(-1)} />
      )}
    </div>
  );
}

/** Draggable 3D card (real cuboid with white edges), flippable. */
function BusinessCard3D({ front, back, size }) {
  const [rot, setRot] = useState({ x: -16, y: 24 });
  const [dims, setDims] = useState({ w: 380, h: 240, t: 5 });
  const sceneRef = useRef(null);
  const drag = useRef(null);

  // Size the card to the available width (fixed px so the edge faces line up).
  useLayoutEffect(() => {
    const el = sceneRef.current;
    if (!el) return;
    const measure = () => {
      const w = Math.max(200, Math.min(440, el.clientWidth - 48));
      const h = Math.round((w * size.h) / size.w);
      const t = Math.max(5, Math.round(w * 0.016)); // a little thickness
      setDims({ w, h, t });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [size.w, size.h]);

  const onDown = (e) => {
    e.preventDefault();
    const p = 'touches' in e ? e.touches[0] : e;
    drag.current = { x: p.clientX, y: p.clientY, rx: rot.x, ry: rot.y };
  };
  useEffect(() => {
    const onMove = (e) => {
      if (!drag.current) return;
      const p = 'touches' in e ? e.touches[0] : e;
      setRot({
        x: Math.max(-80, Math.min(80, drag.current.rx - (p.clientY - drag.current.y) * 0.4)),
        y: drag.current.ry + (p.clientX - drag.current.x) * 0.4,
      });
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
  }, []);

  const flip = () => setRot((r) => ({ ...r, y: r.y + 180 }));
  const reset = () => setRot({ x: -16, y: 24 });

  const { w, h, t } = dims;
  const vars = { '--w': `${w}px`, '--h': `${h}px`, '--t': `${t}px` };

  return (
    <div className="bc3d">
      <div className="bc3d-scene" ref={sceneRef} onMouseDown={onDown} onTouchStart={onDown}>
        <div className="bc3d-card" style={{ ...vars, width: `${w}px`, height: `${h}px`, transform: `rotateX(${rot.x}deg) rotateY(${rot.y}deg)` }}>
          <div className="bc3d-face front">{front ? <img src={front} alt="front" /> : <span className="bc3d-empty">Front</span>}</div>
          <div className="bc3d-face back">{back ? <img src={back} alt="back" /> : <span className="bc3d-empty">Back</span>}</div>
          <div className="bc3d-edge lr left" />
          <div className="bc3d-edge lr right" />
          <div className="bc3d-edge tb top" />
          <div className="bc3d-edge tb bottom" />
        </div>
        <div className="bc3d-shadow" />
      </div>
      <div className="bc3d-controls">
        <span className="hint">Ziehen zum Drehen</span>
        <button className="btn btn-sm" onClick={flip}><RotateCw size={15} /> Umdrehen</button>
        <button className="btn btn-ghost btn-sm" onClick={reset}>Zurücksetzen</button>
      </div>
    </div>
  );
}
