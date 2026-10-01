import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, RotateCcw, Pause, Play, Square, Minus, Plus } from 'lucide-react';
import { api } from '../lib/api.js';
import { SlideView } from '../components/presentations/Slide.jsx';
import { presentChannel, presentKey } from '../lib/presentSync.js';
import { getPref, setPref } from '../lib/prefs.js';
import { fmtTime, setFormats } from '../lib/format.js';
import '@fontsource/dm-sans/600.css';
import '@fontsource/dm-sans/800.css';
import '@fontsource/dm-sans/400-italic.css';
import '@fontsource/jetbrains-mono/600.css';
import '../styles/presentation.css';

const clock = (sec) => {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60); const r = s % 60;
  return `${h ? `${h}:` : ''}${String(m).padStart(h ? 2 : 1, '0')}:${String(r).padStart(2, '0')}`;
};

/**
 * The presenter view — a window of its own beside the slides: the slide being
 * shown, the next one, its speaker notes, a timer and the time. Its arrows (and
 * a clicker's) move the slides in the other window; moves there show here.
 */
export default function PresenterView() {
  const { id } = useParams();
  const [deck, setDeck] = useState(null);
  const [error, setError] = useState(null);
  const [at, setAt] = useState(0);
  const [black, setBlack] = useState(false);
  const [linked, setLinked] = useState(false); // a slides window answers
  const [ended, setEnded] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(true);
  const [now, setNow] = useState(() => new Date());
  const [textSize, setTextSize] = useState(() => Number(getPref('presenterNotesSize')) || 22);
  const channel = useRef(null);
  const state = useRef({});

  useEffect(() => { api.getPresentation(id).then(setDeck).catch((e) => setError(e.message)); }, [id]);
  useEffect(() => { api.getSettings().then((st) => setFormats(st?.formats)).catch(() => {}); }, []); // the time in your format
  const slides = (deck?.slides || []).filter((s) => !s.hidden);
  state.current = { at, total: slides.length, black };

  useEffect(() => {
    channel.current = presentChannel(id, (m) => {
      if (m.type === 'at') { setLinked(true); setEnded(false); if (Number.isInteger(m.at)) setAt(m.at); setBlack(!!m.black); }
      if (m.type === 'end') { setLinked(false); setEnded(true); }
    });
    channel.current.post({ type: 'hello' });
    return () => channel.current?.close();
  }, [id]);
  useEffect(() => { if (deck) document.title = `Presenter view · ${deck.title || 'Presentation'}`; }, [deck]);
  // The timer counts while running; the clock shows the time of day.
  useEffect(() => {
    const t = setInterval(() => { setNow(new Date()); if (running) setElapsed((e) => e + 1); }, 1000);
    return () => clearInterval(t);
  }, [running]);

  const show = (i) => {
    const next = Math.max(0, Math.min(state.current.total - 1, i));
    setAt(next);
    channel.current?.post({ type: 'go', at: next });
  };
  const toggleBlack = () => { const on = !state.current.black; setBlack(on); channel.current?.post({ type: 'black', on }); };
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.closest?.('input, textarea')) return;
      const k = presentKey(e);
      if (!k || k === 'overview' || k === 'escape') return;
      e.preventDefault();
      if (k === 'next') show(state.current.at + 1);
      else if (k === 'prev') show(state.current.at - 1);
      else if (k === 'first') show(0);
      else if (k === 'last') show(state.current.total - 1);
      else if (k === 'black') toggleBlack();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const sizeBy = (d) => setTextSize((s) => { const v = Math.max(14, Math.min(40, s + d)); setPref('presenterNotesSize', String(v)); return v; });

  if (error) return <div className="pzv-msg">Couldn’t load the presentation: {error}</div>;
  if (!deck) return <div className="spinner" />;
  const slide = slides[at];
  const next = slides[at + 1];
  const notes = slide?.notes?.trim();
  return (
    <div className="pzv">
      <header className="pzv-head">
        <b>{deck.title || 'Untitled presentation'}</b>
        <span className={`pzv-link ${linked ? 'on' : ''}`}>{linked ? 'Slides window follows' : ended ? 'Presenting stopped' : 'No slides window — ▶ Present in the editor'}</span>
        <span className="pzv-clock pz-mono" aria-label="Time of day">{fmtTime(now)}</span>
      </header>
      <main className="pzv-main">
        <section className="pzv-now">
          <div className={`pzv-current ${black ? 'black' : ''}`}>{slide && <SlideView deck={deck} slide={slide} index={deck.slides.indexOf(slide)} total={deck.slides.length} />}</div>
          <div className="pzv-nav">
            <button type="button" className="btn" onClick={() => show(at - 1)} disabled={at === 0} aria-label="Previous slide"><ChevronLeft size={18} /> Back</button>
            <span className="pzv-count pz-mono">{slides.length ? at + 1 : 0} / {slides.length}</span>
            <button type="button" className="btn btn-primary" onClick={() => show(at + 1)} disabled={at >= slides.length - 1} aria-label="Next slide">Next <ChevronRight size={18} /></button>
            <button type="button" className={`btn ${black ? 'on' : ''}`} onClick={toggleBlack} aria-pressed={black} title="Black screen (B)"><Square size={14} fill="currentColor" /> Black</button>
          </div>
        </section>
        <aside className="pzv-side">
          <div className="pzv-timer">
            <span className="pz-mono" aria-label="Time presenting">{clock(elapsed)}</span>
            <button type="button" className="icon-btn" onClick={() => setRunning((r) => !r)} aria-label={running ? 'Pause the timer' : 'Go on with the timer'}>{running ? <Pause size={16} /> : <Play size={16} />}</button>
            <button type="button" className="icon-btn" onClick={() => setElapsed(0)} aria-label="Timer from zero"><RotateCcw size={16} /></button>
          </div>
          <div className="pzv-next">
            <span className="pzv-h">Next</span>
            {next ? <SlideView deck={deck} slide={next} index={deck.slides.indexOf(next)} total={deck.slides.length} /> : <div className="pzv-end">End of the presentation</div>}
          </div>
          <div className="pzv-notes">
            <div className="pzv-notes-head">
              <span className="pzv-h">Notes</span>
              <button type="button" className="icon-btn" onClick={() => sizeBy(-2)} aria-label="Smaller text"><Minus size={14} /></button>
              <button type="button" className="icon-btn" onClick={() => sizeBy(2)} aria-label="Larger text"><Plus size={14} /></button>
            </div>
            <div className="pzv-notes-text" style={{ fontSize: textSize }}>{notes || <em>No notes for this slide — add them under Speaker notes in the editor.</em>}</div>
          </div>
        </aside>
      </main>
    </div>
  );
}
