import { CalendarRange, ChevronDown } from 'lucide-react';

// Days from today to a yyyy-mm-dd date (negative = past), in local time.
function daysFromToday(iso) {
  const [y, m, d] = String(iso || '').split('-').map(Number);
  if (!y || !m || !d) return NaN;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return Math.round((new Date(y, m - 1, d) - today) / 86400000);
}
const fmt = (iso) => {
  const [y, m, d] = String(iso || '').split('-').map(Number);
  return y && m && d ? new Date(y, m - 1, d).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : '';
};
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
