import { useEffect, useMemo, useState } from 'react';
import { Activity, Flame, CalendarDays, TrendingUp } from 'lucide-react';
import { api } from '../../lib/api.js';
import { useMediaQuery, PHONE } from '../../lib/useMedia.js';

const WD = ['Mon', '', 'Wed', '', 'Fri', '', ''];
const WEEKDAYS = ['Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays', 'Sundays'];
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const dateOf = (iso) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); };
// One number per day: everything saved plus what was added.
const added = (d) => d.refs + d.plans + d.mockups + d.inbox;
const total = (d) => d.saves + added(d);
function breakdown(d) {
  return [
    d.refs && plural(d.refs, 'reference'), d.plans && plural(d.plans, 'plan'), d.mockups && plural(d.mockups, 'mockup'),
    d.inbox && `${d.inbox} into the Inbox`, d.saves && plural(d.saves, 'save'),
  ].filter(Boolean).join(' · ') || 'Nothing that day';
}

/**
 * Your rhythm, GitHub-style: a square per day for the last half year (a
 * quarter on phones), darker → brighter the more you did — saves, and
 * references, plans, mockups and Inbox shares added. Hover a day for its
 * numbers; streak, this week and your busiest weekday on the side.
 */
export default function ActivityMap({ reloadKey }) {
  const phone = useMediaQuery(PHONE);
  const weeks = phone ? 15 : 26;
  const [days, setDays] = useState(null);
  const [tip, setTip] = useState(null);

  useEffect(() => {
    let alive = true;
    api.getActivity(weeks * 7 + 7).then((d) => { if (alive) setDays(d); }).catch(() => { if (alive) setDays([]); });
    return () => { alive = false; };
  }, [weeks, reloadKey]);

  const model = useMemo(() => {
    if (!days) return null;
    // Columns are weeks (Mon → Sun); the last one is this week, days after today stay empty.
    const today = dateOf(days[days.length - 1].date);
    const dow = (today.getDay() + 6) % 7; // 0 = Monday
    const cells = [];
    const start = days.length - 1 - dow - (weeks - 1) * 7;
    for (let i = 0; i < weeks * 7; i += 1) {
      const d = days[start + i];
      cells.push(i > (weeks - 1) * 7 + dow ? { future: true, key: `f${i}` } : d ? { ...d, key: d.date, v: total(d) } : { key: `x${i}`, v: 0, empty: true });
    }
    // Levels from the quartiles of the busy days, so the map reads at any volume.
    const vals = cells.filter((c) => c.v > 0).map((c) => c.v).sort((a, b) => a - b);
    const q = (p) => vals[Math.min(vals.length - 1, Math.floor(p * vals.length))] || 0;
    const cuts = [q(0.25), q(0.5), q(0.75)];
    const level = (v) => (!v ? 0 : v <= cuts[0] ? 1 : v <= cuts[1] ? 2 : v <= cuts[2] ? 3 : 4);
    for (const c of cells) if (!c.future && !c.empty) c.level = level(c.v);
    // Stats: streak up to today (or yesterday), this week, busiest weekday, the whole period.
    let streak = 0;
    for (let i = days.length - 1; i >= 0; i -= 1) {
      if (total(days[i]) > 0) streak += 1;
      else if (i === days.length - 1) continue; // today may still be empty
      else break;
    }
    const week = days.slice(days.length - 1 - dow).reduce((n, d) => n + total(d), 0);
    const byDay = [0, 0, 0, 0, 0, 0, 0];
    for (const d of days) byDay[(dateOf(d.date).getDay() + 6) % 7] += total(d);
    const best = byDay.indexOf(Math.max(...byDay));
    const shown = cells.filter((c) => !c.future && !c.empty);
    const sum = shown.reduce((n, c) => n + c.v, 0);
    const active = shown.filter((c) => c.v > 0).length;
    const addedSum = shown.reduce((n, c) => n + added(c), 0);
    // Month labels above the first week of each month.
    const months = [];
    for (let w = 0; w < weeks; w += 1) {
      const c = cells[w * 7];
      if (!c || c.future || c.empty) continue;
      const dt = dateOf(c.date);
      if (w === 0 || dt.getDate() <= 7) months.push({ w, label: dt.toLocaleDateString(undefined, { month: 'short' }) });
    }
    return { cells, streak, week, best: Math.max(...byDay) > 0 ? WEEKDAYS[best] : '—', sum, active, addedSum, months };
  }, [days, weeks]);

  // The tooltip sits where the day was — it goes when the page scrolls.
  useEffect(() => {
    if (!tip) return undefined;
    const off = () => setTip(null);
    window.addEventListener('scroll', off, { passive: true, once: true });
    return () => window.removeEventListener('scroll', off);
  }, [tip]);
  const onCell = (e, c) => {
    if (!c || c.future || c.empty) { setTip(null); return; }
    const r = e.currentTarget.getBoundingClientRect();
    setTip({ c, x: r.left + r.width / 2, y: r.top });
  };

  return (
    <section className="dash-act">
      <div className="dash-act-main">
        <div className="dash-card-kicker"><Activity size={14} /> Your rhythm <span className="dash-act-range">· last {weeks} weeks</span></div>
        {!model ? <div className="dash-act-skeleton" /> : (
          <div className="dash-act-plot">
            <div className="dash-act-months" style={{ '--weeks': weeks }}>
              {model.months.map((m) => <span key={`${m.w}${m.label}`} style={{ gridColumn: m.w + 1 }}>{m.label}</span>)}
            </div>
            <div className="dash-act-body">
              <div className="dash-act-wd" aria-hidden="true">{WD.map((w, i) => <span key={i}>{w}</span>)}</div>
              <div className="dash-act-grid" style={{ '--weeks': weeks }} role="img" onPointerLeave={() => setTip(null)}
                aria-label={`${plural(model.active, 'active day')} in the last ${weeks} weeks — ${plural(model.sum, 'thing')} saved or added`}>
                {model.cells.map((c, i) => (
                  <span key={c.key} className={`dash-act-cell l${c.level || 0} ${c.future ? 'future' : ''} ${tip?.c === c ? 'on' : ''}`}
                    style={{ '--i': i }} onPointerEnter={(e) => onCell(e, c)} />
                ))}
              </div>
            </div>
            <div className="dash-act-legend" aria-hidden="true">
              <span>Less</span>{[0, 1, 2, 3, 4].map((l) => <i key={l} className={`dash-act-cell l${l}`} />)}<span>More</span>
            </div>
          </div>
        )}
      </div>
      {model && (
        <div className="dash-act-stats">
          <div className="dash-act-stat"><span className="dash-act-ico flame"><Flame size={16} /></span><b>{plural(model.streak, 'day')}</b><span>streak</span></div>
          <div className="dash-act-stat"><span className="dash-act-ico"><CalendarDays size={16} /></span><b>{model.week}</b><span>this week</span></div>
          <div className="dash-act-stat"><span className="dash-act-ico"><TrendingUp size={16} /></span><b>{model.best}</b><span>your busiest day</span></div>
          <div className="dash-act-note">{plural(model.addedSum, 'thing')} added, {plural(model.active, 'active day')}</div>
        </div>
      )}
      {tip && (
        <div className="dash-act-tip" style={{ left: tip.x, top: tip.y }} role="tooltip">
          <b>{plural(tip.c.v, 'thing')}</b>
          <span className="dash-act-tip-date">{dateOf(tip.c.date).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}</span>
          <span className="dash-act-tip-what">{breakdown(tip.c)}</span>
        </div>
      )}
    </section>
  );
}
