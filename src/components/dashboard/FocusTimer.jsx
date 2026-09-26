import { useState } from 'react';
import { Play, Pause, RotateCcw, SkipForward, Timer, Coffee, Plus, X, Check } from 'lucide-react';
import { useFocusTimer, timer, fmtTime, TIMER_MODES, validMinutes } from '../../lib/focusTimer.js';

// "45", "45m", "1:30" (h:mm) or "1h 30" → minutes.
function parseMinutes(v) {
  const s = String(v).trim().toLowerCase();
  let m = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  m = /^(?:(\d{1,2})\s*h)?\s*(?:(\d{1,3})\s*m?(?:in)?)?$/.exec(s);
  if (m && (m[1] || m[2])) return Number(m[1] || 0) * 60 + Number(m[2] || 0);
  return NaN;
}

const R = 54; const C = 2 * Math.PI * R;

/**
 * Focus timer (Pomodoro): 25 / 50 / 90 minutes of focus — or your own
 * lengths (+, or type over the time) — then a short break (a long one after
 * four sessions). Keeps running when you leave the page; finished sessions
 * count as focus minutes in "Your rhythm".
 */
export default function FocusTimer() {
  const t = useFocusTimer();
  const [adding, setAdding] = useState(false);   // the "+" chip is a minutes field
  const [editing, setEditing] = useState(false); // typing over the big time
  const [val, setVal] = useState('');
  const bad = val !== '' && !validMinutes(parseMinutes(val));
  const commit = (keep) => {
    const m = parseMinutes(val);
    if (!validMinutes(m)) return;
    if (keep) timer.addCustom(m); else timer.setMinutes(m);
    setAdding(false); setEditing(false); setVal('');
  };
  const field = (keep, label) => (
    <input autoFocus className={`dash-timer-field ${bad ? 'bad' : ''}`} value={val} inputMode="numeric" aria-label={label} placeholder="min"
      onChange={(e) => setVal(e.target.value)} onBlur={() => { if (val) commit(keep); else { setAdding(false); setEditing(false); } }}
      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commit(keep); } if (e.key === 'Escape') { setAdding(false); setEditing(false); setVal(''); } }} />
  );
  const total = t.minutes * 60;
  const p = total ? 1 - t.seconds / total : 0;
  const running = !!t.endsAt;
  const mode = TIMER_MODES[t.mode];
  return (
    <section className={`dash-timer ${t.mode} ${running ? 'running' : ''}`}>
      <div className="dash-card-kicker">
        {t.mode === 'focus' ? <Timer size={14} /> : <Coffee size={14} />} Focus timer
        <span className="dash-timer-sessions" title={`${t.sessions} focus session${t.sessions === 1 ? '' : 's'} today`}>
          {Array.from({ length: Math.max(4, Math.ceil(t.sessions / 4) * 4) }, (_, i) => <i key={i} className={i < t.sessions ? 'on' : ''} />)}
        </span>
      </div>
      <div className="dash-timer-body">
        <div className="dash-timer-dial" role="timer" aria-live="off" aria-label={`${mode.label}: ${fmtTime(t.seconds)} left`}>
          <svg viewBox="0 0 128 128" aria-hidden="true">
            <circle cx="64" cy="64" r={R} className="dash-timer-track" />
            <circle cx="64" cy="64" r={R} className="dash-timer-prog" style={{ strokeDasharray: C, strokeDashoffset: C * (1 - p) }} />
          </svg>
          <div className="dash-timer-read">
            {editing ? <span className="dash-timer-edit">{field(false, 'Minutes for this session')}<small>minutes · Enter</small></span> : (
              <button type="button" className="dash-timer-time" onClick={() => { if (!running) { setVal(String(t.minutes)); setEditing(true); } }}
                disabled={running} title={running ? undefined : 'Type your own length'} aria-label={running ? fmtTime(t.seconds) : `${fmtTime(t.seconds)} — type your own length`}>
                {fmtTime(t.seconds)}
              </button>
            )}
            <span>{t.done ? (t.mode === 'focus' ? 'Break over' : 'Done — take a break') : running ? mode.label : t.seconds < total ? 'Paused' : mode.label}</span>
          </div>
        </div>
        <div className="dash-timer-side">
          <div className="segmented segmented-sm dash-timer-modes" role="group" aria-label="Mode">
            {Object.entries(TIMER_MODES).map(([k, m]) => (
              <button key={k} type="button" className={t.mode === k ? 'on' : ''} onClick={() => timer.setMode(k)}>{m.label}</button>
            ))}
          </div>
          <div className="dash-timer-lengths" role="group" aria-label="Length">
            {mode.minutes.map((m) => (
              <button key={m} type="button" className={t.minutes === m ? 'on' : ''} onClick={() => timer.setMinutes(m)} disabled={running}>{m} min</button>
            ))}
            {(t.customs?.[t.mode] || []).map((m) => (
              <span key={`c${m}`} className={`dash-timer-own ${t.minutes === m ? 'on' : ''}`}>
                <button type="button" onClick={() => timer.setMinutes(m)} disabled={running}>{m} min</button>
                <button type="button" className="dash-timer-own-x" onClick={() => timer.removeCustom(m)} aria-label={`Remove ${m} min`} title="Remove"><X size={11} /></button>
              </span>
            ))}
            {adding ? (
              <span className="dash-timer-add on">{field(true, 'Your own length in minutes')}<button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => commit(true)} aria-label="Add"><Check size={13} /></button></span>
            ) : (
              <button type="button" className="dash-timer-add" onClick={() => { setVal(''); setAdding(true); }} disabled={running || (t.customs?.[t.mode] || []).length >= 4}
                aria-label="Your own length" title="Your own length (minutes, or h:mm)"><Plus size={13} /></button>
            )}
          </div>
          <div className="dash-timer-actions">
            {running
              ? <button type="button" className="btn btn-sm dash-timer-main" onClick={timer.pause}><Pause size={15} /> Pause</button>
              : <button type="button" className="btn btn-sm btn-primary dash-timer-main" onClick={timer.start}><Play size={15} /> {t.seconds < total && !t.done ? 'Resume' : 'Start'}</button>}
            <button type="button" className="icon-btn" onClick={timer.reset} aria-label="Start over" title="Start over"><RotateCcw size={15} /></button>
            <button type="button" className="icon-btn" onClick={timer.skip} aria-label={t.mode === 'focus' ? 'Skip to the break' : 'Skip the break'} title={t.mode === 'focus' ? 'Skip to the break' : 'Skip the break'}><SkipForward size={15} /></button>
          </div>
        </div>
      </div>
    </section>
  );
}
