import { useRef, useState } from 'react';
import { ChevronDown, GripVertical, Plus, X, Wand2, Check } from 'lucide-react';
import AutoTextarea from '../AutoTextarea.jsx';
import { BEAT_KINDS, fmtSec, fmtSpan, lengthNote, checklistFor } from '../../lib/content.js';

/** A part of the post editor that folds away — open for the stage the post is in. */
export function Section({ icon: Icon, title, summary, open, now, onToggle, children, className = '' }) {
  return (
    <section className={`ct-sec ${open ? 'open' : ''} ${now ? 'now' : ''} ${className}`}>
      <button type="button" className="ct-sec-head" onClick={onToggle} aria-expanded={open}>
        <Icon size={15} className="ct-sec-icon" /> <b>{title}</b>
        {now && <span className="ct-sec-now">Now</span>}
        {!open && summary ? <span className="ct-sec-sum">{summary}</span> : <span className="ct-sec-gap" />}
        <ChevronDown size={16} className="ct-sec-chev" />
      </button>
      {open && <div className="ct-sec-body">{children}</div>}
    </section>
  );
}

const newId = () => `b${Math.random().toString(36).slice(2, 10)}`;
const STARTER = [
  { kind: 'hook', sec: 2, text: '', screen: '' },
  { kind: 'body', sec: 8, text: '', screen: '' },
  { kind: 'cta', sec: 3, text: '', screen: '' },
];
const PLACEHOLDER = {
  hook: 'What stops the scroll — the first frame, the first words',
  body: 'What happens — what you show, what you say',
  cta: 'What they should do: follow, save, comment …',
};

/**
 * The beats of a Reel / Short (or the slides of a carousel): Hook → Body → CTA,
 * each with what happens, the text on screen and how long it runs — adding up
 * to the length, with a note on how that length tends to do.
 */
export function Beats({ beats, timed, onChange, onRemoved, ctaPicker }) {
  const [moving, setMoving] = useState(null);
  const fresh = useRef(null);
  const total = beats.reduce((n, b) => n + (b.sec || 0), 0);
  const set = (id, f, typing = false) => onChange(beats.map((b) => (b.id === id ? { ...b, ...f } : b)), typing);
  const add = (kind = 'body') => {
    const b = { id: newId(), kind, text: '', screen: '', sec: timed ? (kind === 'hook' ? 2 : kind === 'cta' ? 3 : 5) : 0 };
    fresh.current = b.id;
    const at = kind === 'body' && beats.length && beats[beats.length - 1].kind === 'cta' ? beats.length - 1 : beats.length;
    onChange([...beats.slice(0, at), b, ...beats.slice(at)]);
  };
  const remove = (b) => {
    const before = beats;
    onChange(beats.filter((x) => x.id !== b.id));
    if (b.text.trim() || b.screen.trim()) onRemoved?.(before);
  };
  const dropOn = (targetId) => {
    if (!moving || moving === targetId) return;
    const ids = beats.map((b) => b.id).filter((x) => x !== moving);
    ids.splice(ids.indexOf(targetId), 0, moving);
    const byId = Object.fromEntries(beats.map((b) => [b.id, b]));
    onChange(ids.map((i) => byId[i]));
    setMoving(null);
  };

  if (!beats.length) {
    return (
      <div className="ct-beats-empty">
        <button type="button" className="btn btn-sm" onClick={() => onChange(STARTER.map((b) => ({ ...b, id: newId(), sec: timed ? b.sec : 0 })))}>
          <Wand2 size={14} /> Start with Hook → Body → CTA
        </button>
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => add('hook')}><Plus size={14} /> One {timed ? 'beat' : 'slide'}</button>
      </div>
    );
  }

  let t = 0;
  return (
    <div className="ct-beats">
      {timed && total > 0 && (
        <div className="ct-beatbar" aria-hidden="true">
          {beats.map((b) => <i key={b.id} style={{ flexGrow: Math.max(b.sec, 0.3), background: BEAT_KINDS[b.kind].color }} />)}
        </div>
      )}
      {beats.map((b, i) => {
        const k = BEAT_KINDS[b.kind];
        const from = t; t += b.sec || 0;
        return (
          <div key={b.id} className={`ct-beat ${moving === b.id ? 'moving' : ''}`} style={{ '--bk': k.color }}
            onDragOver={(e) => { if (moving) e.preventDefault(); }} onDrop={(e) => { e.preventDefault(); dropOn(b.id); }}>
            <span className="ct-beat-grip" draggable onDragStart={(e) => { setMoving(b.id); e.dataTransfer.effectAllowed = 'move'; }} onDragEnd={() => setMoving(null)}
              title="Drag to move" aria-hidden="true"><GripVertical size={14} /></span>
            <div className="ct-beat-side">
              <select className="ct-beat-kind" value={b.kind} onChange={(e) => set(b.id, { kind: e.target.value })} aria-label="Part" title={k.hint}>
                {Object.entries(BEAT_KINDS).map(([key, x]) => <option key={key} value={key}>{x.label}</option>)}
              </select>
              <span className="ct-beat-time">{timed ? fmtSpan(from, t) : `Slide ${i + 1}`}</span>
            </div>
            <div className="ct-beat-main">
              <AutoTextarea className="input" value={b.text} placeholder={PLACEHOLDER[b.kind]} maxLength={2000} autoFocus={fresh.current === b.id}
                onChange={(e) => set(b.id, { text: e.target.value }, true)} aria-label={`${k.label}: what happens`} />
              <span className="ct-beat-screen-row">
                <input className="input ct-beat-screen" value={b.screen} placeholder="Text on screen" maxLength={500}
                  onChange={(e) => set(b.id, { screen: e.target.value }, true)} aria-label={`${k.label}: text on screen`} />
                {b.kind === 'cta' && ctaPicker?.(b)}
              </span>
            </div>
            {timed && (
              <label className="ct-beat-sec" title="Seconds">
                <input className="input" type="number" min="0" max="600" step="0.5" value={b.sec || ''} placeholder="0"
                  onChange={(e) => set(b.id, { sec: Math.max(0, Math.min(600, Number(e.target.value) || 0)) }, true)} aria-label={`${k.label}: seconds`} />
                <span>s</span>
              </label>
            )}
            <button type="button" className="icon-btn ct-beat-x" onClick={() => remove(b)} aria-label="Remove" title="Remove"><X size={14} /></button>
          </div>
        );
      })}
      <div className="ct-beats-foot">
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => add('body')}><Plus size={14} /> {timed ? 'Beat' : 'Slide'}</button>
        {!beats.some((b) => b.kind === 'cta') && <button type="button" className="btn btn-sm btn-ghost" onClick={() => add('cta')}><Plus size={14} /> CTA</button>}
        {timed && total > 0 && <span className="ct-beats-total"><b>{fmtSec(total)}</b> · {lengthNote(total)}</span>}
        {!timed && <span className="ct-beats-total"><b>{beats.length}</b> slide{beats.length === 1 ? '' : 's'}{beats.length > 20 ? ' · Instagram allows 20' : ''}</span>}
      </div>
    </div>
  );
}

/** Production: the steps for this format, ticked off. */
export function Checklist({ format, checks, onChange }) {
  const list = checklistFor(format);
  const done = list.filter((x) => checks.includes(x.key)).length;
  const toggle = (key) => onChange(checks.includes(key) ? checks.filter((k) => k !== key) : [...checks, key]);
  return (
    <div className="ct-checks">
      <div className="ct-checks-top">
        <span className="ct-checks-bar"><i style={{ width: `${(done / list.length) * 100}%` }} /></span>
        <span className="ct-checks-n">{done === list.length ? <><Check size={13} /> ready</> : `${done} / ${list.length}`}</span>
      </div>
      <div className="ct-checks-list">
        {list.map((x) => (
          <label key={x.key} className={`ct-check ${checks.includes(x.key) ? 'done' : ''}`}>
            <input type="checkbox" checked={checks.includes(x.key)} onChange={() => toggle(x.key)} />
            <span>{x.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
