import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Slide } from './Slide.jsx';

/**
 * The deck as a PDF: every slide that isn't hidden on a page of its own, at
 * 1920 × 1080 (20 × 11.25 in), through the browser's print dialog — choose
 * "Save as PDF". Text stays text (sharp, searchable). Calls `onDone` after.
 */
export default function PrintDeck({ deck, onDone }) {
  const root = useRef(null);
  useEffect(() => {
    let finished = false;
    const title = document.title; // the PDF is named after it
    const style = document.createElement('style');
    style.textContent = '@page { size: 1920px 1080px; margin: 0; }';
    const done = () => {
      if (finished) return;
      finished = true;
      document.body.classList.remove('pz-printing');
      document.title = title;
      style.remove();
      window.removeEventListener('afterprint', done);
      onDone();
    };
    (async () => {
      // Every picture and the fonts in before the print dialog takes its snapshot.
      const imgs = [...(root.current?.querySelectorAll('img') || [])];
      await Promise.all(imgs.map((img) => (img.complete ? null : new Promise((r) => { img.onload = r; img.onerror = r; }))));
      await document.fonts?.ready;
      document.head.appendChild(style);
      document.body.classList.add('pz-printing');
      document.title = deck.title || 'Presentation';
      window.addEventListener('afterprint', done);
      window.print();
      setTimeout(() => { if (!matchMedia('print').matches) done(); }, 1500);
    })();
    return () => done();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const slides = deck.slides.filter((s) => !s.hidden);
  return createPortal(
    <div ref={root} className="pz-print-root pz-print">
      {slides.map((s) => (
        <div key={s.id} className="pz-print-page"><Slide deck={deck} slide={s} index={deck.slides.indexOf(s)} total={deck.slides.length} /></div>
      ))}
    </div>,
    document.body,
  );
}
