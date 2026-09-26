import { Play, Pause, RotateCcw, SkipForward, Timer, Coffee } from 'lucide-react';
import { useFocusTimer, timer, fmtTime, TIMER_MODES } from '../../lib/focusTimer.js';

const R = 54; const C = 2 * Math.PI * R;

/**
 * Focus timer (Pomodoro): 25 / 50 / 90 minutes of focus, then a short break
 * (a long one after four sessions). Keeps running when you leave the page;
 * finished sessions count as focus minutes in "Your rhythm".
 */
export default function FocusTimer() {
  const t = useFocusTimer();
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
            <b>{fmtTime(t.seconds)}</b>
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
