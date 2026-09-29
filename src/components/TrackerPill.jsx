import { useNavigate } from 'react-router-dom';
import { Pause } from 'lucide-react';
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
    <button type="button" className={`track-pill ${compact ? 'compact' : ''} ${t.paused ? 'paused' : ''}`} onClick={() => navigate('/time')}
      data-tip={`${t.paused ? `Paused ${fmtElapsed(t.pauseNow)}` : 'Tracking'} · ${what} · ${fmtElapsed(t.elapsed)}`}
      aria-label={`Time tracker ${t.paused ? 'paused' : 'running'}: ${fmtElapsed(t.elapsed)}`}>
      {t.paused ? <Pause size={11} className="track-pill-paused" fill="currentColor" strokeWidth={0} aria-hidden="true" /> : <span className="track-pill-dot" aria-hidden="true" />}
      <span className="track-pill-time">{fmtElapsed(t.elapsed)}</span>
      {!compact && <span className="track-pill-what">{what}</span>}
    </button>
  );
}
