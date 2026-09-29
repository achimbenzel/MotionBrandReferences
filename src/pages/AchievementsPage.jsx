import { useEffect, useMemo, useState } from 'react';
import { Plus, Trophy, Layers, ChevronDown, Swords, CalendarDays, Pencil, ArrowUp, ArrowDown, MoreHorizontal, Check, X } from 'lucide-react';
import { api } from '../lib/api.js';
import { RARITIES, RARITY_ORDER, xpOf, rankOf, fmtValue } from '../lib/achievements.js';
import { isTouch } from '../lib/useMedia.js';
import Menu from '../components/Menu.jsx';
import { useToast } from '../components/Toast.jsx';
import AchievementCard, { RankEmblem } from '../components/achievements/AchievementCard.jsx';
import AchievementEditor from '../components/achievements/AchievementEditor.jsx';
import AchievementSeries from '../components/achievements/AchievementSeries.jsx';
import AchievementStats from '../components/achievements/AchievementStats.jsx';
import AchievementInspect from '../components/achievements/AchievementInspect.jsx';

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
  // Edit on: a click opens the editor and every group has its "Add to …" tile.
  // Off: a click shows the card big (to turn round), and the collection stays just cards.
  const [editMode, setEditModeState] = useState(() => load('achEdit', 'off') === 'on');
  const [inspect, setInspect] = useState(null); // an index into the cards shown
  const [dragging, setDragging] = useState(null); // an achievement id (Edit on: drag to reorder / move)
  const [dropAt, setDropAt] = useState(null);     // { group, before: id | null }
  const [renaming, setRenaming] = useState(null); // a group's name
  const setEditMode = (on) => { setEditModeState(on); store('achEdit', on ? 'on' : 'off'); };
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
  // Cards in a new order / into another group; groups renamed and moved.
  const arrange = async (group, ids) => {
    const rank = new Map();
    for (const a of list) if (!rank.has(a.group)) rank.set(a.group, rank.size);
    if (!rank.has(group)) rank.set(group, rank.size);
    const pos = new Map(ids.map((id, i) => [id, i]));
    setData((d) => ({
      ...d,
      achievements: d.achievements
        .map((a) => (pos.has(a.id) ? { ...a, group, order: pos.get(a.id) } : a.group === group ? { ...a, order: ids.length + a.order } : a))
        .sort((x, y) => rank.get(x.group) - rank.get(y.group) || x.order - y.order),
    }));
    try { setData(await api.arrangeAchievements(group, ids)); } catch (e) { toast(`Could not move it: ${e.message}`, 'error'); reload(); }
  };
  const dropCard = (group, beforeId) => {
    const id = dragging;
    setDragging(null); setDropAt(null);
    if (!id || id === beforeId) return;
    const ids = list.filter((a) => a.group === group && a.id !== id).map((a) => a.id);
    const at = beforeId ? ids.indexOf(beforeId) : ids.length;
    ids.splice(at < 0 ? ids.length : at, 0, id);
    const from = list.find((a) => a.id === id)?.group;
    arrange(group, ids);
    if (from && from !== group) toast(`Moved to “${group}”`);
  };
  const renameGroup = async (from, to) => {
    setRenaming(null);
    const name = to.trim();
    if (!name || name === from) return;
    const merge = groups.some((g) => g.name === name);
    try {
      setData(await api.renameAchievementGroup(from, name));
      toast(merge ? `“${from}” joined “${name}”` : `Renamed to “${name}”`, 'ok', { label: 'Undo', onClick: async () => {
        if (merge) { toast('Move the cards back by dragging them — the two groups are one now'); return; }
        setData(await api.renameAchievementGroup(name, from));
      } });
    } catch (e) { toast(`Could not rename: ${e.message}`, 'error'); }
  };
  const moveGroup = async (name, dir) => {
    const names = groups.map((g) => g.name);
    const i = names.indexOf(name);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= names.length) return;
    [names[i], names[j]] = [names[j], names[i]];
    try { setData(await api.orderAchievementGroups(names)); } catch (e) { toast(e.message, 'error'); }
  };
  const moveCard = async (a, dir) => {
    const ids = list.filter((x) => x.group === a.group).map((x) => x.id);
    const i = ids.indexOf(a.id);
    const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    await arrange(a.group, ids);
  };
  const saveDates = async (dates) => {
    try { setData(await api.setAchievementDates(dates)); toast('Dates saved'); } catch (e) { toast(`Could not save: ${e.message}`, 'error'); }
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
  const cards = groups.flatMap((g) => shown(g.items));
  const open = (a) => (editMode ? setEditor({ a }) : setInspect(cards.findIndex((x) => x.id === a.id)));
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
        <div className="ach-head-tools">
          {list.length > 0 && (
            <button type="button" role="switch" aria-checked={editMode} className={`ach-switch ${editMode ? 'on' : ''}`} onClick={() => setEditMode(!editMode)}
              title={editMode ? 'Edit is on: a click edits a card' : 'Edit is off: a click shows the card big'}>
              <span className="ach-switch-track"><i /></span> Edit
            </button>
          )}
          {newButtons}
        </div>
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
              const gi = groups.indexOf(g);
              const canDrag = editMode && filter === 'all' && !isTouch();
              const dragProps = (a) => (canDrag ? {
                draggable: true,
                onDragStart: (e) => { setDragging(a.id); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', a.id); },
                onDragEnd: () => { setDragging(null); setDropAt(null); },
                onDragOver: (e) => { if (dragging && dragging !== a.id) { e.preventDefault(); e.stopPropagation(); setDropAt({ group: g.name, before: a.id }); } },
                onDrop: (e) => { e.preventDefault(); e.stopPropagation(); dropCard(g.name, a.id); },
              } : undefined);
              return (
                <section key={g.name} className={`ach-group ${dropAt?.group === g.name ? 'drop' : ''}`}
                  onDragOver={(e) => { if (dragging) { e.preventDefault(); setDropAt((d) => (d?.group === g.name ? d : { group: g.name, before: null })); } }}
                  onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDropAt(null); }}
                  onDrop={(e) => { e.preventDefault(); dropCard(g.name, null); }}>
                  <header className="ach-group-head">
                    {renaming === g.name ? (
                      <form className="ach-group-rename" onSubmit={(e) => { e.preventDefault(); renameGroup(g.name, e.currentTarget.elements.name.value); }}>
                        <input name="name" className="input" defaultValue={g.name} maxLength={60} autoFocus aria-label="Group name"
                          onKeyDown={(e) => { if (e.key === 'Escape') setRenaming(null); }} onBlur={(e) => renameGroup(g.name, e.target.value)} />
                        <button type="submit" className="icon-btn" aria-label="Save" onMouseDown={(e) => e.preventDefault()}><Check size={15} /></button>
                        <button type="button" className="icon-btn" aria-label="Cancel" onMouseDown={(e) => e.preventDefault()} onClick={() => setRenaming(null)}><X size={15} /></button>
                      </form>
                    ) : <h2 onDoubleClick={() => editMode && setRenaming(g.name)}>{g.name}</h2>}
                    <span className="ach-group-count">{n} / {g.items.length}</span>
                    <span className="ach-group-bar"><i style={{ width: `${(n / g.items.length) * 100}%` }} /></span>
                    {editMode && renaming !== g.name && (
                      <Menu align="right" title={g.name} trigger={<button type="button" className="icon-btn ach-group-menu" aria-label={`${g.name} — options`}><MoreHorizontal size={16} /></button>}
                        items={[
                          { label: 'Rename group', icon: <Pencil size={15} />, onClick: () => setRenaming(g.name) },
                          { label: 'Move up', icon: <ArrowUp size={15} />, disabled: gi === 0, onClick: () => moveGroup(g.name, -1) },
                          { label: 'Move down', icon: <ArrowDown size={15} />, disabled: gi === groups.length - 1, onClick: () => moveGroup(g.name, 1) },
                        ]} />
                    )}
                  </header>
                  <div className="ach-grid">
                    {items.map((a) => (
                      <AchievementCard key={a.id} a={a} metrics={metrics} glow={glow.has(a.id)} onClick={() => open(a)} drag={dragProps(a)}
                        className={`${dragging === a.id ? 'dragging' : ''} ${dropAt?.before === a.id ? 'drop-before' : ''}`} />
                    ))}
                    {editMode && filter !== 'got' && (
                      <button type="button" className={`ach-add ${dropAt?.group === g.name && !dropAt.before ? 'drop-here' : ''}`} onClick={() => setEditor({ group: g.name })}><Plus size={20} /><span>Add to {g.name}</span></button>
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
          onClose={() => setEditor(null)} onDelete={remove} onMove={(a, dir) => moveCard(a, dir)}
          onSaved={(unlocked) => { setEditor(null); reload(unlocked); }} />
      )}
      {series && (
        <AchievementSeries groups={groups.map((g) => g.name)} metrics={metrics} existing={list} onClose={() => setSeries(false)}
          onSaved={(d) => { setSeries(false); take(d); toast(`${d.added} achievement${d.added === 1 ? '' : 's'} added`); }} />
      )}
      {inspect != null && cards[inspect] && (
        <AchievementInspect list={cards} index={inspect} metrics={metrics} onIndex={setInspect} onClose={() => setInspect(null)}
          onEdit={(a) => { setInspect(null); setEditor({ a }); }} />
      )}
      {celebrate && <Celebration {...celebrate} metrics={metrics} onClose={() => setCelebrate(null)} onDates={saveDates} />}
    </div>
  );
}

/**
 * The moment: the card(s) just unlocked, the XP — and the new rank. A number
 * that unlocks several at once (or one reached a while ago) → "When?": the
 * day each was really reached (they unlock today unless you say otherwise).
 */
function Celebration({ list, rankUp, metrics, onClose, onDates }) {
  const [dating, setDating] = useState(false);
  useEffect(() => {
    const onKey = (e) => { if (dating) return; if (e.key === 'Escape' || e.key === 'Enter') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, dating]);
  const byNumber = list.filter((a) => a.metric);
  if (dating) return <UnlockDates list={byNumber} onClose={onClose} onSave={async (dates) => { await onDates(dates); onClose(); }} />;
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
        <div className="ach-celebrate-actions">
          <button type="button" className="btn btn-primary" onClick={onClose}>Nice!</button>
          {byNumber.length > 0 && (
            <button type="button" className="btn ach-celebrate-when" onMouseDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); setDating(true); }}>
              <CalendarDays size={15} /> {byNumber.length > 1 ? 'Reached on different days? Set the dates' : 'Reached earlier? Set the date'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const todayKey = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

/** The day each one was really reached — one by one, or one day for all. */
function UnlockDates({ list, onClose, onSave }) {
  const sorted = [...list].sort((a, b) => (a.metric === b.metric ? (a.target || 0) - (b.target || 0) : a.metric.localeCompare(b.metric)));
  const [dates, setDates] = useState(() => Object.fromEntries(sorted.map((a) => [a.id, a.achievedAt || todayKey()])));
  const [busy, setBusy] = useState(false);
  const max = todayKey();
  const setAll = (v) => { if (v) setDates(Object.fromEntries(sorted.map((a) => [a.id, v]))); };
  // Reached in order: a later milestone can't be before an earlier one on the same number.
  const wrong = sorted.filter((a, i) => sorted.slice(0, i).some((b) => b.metric === a.metric && dates[b.id] > dates[a.id]));
  const save = async () => { setBusy(true); try { await onSave(dates); } finally { setBusy(false); } };
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal ach-dates" role="dialog" aria-modal="true" aria-label="When were they reached">
        <div className="modal-head">
          <h2><CalendarDays size={18} /> When did you reach {sorted.length > 1 ? 'them' : 'it'}?</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>
        <div className="modal-body">
          <p className="hint">They unlocked today because your number passed them. Set the day each was really reached — the cards and their backs show it.</p>
          {sorted.length > 1 && (
            <label className="ach-dates-all"><span>One day for all</span>
              <input className="input" type="date" max={max} onChange={(e) => setAll(e.target.value)} aria-label="One day for all" />
            </label>
          )}
          <div className="ach-dates-list">
            {sorted.map((a) => (
              <label key={a.id} className={`ach-dates-row ${wrong.includes(a) ? 'wrong' : ''}`} style={{ '--rc': (RARITIES[a.rarity] || RARITIES.stone).color }}>
                <i className="ach-dates-dot" />
                <span className="ach-dates-main"><b>{a.title || 'Untitled'}</b><small>{a.group} · {fmtValue(a.metric, a.target)}</small></span>
                <input className="input" type="date" value={dates[a.id]} max={max} onChange={(e) => setDates((d) => ({ ...d, [a.id]: e.target.value || max }))} aria-label={`${a.title}: reached on`} />
              </label>
            ))}
          </div>
          {wrong.length > 0 && <p className="hint ach-dates-warn">A bigger milestone is set before a smaller one on the same number — check {wrong.map((a) => `“${a.title}”`).join(', ')}.</p>}
        </div>
        <div className="modal-foot">
          <button type="button" className="btn" onClick={onClose}>Keep today</button>
          <button type="button" className="btn btn-primary" onClick={save} disabled={busy}><Check size={15} /> Save dates</button>
        </div>
      </div>
    </div>
  );
}
