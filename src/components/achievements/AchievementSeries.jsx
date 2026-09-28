import { useEffect, useState } from 'react';
import { X, Plus, Trash2, Sparkles } from 'lucide-react';
import { api } from '../../lib/api.js';
import { RARITIES, RANK_TIERS, METRICS, FOLLOWER_METRICS, WORK_METRICS, seriesSteps, shortNum, fmtValue } from '../../lib/achievements.js';
import { useToast } from '../Toast.jsx';
import AchievementCard from './AchievementCard.jsx';

const RARITY_CHOICES = [...RANK_TIERS, 'quest', 'dream'];
// Rising with the steps: Stone, Bronze … Mythic (and Mythic from there on).
const risingRarity = (i) => RANK_TIERS[Math.min(i, RANK_TIERS.length - 1)];
const stepsFor = (metric) => seriesSteps(metric).map((target, i) => ({ target, rarity: risingRarity(i) }));
const badgeOf = (metric, n) => `${shortNum(n)}${METRICS[metric]?.unit || ''}`.slice(0, 8);
const fill = (pattern, metric, n) => pattern.replaceAll('{n}', shortNum(n)).replaceAll('{N}', fmtValue(metric, n).replace(/ €$/, '€'));

/**
 * A series of milestones on one number in one go — Instagram (or TikTok, X …)
 * followers, deals, clients: the steps, each with its rarity, a name
 * pattern ({n} = 2K, {N} = 2,000) and the group they go in.
 */
export default function AchievementSeries({ groups, metrics, existing, onClose, onSaved }) {
  const toast = useToast();
  const [metric, setMetricState] = useState('followers:instagram');
  const [group, setGroup] = useState(METRICS['followers:instagram'].group);
  const [title, setTitle] = useState(METRICS['followers:instagram'].title);
  const [description, setDescription] = useState('');
  const [steps, setSteps] = useState(() => stepsFor('followers:instagram'));
  const [busy, setBusy] = useState(false);
  const setMetric = (m) => { setMetricState(m); setGroup(METRICS[m].group); setTitle(METRICS[m].title); setSteps(stepsFor(m)); };

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, busy]);

  const now = metrics?.[metric] || 0;
  const have = new Set(existing.filter((a) => a.metric === metric).map((a) => a.target));
  const rows = steps.map((s) => ({ ...s, n: Math.max(0, Math.round(Number(s.target) || 0)) }));
  const seen = new Set();
  const valid = rows.filter((r) => r.n > 0 && !have.has(r.n) && !seen.has(r.n) && seen.add(r.n));
  const setStep = (i, patch) => setSteps((l) => l.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const addStep = () => setSteps((l) => [...l, { target: '', rarity: risingRarity(l.length) }]);
  const example = valid[Math.min(3, valid.length - 1)] || rows[0];
  const preview = example && {
    id: 'preview', group, title: fill(title, metric, example.n || 0), description: fill(description, metric, example.n || 0), rarity: example.rarity,
    icon: { type: 'text', text: badgeOf(metric, example.n || 0), symbol: '' }, metric, target: example.n, achievedAt: '',
  };

  const save = async () => {
    if (!valid.length || busy) return;
    setBusy(true);
    try {
      const items = [...valid].sort((a, b) => a.n - b.n).map((r) => ({
        group: group.trim(), metric, target: r.n, rarity: r.rarity, title: fill(title, metric, r.n).trim(), description: fill(description, metric, r.n).trim(),
        icon: { type: 'text', text: badgeOf(metric, r.n) },
      }));
      onSaved(await api.addAchievements(items));
    } catch (e) { toast(`Could not add them: ${e.message}`, 'error'); setBusy(false); }
  };

  return (
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div className="modal ach-editor ach-series" role="dialog" aria-modal="true" aria-label="New series">
        <div className="modal-head">
          <h2>New series</h2>
          <button type="button" className="icon-btn" onClick={onClose} disabled={busy} aria-label="Close"><X size={18} /></button>
        </div>
        <div className="modal-body ach-editor-body">
          <div className="ach-editor-preview">
            {preview && <AchievementCard a={preview} metrics={metrics} as="div" showcase />}
            <div className="ach-editor-xp">One card per step — they unlock by themselves when your number gets there.</div>
          </div>
          <div className="ach-editor-form">
            <div className="field">
              <label htmlFor="ser-metric">Counts</label>
              <select id="ser-metric" className="input" value={metric} onChange={(e) => setMetric(e.target.value)}>
                <optgroup label="Followers">{FOLLOWER_METRICS.map((k) => <option key={k} value={k}>{METRICS[k].label}</option>)}</optgroup>
                <optgroup label="Your work">{WORK_METRICS.map((k) => <option key={k} value={k}>{METRICS[k].label}</option>)}</optgroup>
              </select>
              <div className="hint">Now: {fmtValue(metric, now)}{METRICS[metric].follower ? ' — change it under “Your numbers”' : ''}.</div>
            </div>
            <div className="row-2">
              <div className="field">
                <label htmlFor="ser-group">Group</label>
                <input id="ser-group" className="input" list="ser-groups" value={group} maxLength={60} onChange={(e) => setGroup(e.target.value)} />
                <datalist id="ser-groups">{groups.map((g) => <option key={g} value={g} />)}</datalist>
              </div>
              <div className="field">
                <label htmlFor="ser-title">Name <span className="ach-opt">— {'{n}'} = {shortNum(2000)}, {'{N}'} = {(2000).toLocaleString()}</span></label>
                <input id="ser-title" className="input" value={title} maxLength={100} onChange={(e) => setTitle(e.target.value)} />
              </div>
            </div>
            <div className="field">
              <label htmlFor="ser-desc">What it takes <span className="ach-opt">— optional, same {'{n}'}</span></label>
              <input id="ser-desc" className="input" value={description} maxLength={300} placeholder={`e.g. ${fill(title, metric, 1000)} erreicht.`} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Steps</label>
              <div className="ach-steps">
                {rows.map((r, i) => {
                  const dup = r.n > 0 && have.has(r.n);
                  return (
                    <div key={i} className={`ach-step ${dup ? 'dup' : ''}`}>
                      <input className="input" type="number" min="1" value={steps[i].target} aria-label="Number" placeholder="1000" onChange={(e) => setStep(i, { target: e.target.value })} />
                      <select className="input ach-step-rarity" value={r.rarity} aria-label="Rarity" style={{ '--rc': RARITIES[r.rarity].color }} onChange={(e) => setStep(i, { rarity: e.target.value })}>
                        {RARITY_CHOICES.map((k) => <option key={k} value={k}>{RARITIES[k].label} · {RARITIES[k].xp} XP</option>)}
                      </select>
                      <span className="ach-step-name">
                        {r.n > 0 ? fill(title, metric, r.n) : '—'}
                        {dup ? <em>already there</em> : r.n > 0 && now >= r.n ? <em className="on"><Sparkles size={11} /> unlocks now</em> : null}
                      </span>
                      <button type="button" className="icon-btn" onClick={() => setSteps((l) => l.filter((_, j) => j !== i))} aria-label="Remove step"><Trash2 size={14} /></button>
                    </div>
                  );
                })}
              </div>
              <button type="button" className="btn btn-sm btn-ghost ach-step-add" onClick={addStep}><Plus size={14} /> Add a step</button>
            </div>
          </div>
        </div>
        <div className="modal-foot">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={save} disabled={busy || !valid.length || !title.trim()}>
            {busy ? 'Adding…' : `Add ${valid.length} achievement${valid.length === 1 ? '' : 's'}`}
          </button>
        </div>
      </div>
    </div>
  );
}
