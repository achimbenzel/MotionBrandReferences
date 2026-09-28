import { useState } from 'react';
import { Pencil, Check, X, Coins, TrendingUp, Building2, Briefcase, Megaphone, Sparkles } from 'lucide-react';
import { METRICS, FOLLOWER_METRICS, WORK_METRICS, fmtValue, wouldUnlock, nextOn } from '../../lib/achievements.js';
import { PLATFORMS } from '../../lib/content.js';
import PlatformIcon from '../content/PlatformIcon.jsx';

const WORK_ICON = { deal: Coins, revenue: TrendingUp, clients: Building2, projects: Briefcase, posts: Megaphone };

/**
 * Your numbers, one tile each — followers and your work, all typed in by you
 * (nothing is counted from the app). Typing a number shows what it would
 * unlock; Enter saves it (and unlocks them).
 */
export default function AchievementStats({ data, onSave }) {
  return (
    <section className="ach-stats" aria-label="Your numbers">
      <div className="ach-stats-row">
        <div className="ach-section-head">Followers <em>— yours to keep up to date</em></div>
        <div className="ach-stats-grid">{FOLLOWER_METRICS.map((m) => <StatTile key={m} metric={m} data={data} onSave={onSave} />)}</div>
      </div>
      <div className="ach-stats-row">
        <div className="ach-section-head">Your work <em>— yours to keep up to date too</em></div>
        <div className="ach-stats-grid">{WORK_METRICS.map((m) => <StatTile key={m} metric={m} data={data} onSave={onSave} />)}</div>
      </div>
    </section>
  );
}

function StatTile({ metric, data, onSave }) {
  const { stats, metrics, achievements } = data;
  const m = METRICS[metric];
  const platform = m.follower;
  const [edit, setEdit] = useState(null); // the number being typed (string) or null
  const [busy, setBusy] = useState(false);

  const stored = platform ? stats.followers[platform] : stats.numbers[metric];
  const typed = edit == null ? null : Math.max(0, Math.round(Number(edit) || 0));
  const total = typed == null ? metrics[metric] : typed;
  const unlocks = typed == null ? [] : wouldUnlock(achievements, metric, total);
  const next = nextOn(achievements, metric);
  const Icon = WORK_ICON[metric];

  const save = async () => {
    if (typed == null || busy) return;
    if (typed === stored) { setEdit(null); return; }
    setBusy(true);
    try { await onSave(platform ? { followers: { [platform]: typed } } : { numbers: { [metric]: typed } }); setEdit(null); } finally { setBusy(false); }
  };
  const start = () => setEdit(String(stored || ''));

  return (
    <div className={`ach-stat ${edit != null ? 'editing' : ''}`} style={platform ? { '--pc': PLATFORMS[platform].color } : undefined}>
      <div className="ach-stat-head">
        <span className="ach-stat-icon">{platform ? <PlatformIcon platform={platform} size={15} /> : <Icon size={15} />}</span>
        <span className="ach-stat-label">{m.short}</span>
        {edit == null && <button type="button" className="ach-stat-edit" onClick={start} aria-label={`Change ${m.short}`} title="Change"><Pencil size={13} /></button>}
      </div>
      {edit == null ? (
        <button type="button" className="ach-stat-value" onClick={start} title="Change">{fmtValue(metric, metrics[metric])}</button>
      ) : (
        <form className="ach-stat-form" onSubmit={(e) => { e.preventDefault(); save(); }}>
          <label>
            <span>{m.label}</span>
            <input className="input" type="number" min="0" inputMode="numeric" value={edit} disabled={busy} autoFocus onFocus={(e) => e.target.select()}
              onChange={(e) => setEdit(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); setEdit(null); } }} />
          </label>
          <button type="submit" className="icon-btn ach-stat-ok" disabled={busy} aria-label="Save"><Check size={15} /></button>
          <button type="button" className="icon-btn" onClick={() => setEdit(null)} disabled={busy} aria-label="Cancel"><X size={15} /></button>
        </form>
      )}
      {edit != null ? (
        <div className={`ach-stat-preview ${unlocks.length ? 'on' : ''}`}>
          {unlocks.length ? (
            <>
              <span className="ach-stat-unlocks"><Sparkles size={12} /> Unlocks {unlocks.length}</span>
              <span className="ach-stat-chips">{unlocks.map((a) => <i key={a.id}>{a.title || 'Untitled'}</i>)}</span>
            </>
          ) : <span>Nothing new unlocks at this number.</span>}
        </div>
      ) : (
        <>
          {next ? (
            <div className="ach-stat-next" title={next.title}>
              <span className="ach-bar"><i style={{ width: `${Math.max(2, Math.min(1, metrics[metric] / next.target) * 100)}%` }} /></span>
              <span>Next: {next.title || fmtValue(metric, next.target)} · {Math.floor(Math.min(1, metrics[metric] / next.target) * 100)}%</span>
            </div>
          ) : <div className="ach-stat-next none">No milestone on this yet</div>}
        </>
      )}
    </div>
  );
}
