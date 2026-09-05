import { useEffect, useRef, useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import { loadImage } from '../lib/imaging.js';
import ThumbCropper from './ThumbCropper.jsx';

/**
 * Crop a single image (File or URL) to a fixed aspect ratio and return a WebP
 * blob. Used for square logos and business-card front/back sides.
 */
export default function CropModal({ src, aspect = 1, title = 'Crop image', out, initialMeta, onDone, onClose }) {
  const [source, setSource] = useState(null);
  const [error, setError] = useState(null);
  const cropRef = useRef(null);
  const cleanupRef = useRef(null);

  useEffect(() => {
    let alive = true;
    loadImage(src)
      .then(({ img, cleanup }) => { if (alive) { setSource(img); cleanupRef.current = cleanup; } else cleanup(); })
      .catch((e) => { if (alive) setError(e.message); });
    return () => { alive = false; cleanupRef.current?.(); };
  }, [src]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const confirm = async () => {
    try {
      const target = out || { w: 1000, h: Math.round(1000 / aspect) };
      const { blob, meta } = await cropRef.current.capture(target);
      onDone(blob, meta);
    } catch (e) { setError(e.message); }
  };

  return (
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true" style={{ maxWidth: 620 }}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="modal-body">
          {error && <div className="hint" style={{ color: 'var(--danger)', marginBottom: 10 }}>{error}</div>}
          {source ? (
            <>
              <ThumbCropper ref={cropRef} source={source} aspect={aspect} initial={initialMeta} />
              <div className="hint" style={{ marginTop: 10 }}>Drag to reposition · slider to zoom.</div>
            </>
          ) : (
            <div style={{ display: 'grid', placeItems: 'center', minHeight: 200 }}>
              <Loader2 size={26} style={{ animation: 'spin 1s linear infinite', color: 'var(--text-faint)' }} />
            </div>
          )}
        </div>
        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={confirm} disabled={!source}>Use image</button>
        </div>
      </div>
    </div>
  );
}
