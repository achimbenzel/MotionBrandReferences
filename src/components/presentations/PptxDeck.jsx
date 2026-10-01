import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Slide } from './Slide.jsx';
import { exportPptx } from '../../lib/pptxExport.js';

/**
 * The deck as a PowerPoint file: every slide that isn't hidden is drawn at full
 * size out of sight, then rebuilt from what the browser drew (see pptxExport).
 * Calls `onDone(count)` when the file is downloaded, `onError(e)` if not.
 */
export default function PptxDeck({ deck, onDone, onError }) {
  const root = useRef(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const imgs = [...(root.current?.querySelectorAll('img') || [])];
        await Promise.all(imgs.map((img) => (img.complete ? null : new Promise((r) => { img.onload = r; img.onerror = r; }))));
        await document.fonts?.ready;
        if (!alive) return;
        const count = await exportPptx(deck, [...root.current.querySelectorAll(':scope > .pz-pptx-page > .pz-slide')]);
        if (alive) onDone(count);
      } catch (e) {
        if (alive) onError(e);
      }
    })();
    return () => { alive = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const slides = deck.slides.filter((s) => !s.hidden);
  return createPortal(
    <div ref={root} className="pz-pptx-root" aria-hidden="true">
      {slides.map((s) => (
        <div key={s.id} className="pz-pptx-page"><Slide deck={deck} slide={s} index={deck.slides.indexOf(s)} total={deck.slides.length} /></div>
      ))}
    </div>,
    document.body,
  );
}
