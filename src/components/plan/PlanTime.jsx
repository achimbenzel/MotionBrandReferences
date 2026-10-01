import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock, Play, Square, Gauge } from 'lucide-react';
import { api } from '../../lib/api.js';
import { useTimeTracker, tracker, fmtElapsed } from '../../lib/timeTracker.js';
import { minutesOf, budgetMinutes, budgetState, budgetText, amountOf, fmtMoney, useCurrency } from '../../lib/clients.js';
import Popover from '../Popover.jsx';
import { fmtDec, parseNum, currencySign, fmtInput } from '../../lib/format.js';

/**
 * A project's tracked time in its header — a click shows its entries in the
 * Time Tracker —, a button to start (or stop) tracking it, and its budget /
 * hourly rate: "12.5 / 20 h" (amber from 80 %, red over it) or "12.5 h · 1,000 €".
 */
export default function PlanTime({ plan, toast, onChange }) {
  const navigate = useNavigate();
  const t = useTimeTracker();
  const currency = useCurrency();
  const [entries, setEntries] = useState(null);
  const [editing, setEditing] = useState(false);
  const moneyRef = useRef(null);
  const mine = t.running && t.running.planId === plan.id;
  useEffect(() => {
    let alive = true;
    api.getTime({ plan: plan.id }).then((d) => { if (alive) setEntries(d.entries); }).catch(() => {});
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
  const liveMin = mine ? Math.floor(t.elapsed / 60000) : 0;
  const total = (entries || []).reduce((n, e) => n + minutesOf(e), 0) + liveMin;
  const used = budgetMinutes(plan, entries || [], liveMin);
  const budget = budgetState(plan, used);
  const amount = amountOf(total, plan.rate);
  const label = budget ? budgetText(plan, used) : `${fmtDec(total / 60, 1)} h${amount ? ` · ${fmtMoney(amount, currency)}` : ''}`;

  return (
    <span className={`plan-time ${mine ? 'running' : ''} ${mine && t.paused ? 'paused' : ''} ${budget ? `budget-${budget.level}` : ''}`}>
      <button type="button" onClick={() => navigate(`/time?plan=${plan.id}`)} title="Tracked time — show the entries">
        <Clock size={13} /> {mine ? <span className="mono">{fmtElapsed(t.elapsed)}</span> : label}
        {budget && <span className="plan-time-bar" aria-hidden="true"><span style={{ width: `${Math.min(100, budget.ratio * 100)}%` }} /></span>}
      </button>
      <button type="button" ref={moneyRef} className="plan-time-set" onClick={() => setEditing((v) => !v)}
        title="Budget & hourly rate" aria-label="Budget & hourly rate"><Gauge size={13} /></button>
      <button type="button" className="plan-time-go" onClick={toggle} title={mine ? 'Stop tracking' : 'Track time on this project'} aria-label={mine ? 'Stop tracking' : 'Track time on this project'}>
        {mine ? <Square size={11} fill="currentColor" /> : <Play size={11} fill="currentColor" />}
      </button>
      {editing && (
        <Popover anchor={moneyRef} onClose={() => setEditing(false)} width={290} label="Budget & hourly rate">
          <BudgetForm plan={plan} currency={currency} used={used} total={total} onChange={onChange} />
        </Popover>
      )}
    </span>
  );
}

/** Budget (hours, for the project or per month) and hourly rate — both optional, saved as you type. */
function BudgetForm({ plan, currency, used, total, onChange }) {
  const [hours, setHours] = useState(plan.budget ? fmtInput(plan.budget.hours) : '');
  const [per, setPer] = useState(plan.budget?.per || 'project');
  const [rate, setRate] = useState(plan.rate ? fmtInput(plan.rate) : '');
  const num = (v) => { const n = parseNum(v); return Number.isFinite(n) && n > 0 ? n : null; };
  const save = (h, p, r) => onChange({ budget: num(h) ? { hours: num(h), per: p } : null, rate: num(r) });
  const symbol = currencySign(currency);
  return (
    <div className="budget-form">
      <label className="budget-f">
        <span>Budget</span>
        <span className="budget-in"><input className="input" inputMode="decimal" value={hours} placeholder="—" onChange={(e) => { setHours(e.target.value); save(e.target.value, per, rate); }} aria-label="Budget in hours" /><i>h</i></span>
      </label>
      <div className="segmented segmented-sm budget-per" role="group" aria-label="Budget for">
        {[['project', 'For the project'], ['month', 'Per month']].map(([k, l]) => (
          <button key={k} type="button" className={per === k ? 'on' : ''} onClick={() => { setPer(k); save(hours, k, rate); }}>{l}</button>
        ))}
      </div>
      <label className="budget-f">
        <span>Hourly rate</span>
        <span className="budget-in"><input className="input" inputMode="decimal" value={rate} placeholder="—" onChange={(e) => { setRate(e.target.value); save(hours, per, e.target.value); }} aria-label="Hourly rate" /><i>{symbol}/h</i></span>
      </label>
      <p className="budget-note">
        {num(hours) ? `${fmtDec(used / 60, 1)} of ${fmtDec(num(hours), 2)} h used${per === 'month' ? ' this month' : ''}. ` : 'No budget — '}
        {num(rate) ? `${fmtDec(total / 60, 1)} h × ${fmtMoney(num(rate), currency)} = ${fmtMoney(amountOf(total, num(rate)), currency)}.` : 'no hourly rate. Both are optional.'}
      </p>
    </div>
  );
}
