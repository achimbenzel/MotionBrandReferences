import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trophy, ArrowRight, Sparkles, Target, Clock } from 'lucide-react';
import { api } from '../../lib/api.js';
import { RARITIES, xpOf, rankOf, progressOf, fmtValue, fmtDate } from '../../lib/achievements.js';
import { RankEmblem, Badge } from '../achievements/AchievementCard.jsx';

/**
 * Achievements on the dashboard: your rank and XP, how many you have (and
 * this year), the latest one you reached and the one you're closest to.
 */
export default function AchievementsWidget({ reloadKey, compact = false }) {
  const navigate = useNavigate();
  const [d, setD] = useState(null);
  useEffect(() => {
    let alive = true;
    api.getAchievements().then((x) => { if (alive) setD(x); }).catch(() => { if (alive) setD(false); });
    return () => { alive = false; };
  }, [reloadKey]);
  if (d === false) return null;
  if (!d) return <section className="dash-ach"><div className="dash-card-kicker"><Trophy size={14} /> Achievements</div><div className="spinner" /></section>;

  const list = d.achievements;
  const xp = list.reduce((n, a) => n + xpOf(a), 0);
  const rank = rankOf(xp);
  const got = list.filter((a) => a.achievedAt);
  const year = String(new Date().getFullYear());
  const thisYear = got.filter((a) => a.achievedAt.startsWith(year)).length;
  const latest = [...got].sort((a, b) => b.achievedAt.localeCompare(a.achievedAt) || b.updatedAt - a.updatedAt)[0];
  const closest = list.map((a) => ({ a, p: progressOf(a, d.metrics) })).filter((x) => x.p != null && x.p < 1).sort((x, y) => y.p - x.p)[0];
  const quests = list.filter((a) => !a.achievedAt && !a.metric).length;
  const just = list.filter((a) => d.unlocked.includes(a.id));
  const open = () => navigate('/achievements');

  return (
    <section className={`dash-ach ${compact ? 'compact' : ''}`} style={{ '--rc': RARITIES[rank.tier].color }}>
      <div className="dash-card-kicker">
        <Trophy size={14} /> Achievements
        <button type="button" className="btn btn-sm btn-ghost dash-ach-all" onClick={open}>All <ArrowRight size={14} /></button>
      </div>
      {just.length > 0 && (
        <button type="button" className="dash-ach-just" onClick={open}><Sparkles size={14} /> Just unlocked: {just.map((a) => a.title).join(', ')}</button>
      )}
      <div className="dash-ach-body">
        <button type="button" className="dash-ach-rank" onClick={open}>
          <RankEmblem rank={rank} size={62} />
          <span className="dash-ach-rank-main">
            <b>{rank.label}</b>
            <span className="ach-xpbar"><i style={{ width: `${rank.progress * 100}%` }} /></span>
            <small>{xp.toLocaleString()} XP{rank.top ? ' · top rank' : ` · ${(rank.to - xp).toLocaleString()} to ${rank.next.label}`}</small>
          </span>
        </button>
        <div className="dash-ach-nums">
          <span><b>{got.length}</b><small>of {list.length} unlocked</small></span>
          <span><b>{thisYear}</b><small>in {year}</small></span>
          <span><b>{quests}</b><small>open quest{quests === 1 ? '' : 's'}</small></span>
        </div>
        {list.length ? (
          <div className="dash-ach-rows">
            {latest && (
              <button type="button" className="dash-ach-row" onClick={open} style={{ '--rc': RARITIES[latest.rarity].color }}>
                <Badge a={latest} size={36} />
                <span className="dash-ach-row-text"><small><Clock size={11} /> Latest · {fmtDate(latest.achievedAt)}</small><b>{latest.title || 'Untitled'}</b></span>
              </button>
            )}
            {closest && (
              <button type="button" className="dash-ach-row" onClick={open} style={{ '--rc': RARITIES[closest.a.rarity].color }}>
                <Badge a={closest.a} size={36} />
                <span className="dash-ach-row-text">
                  <small><Target size={11} /> Closest · {Math.floor(closest.p * 100)}%</small>
                  <b>{closest.a.title || 'Untitled'}</b>
                  <span className="ach-bar"><i style={{ width: `${Math.max(2, closest.p * 100)}%` }} /></span>
                  <small>{fmtValue(closest.a.metric, d.metrics[closest.a.metric])} / {fmtValue(closest.a.metric, closest.a.target)}</small>
                </span>
              </button>
            )}
          </div>
        ) : (
          <button type="button" className="dash-ach-row dash-ach-empty" onClick={open}><Trophy size={18} /><span className="dash-ach-row-text"><b>Set your milestones</b><small>Followers, deals, clients, quests — and rank up.</small></span></button>
        )}
      </div>
    </section>
  );
}
