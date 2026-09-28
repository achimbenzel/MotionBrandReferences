import { useEffect, useMemo, useState } from 'react';
import { Plus, Trophy, Layers, ChevronDown, Swords } from 'lucide-react';
import { api } from '../lib/api.js';
import { RARITIES, RARITY_ORDER, xpOf, rankOf } from '../lib/achievements.js';
import { useToast } from '../components/Toast.jsx';
import AchievementCard, { RankEmblem } from '../components/achievements/AchievementCard.jsx';
import AchievementEditor from '../components/achievements/AchievementEditor.jsx';
import AchievementSeries from '../components/achievements/AchievementSeries.jsx';
import AchievementStats from '../components/achievements/AchievementStats.jsx';

const FILTERS = [{ key: 'all', label: 'All' }, { key: 'got', label: 'Unlocked' }, { key: 'locked', label: 'To go' }];
const load = (k, fallback) => { try { return localStorage.getItem(k) || fallback; } catch { return fallback; } };
const store = (k, v) => { try { localStorage.setItem(k, v); } catch { /* private window */ } };
const xpSum = (list) => list.reduce((n, a) => n + xpOf(a), 0);

/**
 * Achievements: milestones as collectible cards — reached ones count as XP
 * (the rarer, the more) towards your rank, Stone 1 to Mythic 3. Some unlock
 * by themselves from your numbers (followers, deals, clients, delivered
 * projects, posts); quests you tick off yourself.
 */
export default function AchievementsPage({ reloadKey }) {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [filter, setFilterState] = useState(() => (FILTERS.some((x) => x.key === load('achFilter', '')) ? load('achFilter', '') : 'all'));
  const [numbersOpen, setNumbersOpen] = useState(() => load('achNumbers', 'open') === 'open');
  const [editor, setEditor] = useState(null); // { a } | { group }
  const [series, setSeries] = useState(false);
  const [celebrate, setCelebrate] = useState(null); // { list, rankUp }
  const [glow, setGlow] = useState(() => new Set());
  const setFilter = (v) => { setFilterState(v); store('achFilter', v); };
  const toggleNumbers = () => setNumbersOpen((o) => { store('achNumbers', o ? 'closed' : 'open'); return !o; });

  // Fresh data; newly unlocked ones get their moment (and a new rank, when there's one).
  const take = (d, unlocked = d.unlocked || []) => {
    setData(d);
    if (!unlocked.length) return;
    const list = d.achievements.filter((a) => unlocked.includes(a.id));
    const xpNow = xpSum(d.achievements);
    const before = rankOf(xpNow - xpSum(list));
    const now = rankOf(xpNow);
    setCelebrate({ list, rankUp: now.index > before.index ? now : null });
    setGlow(new Set(unlocked));
    setTimeout(() => setGlow(new Set()), 6000);
  };
  const reload = async (unlocked) => {
    try { const d = await api.getAchievements(); take(d, [...new Set([...(unlocked || []), ...d.unlocked])]); }
    catch (e) { setError(e.message); }
  };
  useEffect(() => {
    let alive = true;
    api.getAchievements().then((d) => { if (alive) take(d); }).catch((e) => { if (alive) setError(e.message); });
    return () => { alive = false; };
  }, [reloadKey]);

  const list = useMemo(() => data?.achievements || [], [data]);
  const groups = useMemo(() => {
    const out = [];
    for (const a of list) {
      let g = out[out.length - 1];
      if (!g || g.name !== a.group) { g = { name: a.group, items: [] }; out.push(g); }
      g.items.push(a);
    }
    return out;
  }, [list]);

  const remove = async (a) => {
    try {
      const { trashId } = await api.removeAchievement(a.id);
      setEditor(null);
      await reload();
      toast(`“${a.title || 'Achievement'}” moved to Trash`, 'ok', { label: 'Undo', onClick: async () => { await api.restoreTrash(trashId); reload(); } });
    } catch (e) { toast(`Could not delete: ${e.message}`, 'error'); }
  };
  const addPack = async () => {
    try {
      const d = await api.addQuestPack();
      take(d);
      toast(d.added ? `${d.added} Special Quests added` : 'You have all Special Quests already');
    } catch (e) { toast(`Could not add them: ${e.message}`, 'error'); }
  };
  const saveStats = async (patch) => {
    try { take(await api.updateAchievementStats(patch)); } catch (e) { toast(`Could not save: ${e.message}`, 'error'); throw e; }
  };

  if (error) return <div className="center-msg">Couldn’t load: {error}</div>;
  if (!data) return <div className="spinner" />;

  const metrics = data.metrics;
  const xp = xpSum(list);
  const rank = rankOf(xp);
  const got = list.filter((a) => a.achievedAt).length;
  const openQuests = list.filter((a) => !a.achievedAt && !a.metric).length;
  const shown = (items) => items.filter((a) => filter === 'all' || (filter === 'got' ? !!a.achievedAt : !a.achievedAt));
  const packMissing = (data.pack || []).filter((q) => !list.some((a) => a.group === q.group && a.title === q.title && a.description === q.description)).length;
  const newButtons = (
    <>
      {packMissing > 0 && (
        <button type="button" className="btn" onClick={addPack} title={`${packMissing} quests and dream quests: album cover, visualizer, a known person, a known brand, a business trip, game assets`}>
          <Swords size={16} /> Special Quests
        </button>
      )}
      <button type="button" className="btn" onClick={() => setSeries(true)} title="Several milestones on one number at once — e.g. TikTok followers 100, 500, 1K …"><Layers size={16} /> New series</button>
      <button type="button" className="btn btn-primary" onClick={() => setEditor({ group: '' })}><Plus size={16} /> New achievement</button>
    </>
  );

  return (
    <div className="ach-page">
      <div className="page-head-row">
        <div className="page-head">
          <h1>Achievements</h1>
          <p>Your milestones as a designer — every one you reach is XP towards your next rank.</p>
        </div>
        <div className="ach-head-tools">{newButtons}</div>
      </div>

      <section className="ach-hero" aria-label="Your rank" style={{ '--rc': RARITIES[rank.tier].color }}>
        <RankEmblem rank={rank} size={92} />
        <div className="ach-hero-main">
          <div className="ach-hero-title"><em>Rank</em><b>{rank.label}</b><span>{xp.toLocaleString()} XP</span></div>
          <div className="ach-xpbar" role="progressbar" aria-valuemin={rank.from} aria-valuemax={rank.to} aria-valuenow={xp}><i style={{ width: `${rank.progress * 100}%` }} /></div>
          <div className="ach-hero-sub">
            <span>{rank.top ? 'The top rank — legend.' : `${(rank.to - xp).toLocaleString()} XP to ${rank.next.label}`}</span>
            <span>{got} / {list.length} unlocked{openQuests ? ` · ${openQuests} open quest${openQuests > 1 ? 's' : ''}` : ''}</span>
          </div>
        </div>
        {list.length > 0 && (
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
        )}
      </section>

      <div className={`ach-numbers ${numbersOpen ? 'open' : ''}`}>
        <button type="button" className="ach-numbers-toggle" onClick={toggleNumbers} aria-expanded={numbersOpen}>
          <b>Your numbers</b><span>Type a number and press Enter — every milestone it reaches unlocks.</span>
          <ChevronDown size={16} className="ach-numbers-chev" />
        </button>
        {numbersOpen && <AchievementStats data={data} onSave={saveStats} />}
      </div>

      {list.length ? (
        <>
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
          <p>
            Start with the <b>Special Quests</b> (album cover, visualizer, a known brand …), add a <b>series</b> on one of your numbers —
            Instagram, TikTok or X followers, deals, clients, client projects, posts — that unlocks step by step, or a single achievement.
          </p>
          <div className="ach-empty-actions">{newButtons}</div>
        </div>
      )}

      {editor && (
        <AchievementEditor a={editor.a} group={editor.group} groups={groups.map((g) => g.name)} metrics={metrics} pack={data.pack} ideas={data.ideas} existing={list}
          onClose={() => setEditor(null)} onDelete={remove}
          onSaved={(unlocked) => { setEditor(null); reload(unlocked); }} />
      )}
      {series && (
        <AchievementSeries groups={groups.map((g) => g.name)} metrics={metrics} existing={list} onClose={() => setSeries(false)}
          onSaved={(d) => { setSeries(false); take(d); toast(`${d.added} achievement${d.added === 1 ? '' : 's'} added`); }} />
      )}
      {celebrate && <Celebration {...celebrate} metrics={metrics} onClose={() => setCelebrate(null)} />}
    </div>
  );
}

/** The moment: the card(s) just unlocked, the XP — and the new rank. */
function Celebration({ list, rankUp, metrics, onClose }) {
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
        {rankUp && (
          <div className="ach-celebrate-rank" style={{ '--rc': RARITIES[rankUp.tier].color }}>
            <RankEmblem rank={rankUp} size={46} /><span><small>New rank</small><b>{rankUp.label}</b></span>
          </div>
        )}
        <button type="button" className="btn btn-primary" onClick={onClose}>Nice!</button>
      </div>
    </div>
  );
}
