import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, X, LayoutGrid, NotebookText, Maximize, Square } from 'lucide-react';
import { Slide, SlideView, SLIDE_W, SLIDE_H } from './Slide.jsx';
import { presentChannel, openPresenterView, presentKey } from '../../lib/presentSync.js';

/**
 * The deck fullscreen: → / Space / a click on the right half for the next
 * slide, ← / a click on the left half back, a swipe on a phone, Esc to leave.
 * G shows every slide to jump to, B a black screen. Hidden slides are left
 * out. The presenter view (notes, next slide, timer) in a window of its own
 * follows along and steers.
 */
export default function Presenter({ deck, start = 0, onClose }) {
  const slides = deck.slides.filter((s) => !s.hidden);
  const [at, setAt] = useState(() => Math.max(0, Math.min(slides.length - 1, start)));
  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight });
  const [idle, setIdle] = useState(false);
  const [overview, setOverview] = useState(false);
  const [black, setBlack] = useState(false);
  const [fs, setFs] = useState(false);
  const root = useRef(null);
  const touch = useRef(null);
  const channel = useRef(null);
  const linked = useRef(false); // a presenter view is (or is about to be) steering: leaving fullscreen doesn't end it
  const state = useRef({});
  state.current = { overview, black, at, total: slides.length };
  const go = (d) => setAt((i) => Math.max(0, Math.min(slides.length - 1, i + d)));

  useEffect(() => {
    root.current?.requestFullscreen?.().catch(() => {}); // a browser that says no still shows it over the page
    document.documentElement.classList.add('pz-presenting'); // no page scrollbar beside it
    channel.current = presentChannel(deck.id, (m) => {
      if (m.type === 'hello') { linked.current = true; channel.current.post({ type: 'at', at: state.current.at, black: state.current.black }); }
      if (m.type === 'go' && Number.isInteger(m.at)) { linked.current = true; setAt(Math.max(0, Math.min(state.current.total - 1, m.at))); }
      if (m.type === 'black') setBlack(!!m.on);
    });
    const onKey = (e) => {
      if (e.target.closest?.('input, textarea')) return;
      const k = presentKey(e);
      if (!k) return;
      e.preventDefault();
      if (k === 'escape') {
        if (state.current.overview) setOverview(false);
        else if (state.current.black) setBlack(false);
        else onClose();
      } else if (k === 'overview') setOverview((o) => !o);
      else if (k === 'black') setBlack((b) => !b);
      else if (state.current.overview) { if (k === 'next' || k === 'prev') go(k === 'next' ? 1 : -1); }
      else if (k === 'next') go(1);
      else if (k === 'prev') go(-1);
      else if (k === 'first') setAt(0);
      else if (k === 'last') setAt(state.current.total - 1);
    };
    const onSize = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    // Leaving fullscreen (Esc in the browser) ends presenting — unless the presenter view steers.
    const onFs = () => {
      setFs(!!document.fullscreenElement);
      if (!document.fullscreenElement && !linked.current) onClose();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', onSize);
    document.addEventListener('fullscreenchange', onFs);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onSize);
      document.removeEventListener('fullscreenchange', onFs);
      channel.current?.post({ type: 'end' });
      channel.current?.close();
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
      document.documentElement.classList.remove('pz-presenting');
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // The presenter view hears of every move.
  useEffect(() => { channel.current?.post({ type: 'at', at, black }); }, [at, black]);
  // The controls fade once the pointer rests.
  useEffect(() => {
    setIdle(false);
    const t = setTimeout(() => setIdle(true), 2200);
    return () => clearTimeout(t);
  }, [at]);

  const presenterView = () => { linked.current = true; openPresenterView(deck.id); };
  const fullscreen = () => root.current?.requestFullscreen?.().catch(() => {});
  const scale = Math.min(size.w / SLIDE_W, size.h / SLIDE_H);
  const slide = slides[at];
  return createPortal(
    <div ref={root} className={`pz-present ${idle && !overview ? 'idle' : ''}`} role="dialog" aria-label="Presenting"
      onMouseMove={() => setIdle(false)}
      onClick={(e) => {
        if (e.target.closest('button, .pz-overview')) return;
        if (black) { setBlack(false); return; }
        go(e.clientX > window.innerWidth / 2 ? 1 : -1);
      }}
      onTouchStart={(e) => { touch.current = e.touches[0].clientX; }}
      onTouchEnd={(e) => { const dx = e.changedTouches[0].clientX - (touch.current ?? 0); if (!overview && Math.abs(dx) > 40) go(dx < 0 ? 1 : -1); touch.current = null; }}>
      {slide && (
        <div key={slide.id} className="pz-present-stage" style={{ width: SLIDE_W * scale, height: SLIDE_H * scale }}>
          <div className="pz-scale" style={{ transform: `scale(${scale})` }}>
            <Slide deck={deck} slide={slide} index={deck.slides.indexOf(slide)} total={deck.slides.length} live />
          </div>
        </div>
      )}
      {black && <div className="pz-present-black" aria-label="Black screen" />}
      {overview && (
        <div className="pz-overview" role="listbox" aria-label="All slides">
          {slides.map((s, i) => (
            <button key={s.id} type="button" role="option" aria-selected={i === at} className={`pz-overview-item ${i === at ? 'on' : ''}`}
              onClick={() => { setAt(i); setOverview(false); }}>
              <SlideView deck={deck} slide={s} index={deck.slides.indexOf(s)} total={deck.slides.length} />
              <span className="pz-overview-n">{i + 1}</span>
            </button>
          ))}
        </div>
      )}
      <div className="pz-present-bar">
        <button type="button" onClick={() => go(-1)} disabled={at === 0} aria-label="Previous slide"><ChevronLeft size={20} /></button>
        <span>{at + 1} / {slides.length}</span>
        <button type="button" onClick={() => go(1)} disabled={at >= slides.length - 1} aria-label="Next slide"><ChevronRight size={20} /></button>
        <i className="pz-present-sep" />
        <button type="button" className={overview ? 'on' : ''} onClick={() => setOverview((o) => !o)} aria-label="All slides (G)" title="All slides (G)"><LayoutGrid size={17} /></button>
        <button type="button" className={black ? 'on' : ''} onClick={() => setBlack((b) => !b)} aria-label="Black screen (B)" title="Black screen (B)"><Square size={16} fill="currentColor" /></button>
        <button type="button" onClick={presenterView} aria-label="Presenter view" title="Presenter view — notes, next slide, timer"><NotebookText size={17} /></button>
        {!fs && document.fullscreenEnabled && <button type="button" onClick={fullscreen} aria-label="Fullscreen" title="Fullscreen"><Maximize size={17} /></button>}
        <button type="button" onClick={onClose} aria-label="Stop presenting"><X size={18} /></button>
      </div>
    </div>,
    document.body,
  );
}
