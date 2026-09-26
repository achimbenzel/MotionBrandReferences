import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock, Play, Square } from 'lucide-react';
import { api } from '../../lib/api.js';
import { useTimeTracker, tracker, fmtElapsed } from '../../lib/timeTracker.js';

const minutesOf = (e) => { const t = (x) => { const [h, m] = x.split(':').map(Number); return h * 60 + m; }; return (t(e.end) - t(e.start) + 1440) % 1440; };

/**
 * A plan's tracked time in its header — a click shows its entries in the
 * Time Tracker — and a button to start (or stop) tracking this plan.
 */
export default function PlanTime({ plan, toast }) {
  const navigate = useNavigate();
  const t = useTimeTracker();
  const [min, setMin] = useState(null);
  const mine = t.running && t.running.planId === plan.id;
  useEffect(() => {
    let alive = true;
    api.getTime(plan.id).then((d) => { if (alive) setMin(d.entries.reduce((n, e) => n + minutesOf(e), 0)); }).catch(() => {});
    return () => { alive = false; };
  }, [plan.id, t.running?.startedAt]); // again once a tracker stops
  const toggle = async () => {
    try {
      if (mine) { const e = await tracker.stop(); toast(e ? 'Time saved' : 'Under a minute — nothing saved'); return; }
      if (t.running) await tracker.stop(); // one at a time: the other one is saved first
      await tracker.start({ planId: plan.id });
      toast(`Tracking “${plan.name}”`);
    } catch (e) { toast(e.message, 'error'); }
  };
  const total = (min || 0) + (mine ? Math.floor(t.elapsed / 60000) : 0);
  return (
    <span className={`plan-time ${mine ? 'running' : ''}`}>
      <button type="button" onClick={() => navigate(`/time?plan=${plan.id}`)} title="Tracked time — show the entries">
        <Clock size={13} /> {mine ? <span className="mono">{fmtElapsed(t.elapsed)}</span> : `${(total / 60).toFixed(1)} h`}
      </button>
      <button type="button" className="plan-time-go" onClick={toggle} title={mine ? 'Stop tracking' : 'Track time on this plan'} aria-label={mine ? 'Stop tracking' : 'Track time on this plan'}>
        {mine ? <Square size={11} fill="currentColor" /> : <Play size={11} fill="currentColor" />}
      </button>
    </span>
  );
}
