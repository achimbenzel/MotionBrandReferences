import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  PencilRuler, ListTodo, FlaskConical, Clapperboard, Plus, ArrowRight, CalendarRange, AppWindow,
  AlertTriangle, Image as ImageIcon, UploadCloud, Database, Flag, CalendarClock, MonitorSmartphone,
  Library, Search, Sparkles, Target, CheckCircle2, Layers, Settings2, GripVertical, EyeOff, Eye, Columns2, RectangleHorizontal, Check,
  MoreHorizontal, Building2, Timer,
} from 'lucide-react';
import { api, planFileUrl, dashboardFileUrl } from '../lib/api.js';
import { gradientCss, PLAN_GRADIENTS, PLAN_STATUSES, TABS, tagColor } from '../lib/types.js';
import Menu from '../components/Menu.jsx';
import { upcomingBirthdays } from '../lib/clients.js';
import { useToast } from '../components/Toast.jsx';
import MediaPicker from '../components/mockups/MediaPicker.jsx';
import ActivityMap from '../components/dashboard/ActivityMap.jsx';
import Inspiration, { withCover } from '../components/dashboard/Inspiration.jsx';
import QuickNote from '../components/dashboard/QuickNote.jsx';
import FocusToday from '../components/dashboard/FocusToday.jsx';
import FocusTimer from '../components/dashboard/FocusTimer.jsx';
import ContinueWork from '../components/dashboard/ContinueWork.jsx';
import { useSortable, moveItem } from '../lib/useSortable.js';

const DEFAULT_BANNER = 'linear-gradient(120deg,#6a11cb,#2575fc)';
// The widgets below the hero, in their first order and size (yours is saved in settings).
const WIDGETS = [
  { id: 'focus', label: 'Today’s focus', size: 'half' },
  { id: 'timer', label: 'Focus timer', size: 'half' },
  { id: 'next', label: 'Next up & two weeks', size: 'full' },
  { id: 'continue', label: 'Continue where you left off', size: 'full' },
  { id: 'urgent', label: 'Urgent', size: 'full' },
  { id: 'tools', label: 'Your tools', size: 'full' },
  { id: 'pipeline', label: 'Pipeline', size: 'full' },
  { id: 'rhythm', label: 'Your rhythm', size: 'full' },
  { id: 'inspiration', label: 'Inspiration', size: 'half' },
  { id: 'note', label: 'Quick note', size: 'half' },
];
const WIDGET = Object.fromEntries(WIDGETS.map((w) => [w.id, w]));
// Your saved order first; widgets added since then join at the end.
function layoutOf(saved) {
  const list = (Array.isArray(saved) ? saved : []).filter((w) => WIDGET[w.id]);
  const have = new Set(list.map((w) => w.id));
  return [...list, ...WIDGETS.filter((w) => !have.has(w.id)).map((w) => ({ id: w.id, hidden: false, size: w.size }))];
}
const DAY = 86400000;

// A yyyy-mm-dd date as a local Date (midnight).
function dateOf(iso) {
  const [y, m, d] = String(iso || '').split('-').map(Number);
  return y && m && d ? new Date(y, m - 1, d) : null;
}
const today0 = () => { const t = new Date(); t.setHours(0, 0, 0, 0); return t; };
const isoOf = (dt) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
// Days from today to a yyyy-mm-dd date (negative = past), in local time.
function daysFromToday(iso) {
  const dt = dateOf(iso);
  return dt ? Math.round((dt - today0()) / DAY) : NaN;
}
const whenLabel = (n) => (n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : n === -1 ? 'Yesterday' : n > 1 ? `In ${n} days` : `${-n} days ago`);
const fmtDay = (iso) => dateOf(iso).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
const DUE_AHEAD = 14; // days ahead shown under "Coming up"
const DUE_BEHIND = 30; // overdue items stay this long
const DONE_LIST = /^(done|erledigt|fertig|finished|complete(d)?)$/i;

const greeting = (h) => (h < 5 ? 'Good night' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening');
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

// How far a plan is through its timeframe (0–1), or null without one.
function elapsed(p) {
  const s = dateOf(p.start); const e = dateOf(p.end);
  if (!s || !e || e <= s) return null;
  return Math.max(0, Math.min(1, (today0() - s) / (e - s)));
}
// Its to-dos (in to-do blocks): done / all.
function todoCount(p) {
  const items = (p.blocks || []).filter((b) => b.type === 'todos').flatMap((b) => b.items || []);
  return { done: items.filter((t) => t.done).length, all: items.length };
}

// Counts up to a number when it first shows (not with reduced motion).
function useCountUp(value, ms = 900) {
  const [shown, setShown] = useState(value);
  const from = useRef(0);
  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { setShown(value); from.current = value; return undefined; }
    const a = from.current; const t0 = performance.now();
    let raf = 0;
    const step = (t) => {
      const k = Math.min(1, (t - t0) / ms);
      setShown(Math.round(a + (value - a) * (1 - (1 - k) ** 3)));
      if (k < 1) raf = requestAnimationFrame(step); else from.current = value;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, ms]);
  return shown;
}

function Stat({ icon: Icon, value, label, tone, ring, onClick }) {
  const n = useCountUp(value);
  return (
    <button type="button" className={`dash-stat ${tone || ''}`} onClick={onClick}>
      {ring != null ? (
        <span className="dash-stat-ring" style={{ '--p': ring }} aria-hidden="true"><Icon size={15} /></span>
      ) : <span className="dash-stat-ico"><Icon size={15} /></span>}
      <span className="dash-stat-body">
        <span className="dash-stat-num">{n}</span>
        <span className="dash-stat-label">{label}</span>
      </span>
    </button>
  );
}

function PlanAvatar({ plan: p, size = 'md' }) {
  const avatar = p.avatar ? planFileUrl(p, p.avatar) : null;
  return (
    <span className={`dash-av dash-av-${size}`}>
      {avatar ? <img src={avatar} alt="" loading="lazy" />
        : p.avatarEmoji ? <span className="dash-av-emoji">{p.avatarEmoji}</span>
          : <span>{(p.name || '?').charAt(0).toUpperCase()}</span>}
    </span>
  );
}

// A card that lights up where the pointer is.
const spotlight = (e) => {
  const r = e.currentTarget.getBoundingClientRect();
  e.currentTarget.style.setProperty('--mx', `${e.clientX - r.left}px`);
  e.currentTarget.style.setProperty('--my', `${e.clientY - r.top}px`);
};

/**
 * Work-mode landing: a greeting over your banner with the numbers that matter,
 * then widgets you arrange yourself (Customize: drag, half / full width, hide) —
 * today's focus, the focus timer, what's next, where you left off, urgent
 * to-dos, your tools, the pipeline, your rhythm, inspiration and a note.
 */
export default function WorkDashboard({ reloadKey, onNewPlan }) {
  const navigate = useNavigate();
  const toast = useToast();
  const [plans, setPlans] = useState(null);
  const [board, setBoard] = useState(null);
  const [software, setSoftware] = useState(null);
  const [settings, setSettings] = useState(null);
  const [mockups, setMockups] = useState([]);
  const [refs, setRefs] = useState(null); // your references, for Inspiration
  const [clients, setClients] = useState([]); // for birthdays in the calendar
  const [needsMigration, setNeedsMigration] = useState(false);
  const [bannerPicker, setBannerPicker] = useState(false);
  const [appPick, setAppPick] = useState(false);
  const [editing, setEditing] = useState(false); // arranging the widgets
  const bannerRef = useRef(null);
  const gridRef = useRef(null);
  const [now] = useState(() => new Date());

  useEffect(() => {
    let alive = true;
    api.listPlans().then((p) => { if (alive) setPlans(p); }).catch(() => { if (alive) setPlans([]); });
    api.getBoard().then((b) => { if (alive) setBoard(b); }).catch(() => { if (alive) setBoard({ columns: [] }); });
    api.listSoftware().then((s) => { if (alive) setSoftware(s); }).catch(() => { if (alive) setSoftware([]); });
    api.getSettings().then((s) => { if (alive) setSettings(s); }).catch(() => { if (alive) setSettings({}); });
    api.listMockups().then((m) => { if (alive) setMockups(m.mockups || []); }).catch(() => {});
    api.list().then((ps) => { if (alive) setRefs(ps); }).catch(() => { if (alive) setRefs([]); });
    api.listClients().then((c) => { if (alive) setClients(c); }).catch(() => {});
    api.maintenanceStatus().then((m) => { if (alive) setNeedsMigration(!!m.needsMigration); }).catch(() => {});
    return () => { alive = false; };
  }, [reloadKey]);

  // Banner (stored in settings)
  const bannerImg = settings?.dashboardBanner ? dashboardFileUrl(settings.dashboardBanner) : null;
  const bannerGrad = !bannerImg ? gradientCss(settings?.dashboardBannerGradient) : null;
  const setBannerImage = async (file) => { if (!file) return; try { setSettings(await api.setDashboardBanner(file)); setBannerPicker(false); } catch (e) { toast(`Upload failed: ${e.message}`, 'error'); } };
  const pickGradient = async (gid) => { try { if (settings?.dashboardBanner) await api.removeDashboardBanner(); setSettings(await api.updateSettings({ dashboardBannerGradient: gid })); setBannerPicker(false); } catch (e) { toast(`Failed: ${e.message}`, 'error'); } };
  const removeBanner = async () => { try { setSettings(settings?.dashboardBanner ? await api.removeDashboardBanner() : await api.updateSettings({ dashboardBannerGradient: null })); } catch (e) { toast(`Failed: ${e.message}`, 'error'); } };

  const planCount = plans?.length ?? 0;
  const sbCount = (plans || []).reduce((n, p) => n + (p.blocks || []).filter((b) => b.type === 'storyboard').length, 0);
  const boardCards = (board?.columns || []).reduce((n, c) => n + c.cards.length, 0);
  const boardLists = (board?.columns || []).length;
  const softCount = software?.length ?? 0;

  // Urgent to-dos, gathered from the board and every plan's to-do blocks.
  const planName = (id) => (plans || []).find((p) => p.id === id)?.name;
  const urgentBoard = (board?.columns || []).filter((c) => !DONE_LIST.test(c.name.trim())).flatMap((c) =>
    (c.cards || []).filter((k) => k.urgent).map((k) => ({
      id: k.id, kind: 'board', label: k.title || 'Untitled to-do',
      context: [planName(k.planId), c.name || 'To-Dos'].filter(Boolean).join(' · '),
      to: planName(k.planId) ? `/board?plan=${k.planId}` : '/board',
    })));
  const urgentPlans = (plans || []).flatMap((p) =>
    (p.blocks || []).filter((b) => b.type === 'todos').flatMap((b) =>
      (b.items || []).filter((it) => it.urgent && !it.done).map((it) => ({ id: it.id, kind: 'plan', label: it.text || 'Untitled to-do', context: p.name || 'Project', to: `/plan/${p.id}` }))));
  const urgent = [...urgentBoard, ...urgentPlans];

  // Open plans by status, and their upcoming milestones / deadlines.
  const openPlans = (plans || []).filter((p) => p.status !== 'delivered' && p.status !== 'archived');
  const pipeline = PLAN_STATUSES.filter((st) => st.key !== 'archived')
    .map((st) => ({ ...st, plans: (plans || []).filter((p) => p.status === st.key) }));
  const staged = pipeline.reduce((n, st) => n + st.plans.length, 0);
  const allDue = openPlans.flatMap((p) => [
    ...(p.milestones || []).filter((m) => m.date && !m.done).map((m) => ({ id: `${p.id}:${m.id}`, date: m.date, label: m.title || 'Milestone', plan: p, end: false })),
    ...(p.end ? [{ id: `${p.id}:end`, date: p.end, label: 'Deadline', plan: p, end: true }] : []),
  ]).map((x) => ({ ...x, days: daysFromToday(x.date) }))
    .filter((x) => Number.isFinite(x.days))
    .sort((a, b) => a.days - b.days || Number(a.end) - Number(b.end));
  const due = allDue.filter((x) => x.days <= DUE_AHEAD && x.days >= -DUE_BEHIND).slice(0, 8);
  const next = due.find((x) => x.days >= 0) || due[0] || null;
  const later = due.filter((x) => x !== next).slice(0, 4);
  const thisWeek = allDue.filter((x) => x.days >= 0 && x.days <= 7).length;

  // To-dos: plan to-do blocks + board cards (a "Done" list counts as done).
  const planTodos = (plans || []).filter((p) => p.status !== 'archived').map(todoCount).reduce((a, b) => ({ done: a.done + b.done, all: a.all + b.all }), { done: 0, all: 0 });
  const boardDone = (board?.columns || []).filter((c) => DONE_LIST.test(c.name.trim())).reduce((n, c) => n + c.cards.length, 0);
  const todosAll = planTodos.all + boardCards;
  const todosDone = planTodos.done + boardDone;
  const todosOpen = todosAll - todosDone;

  // The next two weeks from this Monday: what's due each day.
  const monday = (() => { const t = today0(); t.setDate(t.getDate() - ((t.getDay() + 6) % 7)); return t; })();
  const bdays = upcomingBirthdays(clients, 13, monday); // your clients' people's birthdays
  const days = Array.from({ length: 14 }, (_, i) => {
    const dt = new Date(monday); dt.setDate(monday.getDate() + i);
    const iso = isoOf(dt);
    return { iso, dt, items: allDue.filter((x) => x.date === iso), bdays: bdays.filter((b) => b.date === iso), past: dt < today0(), today: iso === isoOf(today0()) };
  });

  const hour = now.getHours();
  const summary = [
    openPlans.length ? plural(openPlans.length, 'open project') : 'No open projects',
    thisWeek ? `${plural(thisWeek, 'date')} in the next 7 days` : 'nothing due in the next 7 days',
    urgent.length ? `${urgent.length} urgent` : null,
  ].filter(Boolean).join(' · ');

  const tools = [
    { key: 'clients', icon: Building2, title: 'Clients', sub: clients.length ? plural(clients.length, 'client') : 'Who you work for', to: '/clients', accent: 'linear-gradient(120deg,#f7971e,#ffd200)', glow: '#f7b21e' },
    { key: 'plan', icon: PencilRuler, title: 'Projects', sub: planCount ? plural(planCount, 'project') : 'Start a new project', to: '/plan', accent: 'linear-gradient(120deg,#6a11cb,#2575fc)', glow: '#5b5bff' },
    { key: 'board', icon: ListTodo, title: 'To-Do Board', sub: boardCards ? `${plural(boardCards, 'card')} · ${boardLists} lists` : 'Organise your to-dos', to: '/board', accent: 'linear-gradient(120deg,#00c6a7,#1e4fd6)', glow: '#00c6a7' },
    { key: 'storyboards', icon: Clapperboard, title: 'Storyboards', sub: sbCount ? plural(sbCount, 'storyboard') : 'Frames, timing & animatic', to: '/storyboards', accent: 'linear-gradient(120deg,#ff6a88,#6a11cb)', glow: '#ff6a88' },
    { key: 'mockups', icon: MonitorSmartphone, title: 'Mockups', sub: mockups.length ? plural(mockups.length, 'mockup') : 'Your work on devices & print', to: '/mockups', accent: 'linear-gradient(120deg,#434343,#8e9eab)', glow: '#9fb0c0' },
    { key: 'logotester', icon: FlaskConical, title: 'Brand Tester', sub: 'Test a logo, keep the sheet', to: '/logo-tester', accent: 'linear-gradient(120deg,#f83600,#f9d423)', glow: '#ff8a1f' },
    { key: 'software', icon: AppWindow, title: 'Software', sub: softCount ? plural(softCount, 'app') : 'Plugins, scripts & more', to: '/software', accent: 'linear-gradient(120deg,#7b4397,#dc2430)', glow: '#dc2430' },
    { key: 'time', icon: Timer, title: 'Time Tracker', sub: 'Hours per project & client', to: '/time', accent: 'linear-gradient(120deg,#11998e,#38ef7d)', glow: '#2fd08a' },
  ];
  const openSearch = () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, metaKey: true, bubbles: true }));
  // ---- The widgets: your layout, arranging, and what each one shows ----
  const layout = layoutOf(settings?.dashboardLayout);
  const shownW = layout.filter((w) => !w.hidden);
  const hiddenW = layout.filter((w) => w.hidden);
  const saveLayout = (next) => {
    setSettings((st) => ({ ...st, dashboardLayout: next }));
    api.updateSettings({ dashboardLayout: next }).catch((e) => toast(`Could not save the layout: ${e.message}`, 'error'));
  };
  const setWidget = (id, patch) => saveLayout(layout.map((w) => (w.id === id ? { ...w, ...patch } : w)));
  // Inspiration (⋯ while customizing): the Reference sections it draws from — none ticked = all of them.
  const refCounts = useMemo(() => {
    const n = { all: 0 };
    for (const { p } of withCover(refs)) { n[p.type] = (n[p.type] || 0) + 1; n.all += 1; }
    return n;
  }, [refs]);
  const sourceItems = (w) => {
    const src = w.sources || [];
    const toggle = (k) => setWidget(w.id, { sources: src.includes(k) ? src.filter((x) => x !== k) : [...src, k] });
    return [
      { heading: 'Inspiration from' },
      { label: 'All sections', checked: !src.length, hint: refCounts.all, keepOpen: true, onClick: () => setWidget(w.id, { sources: [] }) },
      { separator: true },
      ...TABS.map((t) => ({
        label: t.label, checked: src.includes(t.key), hint: refCounts[t.key] || 0, keepOpen: true,
        disabled: !!refs && !refCounts[t.key] && !src.includes(t.key), // nothing with a picture there yet
        onClick: () => toggle(t.key),
      })),
    ];
  };
  const sort = useSortable({
    ids: shownW.map((w) => w.id), container: gridRef, mode: 'center',
    onMove: (from, to) => {
      const order = moveItem(shownW, from, to);
      saveLayout([...order, ...hiddenW]);
    },
  });
  const EMPTY_HINT = {
    urgent: 'Shows up when a to-do is flagged urgent.',
    pipeline: 'Shows up once your projects have a status.',
    next: 'Loading your dates…',
  };
  const renderWidget = (w) => {
    switch (w.id) {
      case 'focus': return <FocusToday board={board} setBoard={setBoard} plans={plans} setPlans={setPlans} settings={settings} setSettings={setSettings} />;
      case 'timer': return <FocusTimer />;
      case 'continue': return <ContinueWork reloadKey={reloadKey} />;
      case 'rhythm': return <ActivityMap reloadKey={reloadKey} compact={w.size === 'half'} />;
      case 'inspiration': return <Inspiration projects={refs} sources={w.sources} />;
      case 'note': return settings ? <QuickNote initial={settings.dashboardNote || ''} /> : null;
      case 'next': return plans === null ? null : (
          <div className="dash-focus" id="dash-next">
            <div className={`dash-next ${next ? '' : 'is-free'} ${next && next.days < 0 ? 'overdue' : ''}`}
              style={next ? { '--tone': tagColor(PLAN_STATUSES.find((s) => s.key === next.plan.status)?.color || 'blue').fg } : undefined}>
              <div className="dash-card-kicker"><Target size={14} /> Next up</div>
              {next ? (
                <>
                  <button type="button" className="dash-next-main" onClick={() => navigate(`/plan/${next.plan.id}`)}>
                    <span className={`dash-count ${next.days === 0 ? 'word' : ''}`}>
                      <b>{next.days === 0 ? 'Today' : Math.abs(next.days)}</b>
                      {next.days !== 0 && <span>{next.days < 0 ? `day${next.days === -1 ? '' : 's'} late` : `day${next.days === 1 ? '' : 's'} to go`}</span>}
                    </span>
                    <span className="dash-next-what">
                      <span className="dash-next-label">{next.end ? <Flag size={15} /> : <CalendarClock size={15} />} {next.label}</span>
                      <span className="dash-next-plan"><PlanAvatar plan={next.plan} size="sm" /> {next.plan.name}{next.plan.client ? ` · ${next.plan.client}` : ''}</span>
                      <span className="dash-next-date">{fmtDay(next.date)}</span>
                      {elapsed(next.plan) != null && (
                        <span className="dash-progress" title={`${Math.round(elapsed(next.plan) * 100)}% of the timeframe`}>
                          <span style={{ width: `${elapsed(next.plan) * 100}%` }} />
                        </span>
                      )}
                    </span>
                    <ArrowRight className="dash-next-go" size={18} />
                  </button>
                  {later.length > 0 && (
                    <div className="dash-later">
                      {later.map((d) => (
                        <button key={d.id} type="button" className={`dash-later-row ${d.days < 0 ? 'overdue' : d.days <= 1 ? 'soon' : ''}`} onClick={() => navigate(`/plan/${d.plan.id}`)}>
                          <span className="dash-later-when">{whenLabel(d.days)}</span>
                          <span className="dash-later-label">{d.end ? <Flag size={12} /> : null}{d.label}</span>
                          <span className="dash-later-plan">{d.plan.name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div className="dash-free">
                  <span className="dash-free-ico"><CalendarRange size={22} /></span>
                  <b>Nothing due in the next two weeks</b>
                  <span>Add milestones or a timeframe to a project and they count down here.</span>
                </div>
              )}
            </div>
            <div className="dash-cal" aria-label="The next two weeks">
              <div className="dash-card-kicker"><CalendarRange size={14} /> Two weeks</div>
              <div className="dash-cal-grid">
                {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((w, i) => <span key={`w${i}`} className="dash-cal-wd">{w}</span>)}
                {days.map((d) => {
                  const tip = [
                    ...d.items.map((x) => `${x.label} — ${x.plan.name}`),
                    ...d.bdays.map((b) => `🎂 ${b.contact.name || 'Birthday'}${b.age ? ` turns ${b.age}` : ''} (${b.client.name})`),
                  ].join('\n');
                  const open = () => { if (d.items[0]) navigate(`/plan/${d.items[0].plan.id}`); else if (d.bdays[0]) navigate(`/clients/${d.bdays[0].client.id}`); };
                  return (
                    <button key={d.iso} type="button" disabled={!d.items.length && !d.bdays.length}
                      className={`dash-cal-day ${d.today ? 'today' : ''} ${d.past ? 'past' : ''} ${d.items.length || d.bdays.length ? 'has' : ''} ${d.bdays.length ? 'bday' : ''} ${d.dt.getDay() % 6 === 0 ? 'weekend' : ''}`}
                      title={tip || undefined} onClick={open}>
                      <span className="dash-cal-num">{d.dt.getDate()}</span>
                      <span className="dash-cal-dots">
                        {d.items.slice(0, 3).map((x) => <i key={x.id} className={x.end ? 'end' : ''} style={{ background: tagColor(PLAN_STATUSES.find((s) => s.key === x.plan.status)?.color || 'blue').fg }} />)}
                        {d.bdays.slice(0, 2).map((b) => <i key={`b${b.contact.id}`} className="bday" />)}
                      </span>
                    </button>
                  );
                })}
              </div>
              <div className="dash-cal-legend"><span><i /> Milestone</span><span><i className="end" /> Deadline</span>{bdays.length > 0 && <span><i className="bday" /> Birthday</span>}<span><i className="today" /> Today</span></div>
            </div>
          </div>
      );
      case 'urgent': return urgent.length > 0 ? (
          <section id="dash-urgent">
            <div className="dash-section-head">
              <h2><AlertTriangle size={17} className="dash-urgent-head-ico" /> Urgent <span className="count">{urgent.length}</span></h2>
            </div>
            <div className="dash-urgent">
              {urgent.map((u) => (
                <div key={`${u.kind}-${u.id}`} className="dash-urgent-row">
                  <span className="dash-urgent-pulse" aria-hidden="true"><AlertTriangle className="dash-urgent-ico" size={15} /></span>
                  <span className="dash-urgent-label">{u.label}</span>
                  <span className="dash-urgent-ctx">
                    {u.kind === 'plan' ? <PencilRuler size={12} /> : <ListTodo size={12} />} {u.context}
                  </span>
                  <button className="btn btn-sm dash-urgent-go" onClick={() => navigate(u.to)}>
                    {u.kind === 'plan' ? 'Open project' : 'Open to-dos'} <ArrowRight size={14} />
                  </button>
                </div>
              ))}
            </div>
          </section>
      ) : null;
      case 'tools': return (
        <section>
          <div className="dash-section-head"><h2><Layers size={16} /> Your tools</h2></div>
          <div className="dash-grid">
            {tools.map((t) => (
              <button key={t.key} className="dash-card" style={{ '--glow': t.glow }} onClick={() => navigate(t.to)} onPointerMove={spotlight}>
                <span className="dash-card-icon" style={{ backgroundImage: t.accent }}><t.icon size={22} /></span>
                <span className="dash-card-body">
                  <span className="dash-card-title">{t.title}</span>
                  <span className="dash-card-sub">{t.sub}</span>
                </span>
                <ArrowRight className="dash-card-go" size={18} />
              </button>
            ))}
          </div>
        </section>
      );
      case 'pipeline': return staged > 0 ? (
          <section>
            <div className="dash-section-head">
              <h2>Pipeline</h2>
              <button className="btn btn-sm btn-ghost" onClick={() => navigate('/plan')}>All projects <ArrowRight size={14} /></button>
            </div>
            <div className="dash-flow" role="img" aria-label={pipeline.filter((st) => st.plans.length).map((st) => `${st.label}: ${st.plans.length}`).join(', ')}>
              {pipeline.filter((st) => st.plans.length).map((st) => (
                <span key={st.key} className="dash-flow-seg" style={{ flexGrow: st.plans.length, background: tagColor(st.color).fg }} title={`${st.label}: ${st.plans.length}`} />
              ))}
            </div>
            <div className="dash-pipeline">
              {pipeline.map((st) => {
                const c = tagColor(st.color);
                return (
                  <button key={st.key} className={`dash-stage ${st.plans.length ? '' : 'is-empty'}`} style={{ '--tone': c.fg }} onClick={() => navigate(`/plan?status=${st.key}`)}>
                    <span className="dash-stage-head">
                      <span className="status-dot" style={{ background: c.fg }} />
                      <span className="dash-stage-name">{st.label}</span>
                      <span className="dash-stage-count" style={st.plans.length ? { background: c.bg, color: c.fg } : undefined}>{st.plans.length}</span>
                    </span>
                    <span className="dash-stage-plans">
                      {st.plans.slice(0, 3).map((p) => <span key={p.id} className="dash-stage-plan">{p.name}</span>)}
                      {st.plans.length > 3 && <span className="dash-stage-more">+{st.plans.length - 3} more</span>}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
      ) : null;
      default: return null;
    }
  };


  return (
    <div className="dashboard dash-wow">
      {/* Hero: greeting over the banner, quick actions and the numbers that matter */}
      <div className={`dash-hero ${bannerImg ? 'has-img' : 'is-grad'}`} style={{ '--hero-bg': bannerGrad || DEFAULT_BANNER }}>
        <div className="dash-hero-bg" aria-hidden="true">
          {bannerImg ? <div className="dash-hero-img" style={{ backgroundImage: `url("${bannerImg}")` }} /> : (
            <>
              <span className="dash-blob b1" /><span className="dash-blob b2" /><span className="dash-blob b3" />
            </>
          )}
          <span className="dash-hero-grain" />
        </div>
        <div className="dash-hero-main">
          <span className="dash-hero-eyebrow"><Sparkles size={13} /> Dashboard · {now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</span>
          <h1>{greeting(hour)}</h1>
          <p>{plans === null ? 'Getting your day ready…' : summary}</p>
          <div className="dash-hero-actions">
            <button type="button" className="btn btn-sm dash-glass-btn" onClick={onNewPlan}><Plus size={15} /> New project</button>
            <button type="button" className="btn btn-sm dash-glass-btn" onClick={() => navigate('/board')}><ListTodo size={15} /> To-dos</button>
            <button type="button" className="btn btn-sm dash-glass-btn dash-search" onClick={openSearch}><Search size={15} /> Search <kbd>⌘K</kbd></button>
          </div>
        </div>
        <div className="dash-stats">
          <Stat icon={PencilRuler} value={openPlans.length} label="open projects" onClick={() => navigate('/plan')} />
          <Stat icon={CalendarClock} value={thisWeek} label="due in 7 days" tone={thisWeek ? 'accent' : ''} onClick={() => document.getElementById('dash-next')?.scrollIntoView({ behavior: 'smooth', block: 'center' })} />
          <Stat icon={CheckCircle2} value={todosOpen} label={<>open to-dos{todosAll > 0 && <span className="dash-stat-extra"> · {Math.round((todosDone / todosAll) * 100)}% done</span>}</>}
            ring={todosAll ? todosDone / todosAll : 0} onClick={() => navigate('/board')} />
          <Stat icon={AlertTriangle} value={urgent.length} label="urgent" tone={urgent.length ? 'danger' : ''} onClick={() => document.getElementById('dash-urgent')?.scrollIntoView({ behavior: 'smooth', block: 'center' })} />
        </div>
        <div className="plan-banner-actions">
          <button className="btn btn-sm" onClick={() => setBannerPicker((v) => !v)} aria-label={(bannerImg || bannerGrad) ? 'Change banner' : 'Add banner'}>
            <ImageIcon size={15} /><span className="dash-banner-txt"> {(bannerImg || bannerGrad) ? 'Change banner' : 'Add banner'}</span>
          </button>
          {(bannerImg || bannerGrad) && <button className="btn btn-sm btn-ghost dash-banner-remove" onClick={removeBanner}>Remove</button>}
        </div>
        {bannerPicker && <div className="banner-picker-backdrop" onClick={() => setBannerPicker(false)} />}
        {bannerPicker && (
          <div className="banner-picker" onMouseDown={(e) => e.stopPropagation()}>
            <div className="banner-picker-head">Gradients</div>
            <div className="banner-picker-grid">
              {PLAN_GRADIENTS.map((g) => (
                <button key={g.id} className={`banner-swatch ${settings?.dashboardBannerGradient === g.id && !bannerImg ? 'on' : ''}`}
                  style={{ backgroundImage: g.css }} title={g.id} onClick={() => pickGradient(g.id)} />
              ))}
            </div>
            <div className="banner-picker-row">
              <button className="btn btn-sm banner-picker-upload" onClick={() => { setBannerPicker(false); bannerRef.current?.click(); }}>
                <UploadCloud size={14} /> Upload…
              </button>
              <button className="btn btn-sm banner-picker-upload" onClick={() => { setBannerPicker(false); setAppPick(true); }}>
                <Library size={14} /> From the app…
              </button>
            </div>
            {(bannerImg || bannerGrad) && <button className="btn btn-sm btn-ghost banner-picker-upload dash-picker-remove" onClick={() => { setBannerPicker(false); removeBanner(); }}>Remove the banner</button>}
          </div>
        )}
      </div>
      <input ref={bannerRef} type="file" accept="image/*" className="visually-hidden-input" onChange={(e) => { setBannerImage(e.target.files?.[0]); e.target.value = ''; }} />
      {appPick && <MediaPicker accept="image" title="Banner from the app" onPick={(source) => { setAppPick(false); setBannerImage({ source }); }} onClose={() => setAppPick(false)} />}

      {needsMigration && (
        <button className="dash-notice" onClick={() => navigate('/settings')}>
          <Database size={16} />
          <span><b>Your library uses an older data format.</b> Everything works as it is — review the one-click update in Settings.</span>
          <ArrowRight size={16} />
        </button>
      )}

      {/* The widgets: yours to arrange (Customize) — order, size and which ones show */}
      <div className={`dash-w-bar ${editing ? 'editing' : ''}`}>
        {editing ? (
          <>
            <span className="dash-w-hint"><Settings2 size={14} /> Drag widgets by their handle, make them half or full width, hide what you don’t need.</span>
            {hiddenW.length > 0 && (
              <span className="dash-w-hidden">
                {hiddenW.map((w) => <button key={w.id} type="button" className="btn btn-sm btn-ghost" onClick={() => setWidget(w.id, { hidden: false })}><Eye size={13} /> {WIDGET[w.id].label}</button>)}
              </span>
            )}
            <button type="button" className="btn btn-sm btn-primary" onClick={() => setEditing(false)}><Check size={14} /> Done</button>
          </>
        ) : <button type="button" className="btn btn-sm btn-ghost dash-w-edit" onClick={() => setEditing(true)}><Settings2 size={14} /> Customize</button>}
      </div>
      <div className={`dash-widgets ${editing ? 'editing' : ''}`} ref={gridRef}>
        {shownW.map((w, i) => {
          const content = renderWidget(w);
          if (!content && !editing) return null;
          const st = sort.itemState(w.id);
          return (
            <div key={w.id} data-sort-id={w.id} className={`dash-w ${w.size} dash-rise ${st.className}`} style={{ '--i': i }}>
              {editing && (
                <div className="dash-w-tools">
                  <button type="button" className="icon-btn dash-w-grip" {...sort.grab(w.id)} aria-label={`Move ${WIDGET[w.id].label}`} title="Drag to move"><GripVertical size={15} /></button>
                  <span className="dash-w-name">{WIDGET[w.id].label}</span>
                  {w.id === 'inspiration' && (
                    <Menu align="right" items={sourceItems(w)} trigger={(
                      <button type="button" className={`icon-btn ${w.sources?.length ? 'on' : ''}`} aria-label="Where inspiration comes from" title="Where inspiration comes from">
                        <MoreHorizontal size={15} />
                      </button>
                    )} />
                  )}
                  <button type="button" className="icon-btn" onClick={() => setWidget(w.id, { size: w.size === 'full' ? 'half' : 'full' })}
                    title={w.size === 'full' ? 'Half width' : 'Full width'} aria-label={w.size === 'full' ? 'Half width' : 'Full width'}>
                    {w.size === 'full' ? <Columns2 size={15} /> : <RectangleHorizontal size={15} />}
                  </button>
                  <button type="button" className="icon-btn" onClick={() => setWidget(w.id, { hidden: true })} title="Hide" aria-label={`Hide ${WIDGET[w.id].label}`}><EyeOff size={15} /></button>
                </div>
              )}
              <div className="dash-w-body">{content || <div className="dash-w-empty">{EMPTY_HINT[w.id] || 'Nothing to show right now.'}</div>}</div>
            </div>
          );
        })}
      </div>
      {sort.drag && <div className="block-ghost" style={{ left: sort.drag.x + 14, top: sort.drag.y + 12 }}><Layers size={14} /> {WIDGET[sort.drag.id]?.label}</div>}
    </div>
  );
}
