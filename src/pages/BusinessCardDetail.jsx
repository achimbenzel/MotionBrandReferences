import { useEffect, useRef, useState } from 'react';
import { CreditCard, Tag, Maximize2, RotateCw, Box } from 'lucide-react';
import { api, fileUrl } from '../lib/api.js';
import { useToast } from '../components/Toast.jsx';
import TagInput from '../components/TagInput.jsx';
import Lightbox from '../components/Lightbox.jsx';
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
        <BusinessCard3D front={front} back={back} ratio={ratio} />
      </div>

      <div className="section">
        <div className="section-head"><h2><Tag size={16} /> Tags</h2></div>
        <TagInput tags={project.tags || []} onChange={saveTags} placeholder="color scheme, type…" />
      </div>

      {lightbox >= 0 && sides.length > 0 && (
        <Lightbox items={sides.map((s) => ({ src: s.src, caption: s.label }))} index={lightbox} onIndex={setLightbox} onClose={() => setLightbox(-1)} />
      )}
    </div>
  );
}

/** Draggable 3D card that flips between front and back. */
function BusinessCard3D({ front, back, ratio }) {
  const [rot, setRot] = useState({ x: -14, y: 22 });
  const drag = useRef(null);

  const onDown = (e) => {
    e.preventDefault();
    const p = 'touches' in e ? e.touches[0] : e;
    drag.current = { x: p.clientX, y: p.clientY, rx: rot.x, ry: rot.y };
  };
  useEffect(() => {
    const onMove = (e) => {
      if (!drag.current) return;
      const p = 'touches' in e ? e.touches[0] : e;
      const dx = p.clientX - drag.current.x;
      const dy = p.clientY - drag.current.y;
      setRot({
        x: Math.max(-80, Math.min(80, drag.current.rx - dy * 0.4)),
        y: drag.current.ry + dx * 0.4,
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
  const reset = () => setRot({ x: -14, y: 22 });

  return (
    <div className="bc3d">
      <div className="bc3d-scene" onMouseDown={onDown} onTouchStart={onDown}>
        <div className="bc3d-card" style={{ aspectRatio: ratio, transform: `rotateX(${rot.x}deg) rotateY(${rot.y}deg)` }}>
          <div className="bc3d-face front">
            {front ? <img src={front} alt="front" /> : <span className="bc3d-empty">Front</span>}
          </div>
          <div className="bc3d-face back">
            {back ? <img src={back} alt="back" /> : <span className="bc3d-empty">Back</span>}
          </div>
        </div>
      </div>
      <div className="bc3d-controls">
        <span className="hint">Ziehen zum Drehen</span>
        <button className="btn btn-sm" onClick={flip}><RotateCw size={15} /> Umdrehen</button>
        <button className="btn btn-ghost btn-sm" onClick={reset}>Zurücksetzen</button>
      </div>
    </div>
  );
}
