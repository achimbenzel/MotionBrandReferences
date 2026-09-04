import { useEffect, useCallback } from 'react';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';

/**
 * Fullscreen image viewer. `items` is an array of { src, caption }.
 * `index` is the current position; onIndex(n) navigates; onClose() closes.
 * Images are shown at their true aspect ratio (contained, never cropped).
 */
export default function Lightbox({ items, index, onIndex, onClose }) {
  const count = items.length;
  const go = useCallback((d) => onIndex((index + d + count) % count), [index, count, onIndex]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'ArrowLeft') go(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, onClose]);

  const item = items[index];
  if (!item) return null;

  return (
    <div className="lightbox" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <button className="lightbox-close icon-btn" onClick={onClose} aria-label="Close"><X size={20} /></button>
      {count > 1 && (
        <button className="lightbox-nav prev icon-btn" onClick={() => go(-1)} aria-label="Previous"><ChevronLeft size={26} /></button>
      )}
      <figure className="lightbox-figure">
        <img src={item.src} alt={item.caption || ''} />
        {(item.caption || count > 1) && (
          <figcaption>{item.caption}{count > 1 ? `${item.caption ? ' · ' : ''}${index + 1} / ${count}` : ''}</figcaption>
        )}
      </figure>
      {count > 1 && (
        <button className="lightbox-nav next icon-btn" onClick={() => go(1)} aria-label="Next"><ChevronRight size={26} /></button>
      )}
    </div>
  );
}
