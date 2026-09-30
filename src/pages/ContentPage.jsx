import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus, Megaphone, Search, X, ChevronLeft, ChevronRight, CalendarDays, Columns3, List, Clock, Eye, Heart, Grid3x3, Play,
  Clapperboard, Images, Tag, CalendarClock, Layers, Check, ChevronDown, PencilRuler, Box, Library, BookMarked, BarChart3,
} from 'lucide-react';
import { api } from '../lib/api.js';
import { tagColor } from '../lib/types.js';
import { isTouch } from '../lib/useMedia.js';
import {
  PLATFORMS, FORMATS, STATUSES, statusOf, dayKey, fmtDay, fmtNum, coverOf, pillarOf, freeSlots, postsInWeek, mondayOf, goalOf,
} from '../lib/content.js';
import Menu from '../components/Menu.jsx';
import ContentPlanDialog from '../components/content/ContentPlanDialog.jsx';
import MakePostDialog from '../components/content/MakePostDialog.jsx';
import LibraryDialog from '../components/content/LibraryDialog.jsx';
import Insights from '../components/content/Insights.jsx';
import { useToast } from '../components/Toast.jsx';
import PlatformIcon from '../components/content/PlatformIcon.jsx';
import PostCover, { AutoCover } from '../components/content/PostCover.jsx';
import { XPost } from '../components/content/PostPreview.jsx';
import useContentSettings, { useContentProfile } from '../components/content/useContentSettings.js';
import { getPref, setPref, usePref } from '../lib/prefs.js';
import '../styles/content.css';

const VIEWS = [
  { key: 'feed', label: 'Feed', icon: Grid3x3 },
  { key: 'board', label: 'Board', icon: Columns3 },
  { key: 'calendar', label: 'Calendar', icon: CalendarDays },
  { key: 'list', label: 'List', icon: List },
  { key: 'insights', label: 'Insights', icon: BarChart3 },
];
const WEEKDAYS = Array.from({ length: 7 }, (_, i) => new Date(2024, 0, 1 + i).toLocaleDateString(undefined, { weekday: 'short' })); // 1 Jan 2024 was a Monday
const POSTED_SHOWN = 12;
// Your pillars and rhythm, for every view on the page.
const PlanCtx = createContext({ pillars: [], rhythm: { goal: 0, slots: [] } });
const usePillar = (id) => pillarOf(useContext(PlanCtx).pillars, id);
const PillarTag = ({ id }) => {
  const p = usePillar(id);
  return p ? <span className="ctp-pillar" style={{ '--pc': tagColor(p.color).fg }}>{p.name || 'Pillar'}</span> : null;
};

const matches = (c, needle) => !needle || [c.title, c.hook, c.caption, c.hashtags, c.script, c.notes, ...(c.beats || []).map((b) => `${b.text} ${b.screen}`), ...Object.values(c.captions || {})].join('\n').toLowerCase().includes(needle);
// Planned ones by the day they go out (undated ones after), posted ones newest first.
const planOrder = (a, b) => {
  const pa = a.status === 'posted'; const pb = b.status === 'posted';
  if (pa !== pb) return pa ? 1 : -1;
  if (pa) return `${b.date}${b.time}`.localeCompare(`${a.date}${a.time}`) || b.postedAt - a.postedAt;
  if (!!a.date !== !!b.date) return a.date ? -1 : 1;
  return `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`) || b.updatedAt - a.updatedAt;
};

/**
 * Content: posts for Instagram, TikTok / Reels and X (YouTube, LinkedIn too),
 * from the idea to the numbers. The feed (the profile grid as it'll look), a
 * board by stage, a month calendar with your rhythm's free slots, a list and
 * insights — plus your pillars and rhythm, the library of hooks / hashtags /
 * calls to action, and new posts made from projects, storyboards, mockups.
 */
export default function ContentPage({ reloadKey }) {
  const navigate = useNavigate();
  const toast = useToast();
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);
  const [view, setView] = usePref('contentView', 'feed', (v) => VIEWS.some((x) => x.key === v));
  const [platform, setPlatform] = usePref('contentPlatform', '', (v) => !!PLATFORMS[v]);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [changed, setChanged] = useState(0);
  const [profile] = useContentProfile();
  const [cs] = useContentSettings();
  const [pillar, setPillar] = usePref('contentPillar', '');
  const [planOpen, setPlanOpen] = useState(false);
  const [fromKind, setFromKind] = useState(null);
  const [libOpen, setLibOpen] = useState(false);
  const plan = useMemo(() => ({ pillars: cs.contentPillars, rhythm: cs.contentRhythm }), [cs.contentPillars, cs.contentRhythm]);

  useEffect(() => {
    const on = () => setChanged((n) => n + 1);
    window.addEventListener('content:changed', on);
    return () => window.removeEventListener('content:changed', on);
  }, []);
  useEffect(() => {
    let alive = true;
    api.listContent().then((l) => { if (alive) setItems(l); }).catch((e) => { if (alive) setError(e.message); });
    return () => { alive = false; };
  }, [reloadKey, changed]);

  const create = async (fields = {}, open = true) => {
    if (busy) return null;
    setBusy(true);
    try {
      const c = await api.createContent({ platforms: platform ? [platform] : [], ...fields });
      if (open) navigate(`/content/${c.id}`, { state: { fresh: true } });
      else { setItems((l) => [c, ...(l || [])]); setBusy(false); }
      return c;
    } catch (e) { toast(`Could not add a post: ${e.message}`, 'error'); setBusy(false); return null; }
  };
  // Optimistic: the card moves right away, the server answers with the whole post (posted → its date).
  const update = async (id, fields) => {
    const before = items;
    setItems((l) => l.map((c) => (c.id === id ? { ...c, ...fields } : c)));
    try { const saved = await api.updateContent(id, fields); setItems((l) => l.map((c) => (c.id === id ? saved : c))); }
    catch (e) { setItems(before); toast(`Could not move it: ${e.message}`, 'error'); }
  };
  // Two posts trade their days (the feed's order) — with Undo.
  const swap = async (a, b) => {
    const ta = { date: a.date, time: a.time }; const tb = { date: b.date, time: b.time };
    await Promise.all([update(a.id, tb), update(b.id, ta)]);
    toast(b.date && !a.date ? `“${b.title || 'Untitled post'}” is not scheduled now` : 'Swapped their days', 'ok', {
      label: 'Undo', onClick: () => Promise.all([update(a.id, ta), update(b.id, tb)]),
    });
  };

  const needle = q.trim().toLowerCase();
  const pillarOn = pillar === 'none' || plan.pillars.some((p) => p.id === pillar) ? pillar : '';
  const shown = useMemo(() => (items || []).filter((c) => (!platform || c.platforms.includes(platform))
    && (!pillarOn || (pillarOn === 'none' ? !pillarOf(plan.pillars, c.pillar) : c.pillar === pillarOn)) && matches(c, needle)), [items, platform, pillarOn, plan.pillars, needle]);
  const today = dayKey();
  const stats = useMemo(() => {
    const all = items || [];
    const month = today.slice(0, 7);
    const week = dayKey(new Date(Date.now() + 7 * 864e5));
    return {
      ideas: all.filter((c) => c.status === 'idea').length,
      working: all.filter((c) => c.status === 'script' || c.status === 'production').length,
      week: all.filter((c) => c.status !== 'posted' && c.date && c.date >= today && c.date <= week).length,
      posted: all.filter((c) => c.status === 'posted' && c.date.startsWith(month)).length,
      next: all.filter((c) => c.status !== 'posted' && c.date >= today).sort(planOrder)[0] || null,
      thisWeek: postsInWeek(all, mondayOf(today)).length,
      goal: goalOf(plan.rhythm),
      slot: freeSlots(all, plan.rhythm, today, 14)[0] || null,
    };
  }, [items, today, plan.rhythm]);
  const pillarLabel = pillarOn === 'none' ? 'No pillar' : pillarOf(plan.pillars, pillarOn)?.name || 'All pillars';

  return (
    <div className="ctp-page">
      <div className="page-head-row">
        <div className="page-head">
          <h1>Content</h1>
          <p>Plan posts for Instagram, TikTok / Reels and X — from the idea to the numbers.</p>
        </div>
        <div className="ctp-head-tools">
          <button type="button" className="btn" onClick={() => setLibOpen(true)} title="Your hooks, hashtag sets and calls to action"><BookMarked size={16} /> <span className="ctp-hide-s">Library</span></button>
          <button type="button" className="btn" onClick={() => setPlanOpen(true)} title="Your pillars and posting rhythm"><CalendarClock size={16} /> <span className="ctp-hide-s">Rhythm</span></button>
          <div className="ctp-new">
            <button type="button" className="btn btn-primary" onClick={() => create()} disabled={busy}><Plus size={16} /> New post</button>
            <Menu align="right" title="New post from"
              trigger={<button type="button" className="btn btn-primary ctp-new-more" aria-label="New post from…"><ChevronDown size={16} /></button>}
              items={[
                { heading: 'New post from…' },
                { label: 'A project', icon: <PencilRuler size={15} />, onClick: () => setFromKind('plan') },
                { label: 'A storyboard', icon: <Clapperboard size={15} />, onClick: () => setFromKind('storyboard') },
                { label: 'A mockup', icon: <Box size={15} />, onClick: () => setFromKind('mockup') },
                { label: 'A reference or picture', icon: <Library size={15} />, onClick: () => setFromKind('media') },
              ]} />
          </div>
        </div>
      </div>
      {error && <div className="center-msg">Couldn’t load: {error}</div>}
      {!items && !error && <div className="spinner" />}
      {items && (items.length ? (
        <>
          <div className="ctp-stats">
            <div><b>{stats.ideas}</b><span>Ideas</span></div>
            <div><b>{stats.working}</b><span>In the works</span></div>
            <div><b>{stats.week}</b><span>Next 7 days</span></div>
            <div><b>{stats.posted}</b><span>Posted this month</span></div>
            {stats.goal > 0 && (
              <button type="button" className={`ctp-week ${stats.thisWeek >= stats.goal ? 'met' : ''}`} onClick={() => setPlanOpen(true)} title="Your rhythm">
                <b>{stats.thisWeek} <small>/ {stats.goal}</small></b>
                <span className="ctp-week-dots">{Array.from({ length: Math.min(stats.goal, 14) }, (_, i) => <i key={i} className={i < stats.thisWeek ? 'on' : ''} />)}</span>
                <span>This week{stats.thisWeek >= stats.goal ? <> <Check size={11} /></> : ''}</span>
              </button>
            )}
            {stats.next && (
              <button type="button" className="ctp-next" onClick={() => navigate(`/content/${stats.next.id}`)}>
                <span>Next up · {stats.next.date === today ? 'today' : fmtDay(stats.next.date)}{stats.next.time ? ` ${stats.next.time}` : ''}</span>
                <b>{stats.next.title || 'Untitled post'}</b>
              </button>
            )}
          </div>

          <div className="ctp-tools">
            <div className="segmented" role="group" aria-label="View">
              {VIEWS.map((v) => <button key={v.key} type="button" className={view === v.key ? 'on' : ''} onClick={() => setView(v.key)} aria-label={v.label} title={v.label}><v.icon size={14} /> <span className="ctp-view-label">{v.label}</span></button>)}
            </div>
            <div className="ctp-plats" role="group" aria-label="Platform">
              <button type="button" className={`chip ${!platform ? 'on' : ''}`} onClick={() => setPlatform('')}>All</button>
              {Object.entries(PLATFORMS).map(([k, p]) => (
                <button key={k} type="button" className={`chip ${platform === k ? 'on' : ''}`} onClick={() => setPlatform(platform === k ? '' : k)} title={p.label}>
                  <PlatformIcon platform={k} size={13} /> <span className="ctp-plat-label">{p.label}</span>
                </button>
              ))}
            </div>
            {plan.pillars.length > 0 && (
              <Menu title="Pillar" trigger={<button type="button" className={`chip ctp-pillar-pick ${pillarOn ? 'on' : ''}`}><Layers size={13} /> {pillarLabel}</button>}
                items={[
                  { label: 'All pillars', checked: !pillarOn, onClick: () => setPillar('') },
                  ...plan.pillars.map((p) => ({ label: p.name || 'Untitled pillar', checked: pillarOn === p.id, icon: <span className="status-dot" style={{ background: tagColor(p.color).fg }} />, onClick: () => setPillar(p.id) })),
                  { label: 'No pillar', checked: pillarOn === 'none', onClick: () => setPillar('none') },
                  { separator: true },
                  { label: 'Edit pillars…', icon: <Layers size={14} />, onClick: () => setPlanOpen(true) },
                ]} />
            )}
            <label className="clients-search ctp-search"><Search size={15} />
              <input value={q} placeholder="Find a post…" onChange={(e) => setQ(e.target.value)} aria-label="Find a post" />
              {q && <button type="button" className="icon-btn" onClick={() => setQ('')} aria-label="Clear"><X size={14} /></button>}
            </label>
          </div>

          <PlanCtx.Provider value={plan}>
          {view === 'feed' && <Feed items={shown} all={items} platform={platform} today={today} profile={profile} onOpen={(c) => navigate(`/content/${c.id}`)} onMove={update} onSwap={swap} onCreate={create} busy={busy} />}
          {view === 'board' && <Board items={shown} today={today} onOpen={(c) => navigate(`/content/${c.id}`)} onMove={update} onCreate={create} busy={busy} />}
          {view === 'calendar' && <Calendar items={shown} all={items} today={today} onOpen={(c) => navigate(`/content/${c.id}`)} onMove={update} onCreate={create} busy={busy} />}
          {view === 'list' && <ListView items={shown} today={today} onOpen={(c) => navigate(`/content/${c.id}`)} onMove={update} />}
          {view === 'insights' && <Insights items={shown} all={items} pillars={plan.pillars} rhythm={plan.rhythm} today={today} onOpen={(c) => navigate(`/content/${c.id}`)} />}
          </PlanCtx.Provider>
          {(needle || platform) && !shown.length && view !== 'insights' && <div className="hint">No post {needle ? `contains “${q.trim()}”` : ''}{needle && platform ? ' on ' : platform ? 'for ' : ''}{platform ? PLATFORMS[platform].label : ''}.</div>}
        </>
      ) : (
        <div className="empty">
          <Megaphone size={30} />
          <h3>No posts planned yet</h3>
          <p>Collect ideas, write hooks and captions, schedule them — and note how they did once they’re out.</p>
          <button className="btn btn-primary" onClick={() => create()} disabled={busy}><Plus size={16} /> New post</button>
        </div>
      ))}
      {planOpen && <ContentPlanDialog items={items || []} onClose={() => setPlanOpen(false)} />}
      {fromKind && <MakePostDialog initial={fromKind} onClose={() => setFromKind(null)} />}
      {libOpen && <LibraryDialog items={items || []} onClose={() => setLibOpen(false)} />}
    </div>
  );
}

const Plats = ({ c }) => (c.platforms.length ? (
  <span className="ctp-card-plats">{c.platforms.map((p) => <PlatformIcon key={p} platform={p} size={12} title={PLATFORMS[p]?.label} />)}</span>
) : null);

const When = ({ c, today }) => {
  if (!c.date) return null;
  const late = c.status !== 'posted' && c.date < today;
  return (
    <span className={`ctp-when ${late ? 'late' : c.date === today ? 'today' : ''}`} title={late ? 'The day has passed' : undefined}>
      <CalendarDays size={11} /> {c.date === today ? 'Today' : fmtDay(c.date)}{c.time ? ` · ${c.time}` : ''}
    </span>
  );
};

function Card({ c, today, onOpen, dragging, setDragging }) {
  const col = c.color ? tagColor(c.color) : null;
  // Past the idea and still no picture: the hook, big, as its cover.
  const typed = !coverOf(c) && c.status !== 'idea' && !!c.hook.trim();
  return (
    <button type="button" className={`ctp-card ${dragging === c.id ? 'moving' : ''}`} draggable={!isTouch()}
      onDragStart={(e) => { setDragging(c.id); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', c.id); }}
      onDragEnd={() => setDragging(null)}
      onClick={() => onOpen(c)} style={col ? { '--line': col.fg } : undefined}>
      {coverOf(c) ? <PostCover c={c} className="ctp-card-cover" />
        : typed ? <span className="ct-cover ctp-card-cover typed"><AutoCover c={c} text={c.hook} /></span> : null}
      <span className="ctp-card-body">
        <b className={c.title ? '' : 'untitled'}>{c.title || 'Untitled post'}</b>
        {c.hook && !typed && <span className="ctp-card-hook">{c.hook}</span>}
        <span className="ctp-card-meta">
          <PillarTag id={c.pillar} />
          <Plats c={c} />
          <span className="ctp-fmt">{FORMATS[c.format]?.label}</span>
          <When c={c} today={today} />
          {c.status === 'posted' && c.metrics.views != null && <span className="ctp-num"><Eye size={11} /> {fmtNum(c.metrics.views)}</span>}
          {c.status === 'posted' && c.metrics.likes != null && <span className="ctp-num"><Heart size={11} /> {fmtNum(c.metrics.likes)}</span>}
        </span>
      </span>
    </button>
  );
}

// ---- Feed: how the profile grid will look ---------------------------------------
const NOT_IN_GRID = ['story', 'text', 'thread'];
const newest = (a, b) => `${b.date}${b.time}`.localeCompare(`${a.date}${a.time}`) || (b.postedAt || b.updatedAt) - (a.postedAt || a.updatedAt);
const nextDay = (iso) => { const [y, m, d] = iso.split('-').map(Number); return dayKey(new Date(y, m - 1, d + 1)); };

/**
 * The profile grid as it'll look: what's planned on top (the latest first,
 * like the app shows it), what's out below. Drag a planned post onto another
 * to trade their days; drop one on "Next" to give it the next free day.
 * With X picked: the timeline.
 */
function Feed({ items, all, platform, today, profile, onOpen, onMove, onSwap, onCreate, busy }) {
  const { pillars, rhythm } = useContext(PlanCtx);
  const [dragging, setDragging] = useState(null);
  const [over, setOver] = useState(null);
  const [clean, setCleanState] = useState(() => getPref('contentFeedClean') === '1');
  const setClean = (v) => { setCleanState(v); setPref('contentFeedClean', v ? '1' : ''); };
  if (platform === 'x') return <XTimeline items={items} today={today} profile={profile} onOpen={onOpen} />;

  const inGrid = items.filter((c) => !NOT_IN_GRID.includes(c.format));
  const planned = inGrid.filter((c) => c.status !== 'posted' && c.date).sort(newest);
  const posted = inGrid.filter((c) => c.status === 'posted').sort(newest);
  const loose = items.filter((c) => c.status !== 'posted' && !c.date).sort(planOrder);
  const latest = planned[0]?.date;
  // The next free slot of your rhythm — else the day after the last planned one.
  const slot = freeSlots(all, rhythm, today, 56)[0] || null;
  const next = slot?.date || (latest && latest >= today ? nextDay(latest) : today);
  const slotPillar = pillarOf(pillars, slot?.pillar);
  const dragged = items.find((x) => x.id === dragging);
  const end = () => { setDragging(null); setOver(null); };
  const dropOn = (target) => {
    const c = dragged; end();
    if (!c || c.id === target.id) return;
    onSwap(c, target);
  };
  const dragProps = (c) => (isTouch() || c.status === 'posted' ? {} : {
    draggable: true,
    onDragStart: (e) => { setDragging(c.id); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', c.id); },
    onDragEnd: end,
  });
  const tile = (c) => {
    const s = statusOf(c.status);
    const done = c.status === 'posted';
    const late = !done && c.date < today;
    return (
      <button key={c.id} type="button" className={`ctp-tile ${done ? 'posted' : 'planned'} ${dragging === c.id ? 'moving' : ''} ${over === c.id ? 'over' : ''}`}
        onClick={() => onOpen(c)} {...dragProps(c)}
        onDragOver={(e) => { if (dragged && !done && dragged.id !== c.id) { e.preventDefault(); setOver(c.id); } }}
        onDragLeave={() => setOver((o) => (o === c.id ? null : o))}
        onDrop={(e) => { e.preventDefault(); dropOn(c); }}
        title={`${c.title || 'Untitled post'} · ${s.one}${c.date ? ` · ${fmtDay(c.date)}` : ''}`}>
        <PostCover c={c} badges={false} />
        {c.format === 'reel' || c.format === 'video' ? <Clapperboard size={15} className="ctp-tile-kind" /> : c.format === 'carousel' && c.media.length > 1 ? <Images size={15} className="ctp-tile-kind" /> : null}
        {done && c.metrics.views != null && <span className="ctp-tile-views"><Play size={11} fill="currentColor" /> {fmtNum(c.metrics.views)}</span>}
        {!clean && pillarOf(pillars, c.pillar) && <i className="ctp-tile-pillar" style={{ background: tagColor(pillarOf(pillars, c.pillar).color).fg }} title={pillarOf(pillars, c.pillar).name} />}
        {!done && !clean && (
          <span className={`ctp-tile-when ${late ? 'late' : c.date === today ? 'today' : ''}`}>
            <i style={{ background: s.color }} />{c.date === today ? 'Today' : fmtDay(c.date, { weekday: 'short', day: 'numeric', month: 'short' })}
          </span>
        )}
      </button>
    );
  };

  return (
    <div className="ctp-feed-wrap">
      <div className="ctp-feed">
        <div className="ctp-feed-head">
          <span className="ctp-feed-av">{(profile.name || profile.handle || 'Y').trim()[0]?.toUpperCase()}</span>
          <span className="ctp-feed-who">
            <b>{profile.handle ? `@${profile.handle}` : 'Your profile'}{platform ? <> · <PlatformIcon platform={platform} size={13} /> {PLATFORMS[platform].label}</> : null}</b>
            <span><b>{posted.length}</b> posted · <b>{planned.length}</b> planned{loose.length ? <> · <b>{loose.length}</b> without a day</> : null}</span>
          </span>
          <label className="ctp-feed-clean" title="Hide the labels to see the grid as others will">
            <input type="checkbox" checked={clean} onChange={(e) => setClean(e.target.checked)} /> Clean look
          </label>
        </div>
        <div className="ctp-grid">
          <button type="button" className={`ctp-tile ctp-tile-next ${over === 'next' ? 'over' : ''}`} disabled={busy}
            onClick={() => onCreate({ date: next, time: slot?.time || '', pillar: slot?.pillar || null, format: 'reel', status: 'idea' })}
            onDragOver={(e) => { if (dragged && dragged.status !== 'posted') { e.preventDefault(); setOver('next'); } }}
            onDragLeave={() => setOver((o) => (o === 'next' ? null : o))}
            onDrop={(e) => {
              e.preventDefault(); const c = dragged; end();
              if (c && (c.date !== next || (slot?.time && c.time !== slot.time))) onMove(c.id, { date: next, ...(slot?.time ? { time: slot.time } : {}), ...(slotPillar && !c.pillar ? { pillar: slotPillar.id } : {}) });
            }}
            style={slotPillar ? { '--pc': tagColor(slotPillar.color).fg } : undefined}>
            <Plus size={20} />
            <b>{slot ? 'Next slot' : 'Next post'}</b>
            <span>{next === today ? 'Today' : fmtDay(next)}{slot?.time ? ` · ${slot.time}` : ''}</span>
            {slotPillar && <span className="ctp-tile-next-pillar">{slotPillar.name}</span>}
          </button>
          {planned.map(tile)}
          {planned.length > 0 && posted.length > 0 && !clean && <div className="ctp-grid-line"><span>↑ planned · posted ↓</span></div>}
          {posted.map(tile)}
        </div>
        {!inGrid.length && <div className="hint ctp-feed-empty">Give a post a day to see it in the grid — stories, text posts and threads aren’t shown here.</div>}
      </div>
      <aside className={`ctp-unscheduled ${over === 'none' ? 'over' : ''}`}
        onDragOver={(e) => { if (dragged && dragged.date && dragged.status !== 'posted') { e.preventDefault(); setOver('none'); } }}
        onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOver(null); }}
        onDrop={(e) => { e.preventDefault(); const c = dragged; end(); if (c && c.date && c.status !== 'posted') onMove(c.id, { date: '', time: '' }); }}>
        <div className={`ctp-unscheduled-head ${over === 'none' ? 'over' : ''}`}><Clock size={13} /> Without a day <span className="count">{loose.length}</span></div>
        <p className="hint">{isTouch() ? 'Open a post to give it a day.' : 'Drag one onto “Next post” or onto a planned one to take its day.'}</p>
        <div className="ctp-loose">
          {loose.map((c) => (
            <button key={c.id} type="button" className={`ctp-loose-item ${dragging === c.id ? 'moving' : ''}`} onClick={() => onOpen(c)} {...dragProps(c)}>
              <PostCover c={c} badges={false} />
              <span><b className={c.title ? '' : 'untitled'}>{c.title || 'Untitled post'}</b><small><i style={{ background: statusOf(c.status).color }} />{statusOf(c.status).one} · {FORMATS[c.format]?.label}</small></span>
            </button>
          ))}
        </div>
      </aside>
    </div>
  );
}

/** X: the posts as they'll read on the timeline — planned ones first. */
function XTimeline({ items, today, profile, onOpen }) {
  const planned = items.filter((c) => c.status !== 'posted').sort(planOrder);
  const posted = items.filter((c) => c.status === 'posted').sort(newest);
  const row = (c) => (
    <div key={c.id} className="ctp-xrow" role="button" tabIndex={0} onClick={() => onOpen(c)} onKeyDown={(e) => { if (e.key === 'Enter') onOpen(c); }}>
      <span className="ctp-xrow-meta">
        <i style={{ background: statusOf(c.status).color }} />{statusOf(c.status).one}
        {c.date && <> · {c.date === today ? 'Today' : fmtDay(c.date)}{c.time ? ` ${c.time}` : ''}</>}
        {c.title && <b> · {c.title}</b>}
      </span>
      <XPost c={c} profile={profile} />
    </div>
  );
  return (
    <div className="ctp-xline">
      {!items.length && <div className="hint">No post for X yet.</div>}
      {planned.length > 0 && <div className="ctp-xline-head"><Tag size={13} /> Coming up</div>}
      {planned.map(row)}
      {posted.length > 0 && <div className="ctp-xline-head">Posted</div>}
      {posted.map(row)}
    </div>
  );
}

function Board({ items, today, onOpen, onMove, onCreate, busy }) {
  const [dragging, setDragging] = useState(null);
  const [over, setOver] = useState(null);
  const [idea, setIdea] = useState('');
  const [allPosted, setAllPosted] = useState(false);
  const addIdea = async (e) => {
    e.preventDefault();
    const title = idea.trim();
    if (!title) return;
    if (await onCreate({ title, status: 'idea' }, false)) setIdea('');
  };
  return (
    <div className="ctp-board">
      {STATUSES.map((s) => {
        const list = items.filter((c) => c.status === s.key).sort(planOrder);
        const cut = s.key === 'posted' && !allPosted && list.length > POSTED_SHOWN;
        return (
          <section key={s.key} className={`ctp-col ctp-col-${s.key} ${over === s.key ? 'over' : ''}`}
            onDragOver={(e) => { if (dragging) { e.preventDefault(); setOver(s.key); } }}
            onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOver(null); }}
            onDrop={(e) => {
              e.preventDefault(); setOver(null);
              const c = items.find((x) => x.id === dragging);
              setDragging(null);
              if (c && c.status !== s.key) onMove(c.id, { status: s.key });
            }}>
            <header className="ctp-col-head">
              <span className="status-dot" style={{ background: s.color }} /> <b>{s.label}</b> <span className="count">{list.length}</span>
              {s.key !== 'idea' && (
                <button type="button" className="icon-btn" onClick={() => onCreate({ status: s.key })} disabled={busy} aria-label={`New post in ${s.label}`} title={`New post in “${s.label}”`}><Plus size={15} /></button>
              )}
            </header>
            {s.key === 'idea' && (
              <form className="ctp-quick" onSubmit={addIdea}>
                <Plus size={14} />
                <input value={idea} onChange={(e) => setIdea(e.target.value)} placeholder="Quick idea… (Enter)" aria-label="Quick idea" disabled={busy} />
              </form>
            )}
            <div className="ctp-col-cards">
              {(cut ? list.slice(0, POSTED_SHOWN) : list).map((c) => <Card key={c.id} c={c} today={today} onOpen={onOpen} dragging={dragging} setDragging={setDragging} />)}
              {cut && <button type="button" className="btn btn-sm btn-ghost" onClick={() => setAllPosted(true)}>Show all {list.length}</button>}
              {!list.length && <div className="ctp-col-empty">{dragging ? 'Drop here' : s.key === 'posted' ? 'Posted ones land here' : '—'}</div>}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function Calendar({ items, all, today, onOpen, onMove, onCreate, busy }) {
  const { pillars, rhythm } = useContext(PlanCtx);
  const [month, setMonth] = useState(() => today.slice(0, 7)); // 'YYYY-MM'
  const [picked, setPicked] = useState(today);
  const [dragging, setDragging] = useState(null);
  const [over, setOver] = useState(null);
  const [y, m] = month.split('-').map(Number);
  const first = new Date(y, m - 1, 1);
  const lead = (first.getDay() + 6) % 7; // Monday first
  const days = new Date(y, m, 0).getDate();
  const cells = Array.from({ length: Math.ceil((lead + days) / 7) * 7 }, (_, i) => dayKey(new Date(y, m - 1, i - lead + 1)));
  const byDay = useMemo(() => {
    const map = {};
    for (const c of items) if (c.date) (map[c.date] ||= []).push(c);
    for (const k of Object.keys(map)) map[k].sort((a, b) => (a.time || '99').localeCompare(b.time || '99'));
    return map;
  }, [items]);
  // Your rhythm's free slots (on the days still to come).
  const slotsByDay = useMemo(() => {
    const map = {};
    for (const x of freeSlots(all, rhythm, today, 120)) (map[x.date] ||= []).push(x);
    return map;
  }, [all, rhythm, today]);
  const slotChip = (x, big = false) => {
    const p = pillarOf(pillars, x.pillar);
    return (
      <button key={x.id} type="button" className={`ctp-slot ${big ? 'big' : ''}`} disabled={busy} style={p ? { '--pc': tagColor(p.color).fg } : undefined}
        onClick={(e) => { e.stopPropagation(); onCreate({ date: x.date, time: x.time, pillar: x.pillar, status: 'idea' }); }}
        title={`Free slot${x.time ? ` at ${x.time}` : ''}${p ? ` · ${p.name}` : ''} — plan a post for it`}>
        <Plus size={11} />{x.time && <span className="ctp-chip-time">{x.time}</span>}<span className="ctp-chip-title">{p ? p.name : big ? 'Free slot — plan a post' : 'Free slot'}</span>
      </button>
    );
  };
  const unscheduled = items.filter((c) => !c.date && c.status !== 'posted').sort(planOrder);
  const shift = (n) => { const d = new Date(y, m - 1 + n, 1); setMonth(dayKey(d).slice(0, 7)); };
  const drop = (day) => {
    const c = items.find((x) => x.id === dragging);
    setDragging(null); setOver(null);
    if (c && c.date !== day) onMove(c.id, { date: day });
  };
  const chip = (c) => {
    const s = statusOf(c.status);
    const col = c.color ? tagColor(c.color) : null;
    return (
      <button key={c.id} type="button" className={`ctp-chip ${c.status === 'posted' ? 'done' : ''} ${dragging === c.id ? 'moving' : ''}`} draggable={!isTouch()}
        onDragStart={(e) => { e.stopPropagation(); setDragging(c.id); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', c.id); }}
        onDragEnd={() => setDragging(null)}
        onClick={(e) => { e.stopPropagation(); onOpen(c); }} title={`${c.title || 'Untitled post'} · ${s.one}`}
        style={{ '--st': col ? col.fg : s.color }}>
        {c.time && <span className="ctp-chip-time">{c.time}</span>}
        <span className="ctp-chip-title">{c.title || 'Untitled'}</span>
        <Plats c={c} />
      </button>
    );
  };
  const pickedList = byDay[picked] || [];
  return (
    <div className="ctp-cal-wrap">
      <div className="ctp-cal">
        <div className="ctp-cal-head">
          <button type="button" className="icon-btn" onClick={() => shift(-1)} aria-label="Previous month"><ChevronLeft size={16} /></button>
          <b>{first.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</b>
          <button type="button" className="icon-btn" onClick={() => shift(1)} aria-label="Next month"><ChevronRight size={16} /></button>
          {month !== today.slice(0, 7) && <button type="button" className="btn btn-sm btn-ghost" onClick={() => { setMonth(today.slice(0, 7)); setPicked(today); }}>Today</button>}
        </div>
        <div className="ctp-cal-grid">
          {WEEKDAYS.map((w) => <div key={w} className="ctp-cal-wd">{w}</div>)}
          {cells.map((day) => {
            const list = byDay[day] || [];
            const out = day.slice(0, 7) !== month;
            return (
              <div key={day} role="button" tabIndex={0} aria-label={`${fmtDay(day, { weekday: 'long', day: 'numeric', month: 'long' })}${list.length ? `, ${list.length} post${list.length > 1 ? 's' : ''}` : ''}`}
                className={`ctp-day ${out ? 'out' : ''} ${day === today ? 'today' : ''} ${day === picked ? 'picked' : ''} ${over === day ? 'over' : ''} ${day < today ? 'past' : ''}`}
                onClick={() => setPicked(day)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setPicked(day); } }}
                onDragOver={(e) => { if (dragging) { e.preventDefault(); setOver(day); } }}
                onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOver(null); }}
                onDrop={(e) => { e.preventDefault(); drop(day); }}>
                <span className="ctp-day-n">{Number(day.slice(8))}</span>
                <button type="button" className="ctp-day-add" onClick={(e) => { e.stopPropagation(); onCreate({ date: day }); }} disabled={busy} aria-label="New post on this day" title="New post on this day"><Plus size={13} /></button>
                <div className="ctp-day-list">{list.map(chip)}{(slotsByDay[day] || []).map((x) => slotChip(x))}</div>
                {(list.length > 0 || slotsByDay[day]) && (
                  <span className="ctp-day-dots">
                    {list.slice(0, 4).map((c) => <i key={c.id} style={{ background: statusOf(c.status).color }} />)}
                    {(slotsByDay[day] || []).slice(0, 2).map((x) => <i key={x.id} className="slot" />)}
                  </span>
                )}
              </div>
            );
          })}
        </div>
        <div className="ctp-day-panel">
          <div className="ctp-day-panel-head">
            <b>{picked === today ? 'Today' : fmtDay(picked, { weekday: 'long', day: 'numeric', month: 'long' })}</b>
            <button type="button" className="btn btn-sm" onClick={() => onCreate({ date: picked })} disabled={busy}><Plus size={14} /> Post on this day</button>
          </div>
          {pickedList.length || slotsByDay[picked] ? (
            <div className="ctp-day-panel-list">{pickedList.map(chip)}{(slotsByDay[picked] || []).map((x) => slotChip(x, true))}</div>
          ) : <div className="hint">Nothing planned for this day.</div>}
        </div>
      </div>
      <aside className="ctp-unscheduled"
        onDragOver={(e) => { if (dragging) { e.preventDefault(); setOver('none'); } }}
        onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOver(null); }}
        onDrop={(e) => {
          e.preventDefault();
          const c = items.find((x) => x.id === dragging);
          setDragging(null); setOver(null);
          if (c && c.date && c.status !== 'posted') onMove(c.id, { date: '', time: '' });
        }}>
        <div className={`ctp-unscheduled-head ${over === 'none' ? 'over' : ''}`}><Clock size={13} /> Not scheduled <span className="count">{unscheduled.length}</span></div>
        <p className="hint">{isTouch() ? 'Open a post to give it a day.' : 'Drag a post onto a day — or back here to unschedule it.'}</p>
        <div className="ctp-unscheduled-list">{unscheduled.map(chip)}</div>
      </aside>
    </div>
  );
}

function ListView({ items, today, onOpen, onMove }) {
  const list = [...items].sort(planOrder);
  return (
    <div className="ctp-list">
      {list.map((c) => {
        const s = statusOf(c.status);
        return (
          <div key={c.id} className="ctp-row" role="button" tabIndex={0} onClick={() => onOpen(c)} onKeyDown={(e) => { if (e.key === 'Enter') onOpen(c); }}>
            <span className="ctp-row-thumb">{coverOf(c) ? <PostCover c={c} badges={false} /> : <AutoCover c={c} text="" />}</span>
            <span className="ctp-row-main">
              <b className={c.title ? '' : 'untitled'}>{c.title || 'Untitled post'}</b>
              <span className="ctp-card-meta"><PillarTag id={c.pillar} /><Plats c={c} /><span className="ctp-fmt">{FORMATS[c.format]?.label}</span><When c={c} today={today} /></span>
            </span>
            {c.status === 'posted' && (c.metrics.views != null || c.metrics.likes != null) && (
              <span className="ctp-row-nums">
                {c.metrics.views != null && <span className="ctp-num"><Eye size={12} /> {fmtNum(c.metrics.views)}</span>}
                {c.metrics.likes != null && <span className="ctp-num"><Heart size={12} /> {fmtNum(c.metrics.likes)}</span>}
              </span>
            )}
            <select className="ctp-row-status" value={c.status} aria-label="Stage" style={{ '--st': s.color }}
              onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()} onChange={(e) => onMove(c.id, { status: e.target.value })}>
              {STATUSES.map((x) => <option key={x.key} value={x.key}>{x.one}</option>)}
            </select>
          </div>
        );
      })}
    </div>
  );
}
