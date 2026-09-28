import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Trophy, MoreHorizontal, Sparkles, ChevronDown, Target } from 'lucide-react';
import { api } from '../lib/api.js';
import { RARITIES, RARITY_ORDER, METRICS, xpOf, levelOf, titleOf, progressOf, fmtValue } from '../lib/achievements.js';
import { useToast } from '../components/Toast.jsx';
import Menu from '../components/Menu.jsx';
import PlatformIcon from '../components/content/PlatformIcon.jsx';
import AchievementCard, { Badge } from '../components/achievements/AchievementCard.jsx';
import AchievementEditor from '../components/achievements/AchievementEditor.jsx';

const FILTERS = [{ key: 'all', label: 'All' }, { key: 'got', label: 'Unlocked' }, { key: 'locked', label: 'To go' }];
const FOLLOWERS = ['instagram', 'tiktok', 'x', 'youtube'];
const EARLIER = ['deal', 'revenue', 'clients', 'projects', 'posts'];
const load = (k, fallback) => { try { return localStorage.getItem(k) || fallback; } catch { return fallback; } };

/**
 * Achievements: milestones as collectible cards — reached ones count as XP
 * (the rarer, the more) towards your level. Some unlock by themselves from
 * the app's numbers (invoices, clients, delivered projects, posted content,
 * the followers you note down); quests you tick off yourself.
 */
export default function AchievementsPage({ reloadKey }) {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [filter, setFilterState] = useState(() => (FILTERS.some((x) => x.key === load('achFilter', '')) ? load('achFilter', '') : 'all'));
  const [editor, setEditor] = useState(null); // { a } | { group }
  const [celebrate, setCelebrate] = useState(null); // { list, levelUp }
  const [glow, setGlow] = useState(() => new Set());
  const [busy, setBusy] = useState(false);
  const [numbersOpen, setNumbersOpen] = useState(false);
  const setFilter = (v) => { setFilterState(v); try { localStorage.setItem('achFilter', v); } catch { /* private window */ } };
  const dataRef = useRef(null);
  dataRef.current = data;

  // Fresh data; newly unlocked ones get their moment (and a level up, when there's one).
  const take = (d, unlocked = d.unlocked || []) => {
    const before = dataRef.current;
    setData(d);
    if (!unlocked.length) return;
    const list = d.achievements.filter((a) => unlocked.includes(a.id));
    const xp = (l) => l.reduce((n, a) => n + xpOf(a), 0);
    const lvBefore = before ? levelOf(xp(before.achievements.filter((a) => !unlocked.includes(a.id)))).level : levelOf(xp(d.achievements) - xp(list)).level;
    const lvNow = levelOf(xp(d.achievements)).level;
    setCelebrate({ list, levelUp: lvNow > lvBefore ? lvNow : 0 });
    setGlow(new Set(unlocked));
    setTimeout(() => setGlow(new Set()), 6000);
  };
  const reload = async (unlocked) => {
    try { const d = await api.getAchievements(); take(d, unlocked ? [...new Set([...unlocked, ...d.unlocked])] : d.unlocked); }
    catch (e) { setError(e.message); }
  };
  useEffect(() => {
    let alive = true;
    api.getAchievements().then((d) => { if (alive) take(d); }).catch((e) => { if (alive) setError(e.message); });
    return () => { alive = false; };
  }, [reloadKey]);

  const list = useMemo(() => data?.achievements || [], [data]);
  const metrics = useMemo(() => data?.metrics || {}, [data]);
  const xp = list.reduce((n, a) => n + xpOf(a), 0);
  const lv = levelOf(xp);
  const got = list.filter((a) => a.achievedAt).length;
  const groups = useMemo(() => {
    const out = [];
    for (const a of list) {
      let g = out[out.length - 1];
      if (!g || g.name !== a.group) { g = { name: a.group, items: [] }; out.push(g); }
      g.items.push(a);
    }
    return out;
  }, [list]);
  const next = useMemo(() => list.map((a) => ({ a, p: progressOf(a, metrics) })).filter((x) => x.p != null && x.p < 1)
    .sort((x, y) => y.p - x.p).slice(0, 3), [list, metrics]);
  const openQuests = list.filter((a) => !a.achievedAt && !a.metric).length;

  const addStarter = async () => {
    setBusy(true);
    try {
      const d = await api.addStarterAchievements();
      take(d);
      toast(d.added ? `${d.added} achievements added` : 'You have them all already');
    } catch (e) { toast(`Could not add them: ${e.message}`, 'error'); } finally { setBusy(false); }
  };
  const remove = async (a) => {
    try {
      const { trashId } = await api.removeAchievement(a.id);
      setEditor(null);
      await reload();
      toast(`“${a.title || 'Achievement'}” moved to Trash`, 'ok', { label: 'Undo', onClick: async () => { await api.restoreTrash(trashId); reload(); } });
    } catch (e) { toast(`Could not delete: ${e.message}`, 'error'); }
  };
  const saveStats = async (patch) => {
    try { take(await api.updateAchievementStats(patch)); } catch (e) { toast(`Could not save: ${e.message}`, 'error'); }
  };

  if (error) return <div className="center-msg">Couldn’t load: {error}</div>;
  if (!data) return <div className="spinner" />;

  const shown = (items) => items.filter((a) => filter === 'all' || (filter === 'got' ? !!a.achievedAt : !a.achievedAt));
  const pct = lv.to > lv.from ? ((xp - lv.from) / (lv.to - lv.from)) * 100 : 0;

  return (
    <div className="ach-page">
      <div className="page-head-row">
        <div className="page-head">
          <h1>Achievements</h1>
          <p>Your milestones as a designer — every one you reach is XP towards your next level.</p>
        </div>
        <div className="ach-head-tools">
          <button type="button" className="btn btn-primary" onClick={() => setEditor({ group: '' })}><Plus size={16} /> New achievement</button>
          {list.length > 0 && (
            <Menu align="right" trigger={<button type="button" className="icon-btn" aria-label="More"><MoreHorizontal size={16} /></button>}
              items={[{ label: 'Add the starter set (the missing ones)', icon: <Sparkles size={15} />, onClick: addStarter, disabled: busy }]} />
          )}
        </div>
      </div>

      {list.length ? (
        <>
          <section className="ach-hero" aria-label="Your level">
            <div className="ach-level" style={{ '--p': `${pct}%` }}>
              <span><small>Level</small><b>{lv.level}</b></span>
            </div>
            <div className="ach-hero-main">
              <div className="ach-hero-title"><b>{titleOf(lv.level)}</b><span>{xp.toLocaleString()} XP</span></div>
              <div className="ach-xpbar" role="progressbar" aria-valuemin={lv.from} aria-valuemax={lv.to} aria-valuenow={xp}><i style={{ width: `${pct}%` }} /></div>
              <div className="ach-hero-sub">
                <span>{(lv.to - xp).toLocaleString()} XP to level {lv.level + 1}</span>
                <span>{got} / {list.length} unlocked{openQuests ? ` · ${openQuests} open quest${openQuests > 1 ? 's' : ''}` : ''}</span>
              </div>
            </div>
            <div className="ach-collection" aria-label="By rarity">
              {RARITY_ORDER.map((k) => {
                const all = list.filter((a) => a.rarity === k);
                if (!all.length) return null;
                const n = all.filter((a) => a.achievedAt).length;
                return (
                  <span key={k} className={`ach-gem r-${k} ${n ? '' : 'none'}`} style={{ '--rc': RARITIES[k].color }} title={`${RARITIES[k].label}: ${n} of ${all.length} · ${RARITIES[k].xp} XP each`}>
                    <i /> {n}<small>/{all.length}</small>
                  </span>
                );
              })}
            </div>
          </section>

          {next.length > 0 && (
            <section className="ach-next" aria-label="Next up">
              <div className="ach-section-head"><Target size={13} /> Next up</div>
              <div className="ach-next-list">
                {next.map(({ a, p }) => (
                  <button key={a.id} type="button" className="ach-next-item" style={{ '--rc': RARITIES[a.rarity].color }} onClick={() => setEditor({ a })}>
                    <Badge a={a} size={40} />
                    <span className="ach-next-main">
                      <b>{a.title}</b>
                      <span className="ach-bar"><i style={{ width: `${Math.max(2, p * 100)}%` }} /></span>
                      <span className="ach-next-sub">{fmtValue(a.metric, metrics[a.metric])} / {fmtValue(a.metric, a.target)} · +{RARITIES[a.rarity].xp} XP</span>
                    </span>
                  </button>
                ))}
              </div>
            </section>
          )}

          <Numbers data={data} open={numbersOpen} onToggle={() => setNumbersOpen((o) => !o)} onSave={saveStats} />

          <div className="ach-tools">
            <div className="segmented segmented-sm" role="group" aria-label="Show">
              {FILTERS.map((x) => <button key={x.key} type="button" className={filter === x.key ? 'on' : ''} onClick={() => setFilter(x.key)}>{x.label}</button>)}
            </div>
          </div>

          <div className="ach-groups">
            {groups.map((g) => {
              const items = shown(g.items);
              if (!items.length && filter !== 'all') return null;
              const n = g.items.filter((a) => a.achievedAt).length;
              return (
                <section key={g.name} className="ach-group">
                  <header className="ach-group-head">
                    <h2>{g.name}</h2>
                    <span className="ach-group-count">{n} / {g.items.length}</span>
                    <span className="ach-group-bar"><i style={{ width: `${(n / g.items.length) * 100}%` }} /></span>
                  </header>
                  <div className="ach-grid">
                    {items.map((a) => <AchievementCard key={a.id} a={a} metrics={metrics} glow={glow.has(a.id)} onClick={() => setEditor({ a })} />)}
                    {filter !== 'got' && (
                      <button type="button" className="ach-add" onClick={() => setEditor({ group: g.name })}><Plus size={20} /><span>Add to {g.name}</span></button>
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        </>
      ) : (
        <div className="empty ach-empty">
          <Trophy size={30} />
          <h3>No achievements yet</h3>
          <p>Start with a set that fits your work — revenue deals, Instagram followers, clients, posts and special quests (album covers, visualizers, known brands …), with the days you already reached them. Or add your own.</p>
          <div className="ach-empty-actions">
            <button type="button" className="btn btn-primary" onClick={addStarter} disabled={busy}><Sparkles size={16} /> Start with the starter set</button>
            <button type="button" className="btn" onClick={() => setEditor({ group: '' })}><Plus size={16} /> Add your own</button>
          </div>
        </div>
      )}

      {editor && (
        <AchievementEditor a={editor.a} group={editor.group} groups={groups.map((g) => g.name)} metrics={metrics} ideas={data.ideas} existing={list}
          onClose={() => setEditor(null)} onDelete={remove}
          onSaved={(unlocked) => { setEditor(null); reload(unlocked); }} />
      )}
      {celebrate && <Celebration {...celebrate} metrics={metrics} onClose={() => setCelebrate(null)} />}
    </div>
  );
}

/** Followers (you keep them up to date) and what you did before the app — saved when you leave a field. */
function Numbers({ data, open, onToggle, onSave }) {
  const { stats, metrics } = data;
  const [draft, setDraft] = useState({});
  const commit = (group, key) => {
    const k = `${group}.${key}`;
    if (!(k in draft)) return;
    const v = Math.max(0, Number(draft[k]) || 0);
    setDraft((d) => { const x = { ...d }; delete x[k]; return x; });
    if (v !== stats[group][key]) onSave({ [group]: { [key]: v } });
  };
  const input = (group, key, label, extra) => {
    const k = `${group}.${key}`;
    return (
      <label key={k} className="ach-num">
        <span>{label}</span>
        <input className="input" type="number" min="0" inputMode="numeric" value={k in draft ? draft[k] : stats[group][key] || ''} placeholder="0"
          onChange={(e) => setDraft((d) => ({ ...d, [k]: e.target.value }))} onBlur={() => commit(group, key)}
          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} />
        {extra && <small>{extra}</small>}
      </label>
    );
  };
  const inApp = (key) => (key === 'deal' ? metrics.deal : metrics[key] - stats.earlier[key]);
  return (
    <section className={`ach-numbers ${open ? 'open' : ''}`}>
      <button type="button" className="ach-numbers-toggle" onClick={onToggle} aria-expanded={open}>
        <span><b>Your numbers</b> — followers and what came before the app</span>
        <span className="ach-numbers-peek">
          {FOLLOWERS.filter((p) => stats.followers[p]).map((p) => <span key={p}><PlatformIcon platform={p} size={12} /> {stats.followers[p].toLocaleString()}</span>)}
        </span>
        <ChevronDown size={16} className="ach-numbers-chev" />
      </button>
      {open && (
        <div className="ach-numbers-body">
          <div>
            <div className="ach-section-head">Followers <em>— keep them up to date, milestones unlock from them</em></div>
            <div className="ach-num-grid">
              {FOLLOWERS.map((p) => input('followers', p, <><PlatformIcon platform={p} size={12} /> {METRICS[`followers:${p}`].label}</>))}
            </div>
          </div>
          <div>
            <div className="ach-section-head">Before the app <em>— added to what the app counts</em></div>
            <div className="ach-num-grid">
              {EARLIER.map((k) => input('earlier', k, METRICS[k].earlier,
                k === 'deal' ? `Biggest invoice in the app: ${fmtValue('deal', inApp(k))}` : `+ ${fmtValue(k, inApp(k))} ${METRICS[k].app} = ${fmtValue(k, metrics[k])}`))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

/** The moment: the card(s) just unlocked, the XP — and the new level. */
function Celebration({ list, levelUp, metrics, onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' || e.key === 'Enter') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const xp = list.reduce((n, a) => n + (RARITIES[a.rarity]?.xp || 0), 0);
  const shown = list.slice(0, 3);
  return (
    <div className="overlay ach-celebrate" onMouseDown={onClose} role="dialog" aria-modal="true" aria-label="Achievement unlocked">
      <div className="ach-celebrate-in">
        <div className="ach-celebrate-rays" aria-hidden="true" />
        <div className="ach-celebrate-kicker">{list.length > 1 ? `${list.length} achievements unlocked` : 'Achievement unlocked'}</div>
        <div className="ach-celebrate-cards">
          {shown.map((a, i) => <div key={a.id} className="ach-celebrate-card" style={{ '--i': i }}><AchievementCard a={a} metrics={metrics} as="div" /></div>)}
        </div>
        {list.length > 3 && <div className="ach-celebrate-more">+ {list.length - 3} more</div>}
        <div className="ach-celebrate-xp">+{xp.toLocaleString()} XP</div>
        {levelUp > 0 && <div className="ach-celebrate-level">Level {levelUp} — {titleOf(levelUp)}</div>}
        <button type="button" className="btn btn-primary" onClick={onClose}>Nice!</button>
      </div>
    </div>
  );
}
