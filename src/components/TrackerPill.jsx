import { useNavigate } from 'react-router-dom';
import { useTimeTracker, fmtElapsed } from '../lib/timeTracker.js';

/**
 * The time tracker while it runs, anywhere in the app (sidebar, phone top
 * bar): a pulsing dot and the time so far. A click opens the Time Tracker.
 */
export default function TrackerPill({ compact = false, plans }) {
  const t = useTimeTracker();
  const navigate = useNavigate();
  if (!t.running) return null;
  const what = t.running.activity || plans?.find((p) => p.id === t.running.planId)?.name || t.running.project || 'Tracking';
  return (
    <button type="button" className={`track-pill ${compact ? 'compact' : ''}`} onClick={() => navigate('/time')}
      data-tip={`Tracking · ${what} · ${fmtElapsed(t.elapsed)}`} aria-label={`Time tracker running: ${fmtElapsed(t.elapsed)}`}>
      <span className="track-pill-dot" aria-hidden="true" />
      <span className="track-pill-time">{fmtElapsed(t.elapsed)}</span>
      {!compact && <span className="track-pill-what">{what}</span>}
    </button>
  );
}
