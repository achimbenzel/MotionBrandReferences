import { CalendarRange, ChevronDown, Check, X, Plus } from 'lucide-react';
import { daysFromToday, fmtDay } from '../../lib/dates.js';

const fmt = (iso) => fmtDay(iso, { day: 'numeric', month: 'short' });
const inDays = (n) => (n === 0 ? 'today' : n === 1 ? 'tomorrow' : n === -1 ? 'yesterday' : n > 1 ? `in ${n} days` : `${-n} days ago`);

/** "6 Sep – 9 Sep · 2/5 milestones · next: Styleframes in 3 days" — or what to add. */
export function whenSummary(plan, milestones) {
  const parts = [];
  if (plan.start || plan.end) parts.push([fmt(plan.start), fmt(plan.end)].filter(Boolean).join(' – '));
  const ms = (milestones || []).filter((m) => m.title || m.date);
  if (ms.length) {
    parts.push(`${ms.filter((m) => m.done).length}/${ms.length} milestones`);
    const next = ms.filter((m) => !m.done).sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999'))[0];
    if (next) {
      const n = daysFromToday(next.date);
      parts.push(`next: ${next.title || 'Milestone'}${Number.isFinite(n) ? ` ${inDays(n)}` : ''}`);
    }
  }
  return parts;
}

/** The timeframe and milestones in one line of the plan's header; a click opens them. */
export default function PlanWhen({ plan, milestones, open, onToggle }) {
  const parts = whenSummary(plan, milestones);
  const late = (milestones || []).some((m) => !m.done && daysFromToday(m.date) < 0);
  return (
    <button type="button" className={`plan-when ${open ? 'on' : ''} ${parts.length ? '' : 'none'} ${late ? 'late' : ''}`} onClick={onToggle} aria-expanded={open}>
      <CalendarRange size={15} />
      <span>{parts.length ? parts.join(' · ') : 'Add dates & milestones'}</span>
      <ChevronDown size={13} className="plan-when-chev" />
    </button>
  );
}

/** The details under the header: start / end and the milestones. */
export function PlanWhenPanel({ plan, milestones, onPatch, onAdd, onEdit, onRemove }) {
  return (
    <div className="plan-when-panel">
      <div className="row-2">
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Start</label>
          <input type="date" className="input" value={plan.start || ''} onChange={(e) => onPatch({ start: e.target.value })} />
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>End</label>
          <input type="date" className="input" value={plan.end || ''} onChange={(e) => onPatch({ end: e.target.value })} />
        </div>
      </div>
      <div className="milestones">
        {milestones.map((m) => (
          <div className={`milestone ${m.done ? 'done' : ''}`} key={m.id}>
            <button className={`ms-check ${m.done ? 'on' : ''}`} onClick={() => onEdit(m.id, { done: !m.done })} title="Toggle done">{m.done && <Check size={13} />}</button>
            <input className="ms-title input" value={m.title} placeholder="Milestone…" onChange={(e) => onEdit(m.id, { title: e.target.value })} />
            <input className="ms-date input" type="date" value={m.date || ''} onChange={(e) => onEdit(m.id, { date: e.target.value })} />
            <button className="ms-del icon-btn" onClick={() => onRemove(m.id)}><X size={14} /></button>
          </div>
        ))}
        <button className="btn btn-ghost btn-sm ms-add" onClick={onAdd}><Plus size={15} /> Add milestone</button>
      </div>
    </div>
  );
}
