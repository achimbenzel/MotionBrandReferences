import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { Slide, SLIDE_W, SLIDE_H } from './Slide.jsx';

/**
 * The deck fullscreen: → / Space / a click on the right half for the next
 * slide, ← / a click on the left half back, a swipe on a phone, Esc to leave.
 * Hidden slides are left out.
 */
export default function Presenter({ deck, start = 0, onClose }) {
  const slides = deck.slides.filter((s) => !s.hidden);
  const [at, setAt] = useState(() => Math.max(0, Math.min(slides.length - 1, start)));
  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight });
  const [idle, setIdle] = useState(false);
  const root = useRef(null);
  const touch = useRef(null);
  const go = (d) => setAt((i) => Math.max(0, Math.min(slides.length - 1, i + d)));

  useEffect(() => {
    root.current?.requestFullscreen?.().catch(() => {}); // a browser that says no still shows it over the page
    document.documentElement.classList.add('pz-presenting'); // no page scrollbar beside it
    const onKey = (e) => {
      if (['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter'].includes(e.key)) { e.preventDefault(); go(1); }
      else if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace'].includes(e.key)) { e.preventDefault(); go(-1); }
      else if (e.key === 'Home') setAt(0);
      else if (e.key === 'End') setAt(slides.length - 1);
      else if (e.key === 'Escape') onClose();
    };
    const onSize = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    // Leaving fullscreen (Esc in the browser) ends presenting.
    const onFs = () => { if (!document.fullscreenElement) onClose(); };
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', onSize);
    document.addEventListener('fullscreenchange', onFs);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onSize);
      document.removeEventListener('fullscreenchange', onFs);
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
      document.documentElement.classList.remove('pz-presenting');
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // The controls fade once the pointer rests.
  useEffect(() => {
    setIdle(false);
    const t = setTimeout(() => setIdle(true), 2200);
    return () => clearTimeout(t);
  }, [at]);

  const scale = Math.min(size.w / SLIDE_W, size.h / SLIDE_H);
  const slide = slides[at];
  return createPortal(
    <div ref={root} className={`pz-present ${idle ? 'idle' : ''}`} role="dialog" aria-label="Presenting"
      onMouseMove={() => setIdle(false)}
      onClick={(e) => { if (e.target.closest('button')) return; go(e.clientX > window.innerWidth / 2 ? 1 : -1); }}
      onTouchStart={(e) => { touch.current = e.touches[0].clientX; }}
      onTouchEnd={(e) => { const dx = e.changedTouches[0].clientX - (touch.current ?? 0); if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1); touch.current = null; }}>
      {slide && (
        <div className="pz-present-stage" style={{ width: SLIDE_W * scale, height: SLIDE_H * scale }}>
          <div className="pz-scale" style={{ transform: `scale(${scale})` }}>
            <Slide deck={deck} slide={slide} index={deck.slides.indexOf(slide)} total={deck.slides.length} />
          </div>
        </div>
      )}
      <div className="pz-present-bar">
        <button type="button" onClick={() => go(-1)} disabled={at === 0} aria-label="Previous slide"><ChevronLeft size={20} /></button>
        <span>{at + 1} / {slides.length}</span>
        <button type="button" onClick={() => go(1)} disabled={at >= slides.length - 1} aria-label="Next slide"><ChevronRight size={20} /></button>
        <button type="button" onClick={onClose} aria-label="Stop presenting"><X size={18} /></button>
      </div>
    </div>,
    document.body,
  );
}
