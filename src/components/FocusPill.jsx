import { useNavigate } from 'react-router-dom';
import { Timer, Coffee } from 'lucide-react';
import { useFocusTimer, fmtTime } from '../lib/focusTimer.js';

/**
 * The focus timer while it runs (or is paused mid-session), anywhere in the
 * app: in the sidebar and the phone's top bar. A click opens the dashboard.
 */
export default function FocusPill({ compact = false }) {
  const t = useFocusTimer();
  const navigate = useNavigate();
  const mid = !t.endsAt && t.seconds < t.minutes * 60 && !t.done;
  if (!t.endsAt && !mid) return null;
  const Icon = t.mode === 'focus' ? Timer : Coffee;
  const p = 1 - t.seconds / (t.minutes * 60);
  return (
    <button type="button" className={`focus-pill ${t.mode} ${t.endsAt ? 'running' : 'paused'} ${compact ? 'compact' : ''}`} onClick={() => navigate('/work')}
      data-tip={`${t.mode === 'focus' ? 'Focus' : 'Break'} · ${fmtTime(t.seconds)}${t.endsAt ? '' : ' (paused)'}`} aria-label={`Focus timer: ${fmtTime(t.seconds)} left`}>
      <span className="focus-pill-ring" style={{ '--p': p }}><Icon size={12} /></span>
      <span className="focus-pill-time">{fmtTime(t.seconds)}</span>
    </button>
  );
}
