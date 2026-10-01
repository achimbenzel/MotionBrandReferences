import { useMemo, useState } from 'react';
import { Eye, Heart, Bookmark, UserPlus, TrendingUp, TrendingDown, Lightbulb, AlertCircle, Target, BarChart3 } from 'lucide-react';
import { tagColor } from '../../lib/types.js';
import {
  FORMATS, WEEKDAY_LONG, fmtNum, fmtDay, weekdayOf, mondayOf, addDays, goalOf, pillarOf,
} from '../../lib/content.js';
import PostCover from './PostCover.jsx';
import { usePref } from '../../lib/prefs.js';
import { fmtFixed } from '../../lib/format.js';

const PERIODS = [
  { key: '30', label: '30 days', days: 30 },
  { key: '90', label: '90 days', days: 90 },
  { key: '365', label: '12 months', days: 365 },
  { key: 'all', label: 'All', days: 0 },
];
const SORTS = [
  { key: 'views', label: 'Views', icon: Eye },
  { key: 'rate', label: 'Engagement', icon: Heart },
  { key: 'saves', label: 'Saves', icon: Bookmark },
  { key: 'follows', label: 'Follows', icon: UserPlus },
];

/** Likes, comments, shares and saves per view (null without views). */
export const rateOf = (c) => {
  const m = c.metrics || {};
  if (!m.views) return null;
  return (['likes', 'comments', 'shares', 'saves'].reduce((n, k) => n + (m[k] || 0), 0) / m.views) * 100;
};
const avg = (list) => (list.length ? list.reduce((n, x) => n + x, 0) / list.length : null);
const sum = (list, k) => list.reduce((n, c) => n + (c.metrics?.[k] || 0), 0);
const pct = (v) => (v == null ? '—' : `${fmtFixed(v, v < 10 ? 1 : 0)} %`);
const lengthOf = (c) => (c.beats || []).reduce((n, b) => n + (b.sec || 0), 0);
const LENGTHS = [
  { key: 'l1', label: 'under 15 s', test: (s) => s > 0 && s < 15 },
  { key: 'l2', label: '15–35 s', test: (s) => s >= 15 && s <= 35 },
  { key: 'l3', label: '35–60 s', test: (s) => s > 35 && s <= 60 },
  { key: 'l4', label: 'over 60 s', test: (s) => s > 60 },
];
const DAYPARTS = [
  { key: 'd1', label: 'Morning (before 11)', test: (h) => h < 11 },
  { key: 'd2', label: 'Midday (11–15)', test: (h) => h >= 11 && h < 15 },
  { key: 'd3', label: 'Afternoon (15–18)', test: (h) => h >= 15 && h < 18 },
  { key: 'd4', label: 'Evening (18–22)', test: (h) => h >= 18 && h < 22 },
  { key: 'd5', label: 'Late (22 +)', test: (h) => h >= 22 },
];

/** Posts grouped by a key → [{ key, label, color, posts, views (⌀), rate (⌀) }], best first. */
function groupBy(posts, keyOf) {
  const map = new Map();
  for (const c of posts) {
    const g = keyOf(c);
    if (!g) continue;
    if (!map.has(g.key)) map.set(g.key, { ...g, posts: [] });
    map.get(g.key).posts.push(c);
  }
  return [...map.values()].map((g) => ({
    ...g,
    views: avg(g.posts.filter((c) => c.metrics.views != null).map((c) => c.metrics.views)),
    rate: avg(g.posts.map(rateOf).filter((x) => x != null)),
  })).sort((a, b) => (b.views ?? -1) - (a.views ?? -1));
}

/**
 * How the posts did: the totals for a period (against the one before), the
 * weeks against your rhythm, the best posts — and what works: by pillar,
 * format, weekday, time of day and length, with what stands out.
 */
export default function Insights({ items, all, pillars, rhythm, today, onOpen }) {
  const [period, setPeriod] = usePref('contentInsights', '90', (v) => PERIODS.some((p) => p.key === v));
  const [sort, setSort] = useState('views');
  const [by, setBy] = useState('views'); // what the bars compare
  const days = PERIODS.find((p) => p.key === period).days;
  const from = days ? addDays(today, -days + 1) : '';
  const prevFrom = days ? addDays(today, -days * 2 + 1) : '';

  const data = useMemo(() => {
    const out = items.filter((c) => c.status === 'posted' && c.date);
    const posted = out.filter((c) => !from || c.date >= from);
    const before = days ? out.filter((c) => c.date >= prevFrom && c.date < from) : [];
    const nums = posted.filter((c) => c.metrics.views != null);
    const totals = (list) => {
      const withViews = list.filter((c) => c.metrics.views != null);
      return {
        posts: list.length, views: sum(list, 'views'), avgViews: avg(withViews.map((c) => c.metrics.views)),
        rate: avg(list.map(rateOf).filter((x) => x != null)), follows: sum(list, 'follows'),
      };
    };
    const groups = {
      pillar: pillars.length ? groupBy(nums, (c) => { const p = pillarOf(pillars, c.pillar); return p ? { key: p.id, label: p.name || 'Pillar', color: tagColor(p.color).fg } : { key: '-', label: 'No pillar' }; }) : [],
      format: groupBy(nums, (c) => ({ key: c.format, label: FORMATS[c.format]?.label || c.format })),
      weekday: groupBy(nums, (c) => { const d = weekdayOf(c.date); return { key: `w${d}`, label: WEEKDAY_LONG[d], order: d }; }),
      daypart: groupBy(nums.filter((c) => c.time), (c) => { const h = Number(c.time.slice(0, 2)); const p = DAYPARTS.find((x) => x.test(h)); return { key: p.key, label: p.label }; }),
      length: groupBy(nums.filter((c) => lengthOf(c) > 0), (c) => { const l = LENGTHS.find((x) => x.test(lengthOf(c))); return { key: l.key, label: l.label }; }),
    };
    // What stands out: a group with 2+ posts well above the average views.
    const overall = avg(nums.map((c) => c.metrics.views));
    const notes = [];
    const NAMES = { pillar: 'Posts in', format: '', weekday: 'Posts on', daypart: 'Posts in the', length: 'Reels of' };
    if (overall) {
      for (const [k, list] of Object.entries(groups)) {
        const best = list.find((g) => g.posts.length >= 2 && g.views != null);
        if (!best || list.filter((g) => g.views != null).length < 2) continue;
        const f = best.views / overall;
        if (f < 1.25) continue;
        const who = k === 'format' ? `${best.label}s` : k === 'daypart' ? `${NAMES[k]} ${best.label.split(' (')[0].toLowerCase()}` : `${NAMES[k]} ${best.label}`;
        notes.push({ f, text: <><b>{who}</b> get <b>{fmtFixed(f, 1)}×</b> your average views (⌀ {fmtNum(Math.round(best.views))} over {best.posts.length} posts).</> });
      }
      const rates = nums.map(rateOf).filter((x) => x != null);
      const saves = nums.filter((c) => c.metrics.saves != null && c.metrics.views);
      if (saves.length >= 3) {
        const top = [...saves].sort((a, b) => b.metrics.saves / b.metrics.views - a.metrics.saves / a.metrics.views)[0];
        notes.push({ f: 1.1, text: <>Saved most often: <b>“{top.title || 'Untitled post'}”</b> ({fmtFixed((top.metrics.saves / top.metrics.views) * 100, 1)} % of viewers saved it) — worth a part two.</> });
      }
      if (rates.length >= 3) {
        const r = avg(rates);
        notes.push({ f: 1, text: <>⌀ engagement <b>{pct(r)}</b> — {r >= 6 ? 'very good for Reels.' : r >= 3 ? 'solid; a question or a “save this” can lift it.' : 'on the low side; try a clearer call to action.'}</> });
      }
    }
    notes.sort((a, b) => b.f - a.f);
    return { posted, nums, now: totals(posted), before: days ? totals(before) : null, groups, notes: notes.slice(0, 4), missing: posted.filter((c) => c.metrics.views == null) };
  }, [items, pillars, from, prevFrom, days]);

  // The last 12 weeks (all posts, not only the period) against the rhythm.
  const weeks = useMemo(() => {
    const monday = mondayOf(today);
    return Array.from({ length: 12 }, (_, i) => {
      const start = addDays(monday, -7 * (11 - i));
      const end = addDays(start, 6);
      const list = (all || []).filter((c) => c.status === 'posted' && c.date >= start && c.date <= end);
      return { start, n: list.length, current: i === 11 };
    });
  }, [all, today]);
  const goal = goalOf(rhythm);
  const maxWeek = Math.max(goal, ...weeks.map((w) => w.n), 1);
  let streak = 0;
  if (goal) for (let i = weeks.length - 2; i >= 0 && weeks[i].n >= goal; i -= 1) streak += 1;

  const top = useMemo(() => {
    const val = (c) => (sort === 'rate' ? rateOf(c) : c.metrics?.[sort]);
    return data.posted.filter((c) => val(c) != null).sort((a, b) => val(b) - val(a)).slice(0, 5).map((c) => ({ c, v: val(c) }));
  }, [data.posted, sort]);

  const trend = (now, prev) => {
    if (!data.before || prev == null || now == null || !prev) return null;
    const d = ((now - prev) / prev) * 100;
    if (Math.abs(d) < 1) return <span className="cti-trend">± 0 %</span>;
    return <span className={`cti-trend ${d > 0 ? 'up' : 'down'}`}>{d > 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}{d > 0 ? '+' : ''}{Math.round(d)} %</span>;
  };
  const t = data.now; const b = data.before || {};

  return (
    <div className="cti">
      <div className="cti-head">
        <div className="segmented segmented-sm" role="group" aria-label="Period">
          {PERIODS.map((p) => <button key={p.key} type="button" className={period === p.key ? 'on' : ''} onClick={() => setPeriod(p.key)}>{p.label}</button>)}
        </div>
        {data.before && <span className="hint">compared with the {PERIODS.find((p) => p.key === period).label} before</span>}
      </div>

      <div className="cti-tiles">
        <div><span>Posts</span><b>{t.posts}</b>{trend(t.posts, b.posts)}</div>
        <div><span><Eye size={12} /> Views</span><b>{fmtNum(t.views)}</b>{trend(t.views, b.views)}</div>
        <div><span>⌀ views per post</span><b>{t.avgViews == null ? '—' : fmtNum(Math.round(t.avgViews))}</b>{trend(t.avgViews, b.avgViews)}</div>
        <div><span><Heart size={12} /> ⌀ engagement</span><b>{pct(t.rate)}</b>{trend(t.rate, b.rate)}</div>
        <div><span><UserPlus size={12} /> New followers</span><b>{fmtNum(t.follows)}</b>{trend(t.follows, b.follows)}</div>
      </div>

      {!data.posted.length ? (
        <div className="empty cti-empty">
          <BarChart3 size={28} />
          <h3>Nothing posted in this time</h3>
          <p>Mark posts as posted and add their numbers (views, likes, saves …) — what works shows up here.</p>
        </div>
      ) : (
        <div className="cti-grid">
          <div className="cti-col">
          <section className="cti-card cti-weeks">
            <header><Target size={14} /> <b>Rhythm</b> <em>— posted per week, last 12 weeks</em>
              {goal > 0 && <span className="cti-streak">{streak ? `${streak} week${streak === 1 ? '' : 's'} in a row on goal` : `Goal: ${goal} a week`}</span>}
            </header>
            <div className={`cti-bars ${goal ? 'has-goal' : ''}`} style={{ '--goal-f': goal ? goal / maxWeek : 0 }}>
              {weeks.map((w) => (
                <div key={w.start} className={`cti-bar ${goal && w.n >= goal ? 'met' : ''} ${w.current ? 'now' : ''}`} title={`Week of ${fmtDay(w.start)}: ${w.n} posted`}>
                  <i style={{ height: `${(w.n / maxWeek) * 100}%` }}>{w.n > 0 && <span>{w.n}</span>}</i>
                  <small>{fmtDay(w.start, { day: 'numeric', month: 'numeric' })}</small>
                </div>
              ))}
            </div>
          </section>

          {data.notes.length > 0 && (
            <section className="cti-card cti-notes">
              <header><Lightbulb size={14} /> <b>What stands out</b></header>
              <ul>{data.notes.map((n, i) => <li key={i}>{n.text}</li>)}</ul>
            </section>
          )}

          </div>
          <div className="cti-col">
          <section className="cti-card cti-top">
            <header><TrendingUp size={14} /> <b>Best posts</b>
              <div className="segmented segmented-sm cti-sort" role="group" aria-label="Sort by">
                {SORTS.map((x) => <button key={x.key} type="button" className={sort === x.key ? 'on' : ''} onClick={() => setSort(x.key)} title={x.label}><x.icon size={12} /><span>{x.label}</span></button>)}
              </div>
            </header>
            {top.length ? top.map(({ c, v }, i) => (
              <button key={c.id} type="button" className="cti-post" onClick={() => onOpen(c)}>
                <span className="cti-rank">{i + 1}</span>
                <PostCover c={c} badges={false} className="cti-thumb" />
                <span className="cti-post-main"><b>{c.title || 'Untitled post'}</b><small>{fmtDay(c.date)} · {FORMATS[c.format]?.label}</small></span>
                <span className="cti-post-v">{sort === 'rate' ? pct(v) : fmtNum(v)}</span>
              </button>
            )) : <div className="hint">No numbers for this yet.</div>}
          </section>

          </div>
          <section className="cti-card cti-breakdowns">
            <header><BarChart3 size={14} /> <b>What works</b>
              <div className="segmented segmented-sm" role="group" aria-label="Compare">
                <button type="button" className={by === 'views' ? 'on' : ''} onClick={() => setBy('views')}>⌀ Views</button>
                <button type="button" className={by === 'rate' ? 'on' : ''} onClick={() => setBy('rate')}>⌀ Engagement</button>
              </div>
            </header>
            <div className="cti-groups">
              {[
                ['pillar', 'By pillar'], ['format', 'By format'], ['weekday', 'By weekday'], ['daypart', 'By time of day'], ['length', 'By length (Reels with beats)'],
              ].map(([k, title]) => {
                const list = [...data.groups[k]].sort((x, y) => (y[by] ?? -1) - (x[by] ?? -1));
                if (!list.length) return null;
                const max = Math.max(...list.map((g) => g[by] || 0), 1e-9);
                return (
                  <div key={k} className="cti-group">
                    <h4>{title}</h4>
                    {list.map((g) => (
                      <div key={g.key} className="cti-row" title={`${g.posts.length} post${g.posts.length === 1 ? '' : 's'}`}>
                        <span className="cti-row-label">{g.color && <i style={{ background: g.color }} />}{g.label}</span>
                        <span className="cti-row-bar"><i style={{ width: `${((g[by] || 0) / max) * 100}%`, background: g.color || undefined }} /></span>
                        <span className="cti-row-v">{by === 'rate' ? pct(g.rate) : g.views == null ? '—' : fmtNum(Math.round(g.views))}<small>{g.posts.length}×</small></span>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
            {data.nums.length < 5 && <p className="hint">With a few more posts with numbers this gets more telling.</p>}
          </section>

          {data.missing.length > 0 && (
            <section className="cti-card cti-missing">
              <header><AlertCircle size={14} /> <b>{data.missing.length} posted without numbers</b> <em>— add them to see how they did</em></header>
              <div className="cti-missing-list">
                {data.missing.slice(0, 12).map((c) => <button key={c.id} type="button" className="chip" onClick={() => onOpen(c)}>{c.title || 'Untitled post'} · {fmtDay(c.date)}</button>)}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
