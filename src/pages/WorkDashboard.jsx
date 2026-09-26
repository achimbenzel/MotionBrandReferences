import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  PencilRuler, ListTodo, FlaskConical, Clapperboard, Plus, ArrowRight, CalendarRange, AppWindow,
  AlertTriangle, Image as ImageIcon, UploadCloud, Database, Flag, CalendarClock, MonitorSmartphone,
  Library, Search, Sparkles, Target, CheckCircle2, Layers,
} from 'lucide-react';
import { api, planFileUrl, dashboardFileUrl, mockupFileUrl } from '../lib/api.js';
import { gradientCss, PLAN_GRADIENTS, PLAN_STATUSES, tagColor } from '../lib/types.js';
import { useToast } from '../components/Toast.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import MediaPicker from '../components/mockups/MediaPicker.jsx';

const fmtRange = (s, e) => (s && e ? `${s} – ${e}` : s || e || '');
const DEFAULT_BANNER = 'linear-gradient(120deg,#6a11cb,#2575fc)';
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
 * what's next (countdown, the next two weeks), your tools, urgent to-dos, the
 * pipeline, recent plans and the latest mockups.
 */
export default function WorkDashboard({ reloadKey, onNewPlan }) {
  const navigate = useNavigate();
  const toast = useToast();
  const [plans, setPlans] = useState(null);
  const [board, setBoard] = useState(null);
  const [software, setSoftware] = useState(null);
  const [settings, setSettings] = useState(null);
  const [mockups, setMockups] = useState([]);
  const [needsMigration, setNeedsMigration] = useState(false);
  const [bannerPicker, setBannerPicker] = useState(false);
  const [appPick, setAppPick] = useState(false);
  const bannerRef = useRef(null);
  const [now] = useState(() => new Date());

  useEffect(() => {
    let alive = true;
    api.listPlans().then((p) => { if (alive) setPlans(p); }).catch(() => { if (alive) setPlans([]); });
    api.getBoard().then((b) => { if (alive) setBoard(b); }).catch(() => { if (alive) setBoard({ columns: [] }); });
    api.listSoftware().then((s) => { if (alive) setSoftware(s); }).catch(() => { if (alive) setSoftware([]); });
    api.getSettings().then((s) => { if (alive) setSettings(s); }).catch(() => { if (alive) setSettings({}); });
    api.listMockups().then((m) => { if (alive) setMockups(m.mockups || []); }).catch(() => {});
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
  // The API lists plans newest first; archived ones stay off the dashboard.
  const recent = (plans || []).filter((p) => p.status !== 'archived').slice(0, 6);

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
      (b.items || []).filter((it) => it.urgent && !it.done).map((it) => ({ id: it.id, kind: 'plan', label: it.text || 'Untitled to-do', context: p.name || 'Plan', to: `/plan/${p.id}` }))));
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
  const days = Array.from({ length: 14 }, (_, i) => {
    const dt = new Date(monday); dt.setDate(monday.getDate() + i);
    const iso = isoOf(dt);
    return { iso, dt, items: allDue.filter((x) => x.date === iso), past: dt < today0(), today: iso === isoOf(today0()) };
  });

  const hour = now.getHours();
  const summary = [
    openPlans.length ? plural(openPlans.length, 'open plan') : 'No open plans',
    thisWeek ? `${plural(thisWeek, 'date')} in the next 7 days` : 'nothing due in the next 7 days',
    urgent.length ? `${urgent.length} urgent` : null,
  ].filter(Boolean).join(' · ');

  const tools = [
    { key: 'plan', icon: PencilRuler, title: 'Plans', sub: planCount ? plural(planCount, 'plan') : 'Plan a new project', to: '/plan', accent: 'linear-gradient(120deg,#6a11cb,#2575fc)', glow: '#5b5bff' },
    { key: 'board', icon: ListTodo, title: 'To-Do Board', sub: boardCards ? `${plural(boardCards, 'card')} · ${boardLists} lists` : 'Plan your to-dos', to: '/board', accent: 'linear-gradient(120deg,#00c6a7,#1e4fd6)', glow: '#00c6a7' },
    { key: 'storyboards', icon: Clapperboard, title: 'Storyboards', sub: sbCount ? plural(sbCount, 'storyboard') : 'Frames, timing & animatic', to: '/storyboards', accent: 'linear-gradient(120deg,#ff6a88,#6a11cb)', glow: '#ff6a88' },
    { key: 'mockups', icon: MonitorSmartphone, title: 'Mockups', sub: mockups.length ? plural(mockups.length, 'mockup') : 'Your work on devices & print', to: '/mockups', accent: 'linear-gradient(120deg,#434343,#8e9eab)', glow: '#9fb0c0' },
    { key: 'logotester', icon: FlaskConical, title: 'Brand Tester', sub: 'Test a logo, keep the sheet', to: '/logo-tester', accent: 'linear-gradient(120deg,#f83600,#f9d423)', glow: '#ff8a1f' },
    { key: 'software', icon: AppWindow, title: 'Software', sub: softCount ? plural(softCount, 'app') : 'Plugins, scripts & more', to: '/software', accent: 'linear-gradient(120deg,#7b4397,#dc2430)', glow: '#dc2430' },
  ];
  const latest = mockups.filter((m) => m.thumb).slice(0, 6);
  const openSearch = () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, metaKey: true, bubbles: true }));
  // The sections rise in one after the other.
  const rise = (i, extra = '') => ({ className: `dash-rise ${extra}`.trim(), style: { '--i': i } });

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
            <button type="button" className="btn btn-sm dash-glass-btn" onClick={onNewPlan}><Plus size={15} /> New plan</button>
            <button type="button" className="btn btn-sm dash-glass-btn" onClick={() => navigate('/board')}><ListTodo size={15} /> To-dos</button>
            <button type="button" className="btn btn-sm dash-glass-btn dash-search" onClick={openSearch}><Search size={15} /> Search <kbd>⌘K</kbd></button>
          </div>
        </div>
        <div className="dash-stats">
          <Stat icon={PencilRuler} value={openPlans.length} label="open plans" onClick={() => navigate('/plan')} />
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

      {/* What's next: a countdown to the next date, and the next two weeks */}
      {plans !== null && (
        <div {...rise(0, 'dash-focus')} id="dash-next">
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
                <span>Add milestones or a timeframe to a plan and they count down here.</span>
              </div>
            )}
          </div>
          <div className="dash-cal" aria-label="The next two weeks">
            <div className="dash-card-kicker"><CalendarRange size={14} /> Two weeks</div>
            <div className="dash-cal-grid">
              {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((w, i) => <span key={`w${i}`} className="dash-cal-wd">{w}</span>)}
              {days.map((d) => {
                const tip = d.items.map((x) => `${x.label} — ${x.plan.name}`).join('\n');
                return (
                  <button key={d.iso} type="button" disabled={!d.items.length}
                    className={`dash-cal-day ${d.today ? 'today' : ''} ${d.past ? 'past' : ''} ${d.items.length ? 'has' : ''} ${d.dt.getDay() % 6 === 0 ? 'weekend' : ''}`}
                    title={tip || undefined} onClick={() => d.items[0] && navigate(`/plan/${d.items[0].plan.id}`)}>
                    <span className="dash-cal-num">{d.dt.getDate()}</span>
                    <span className="dash-cal-dots">
                      {d.items.slice(0, 3).map((x) => <i key={x.id} className={x.end ? 'end' : ''} style={{ background: tagColor(PLAN_STATUSES.find((s) => s.key === x.plan.status)?.color || 'blue').fg }} />)}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="dash-cal-legend"><span><i /> Milestone</span><span><i className="end" /> Deadline</span><span><i className="today" /> Today</span></div>
          </div>
        </div>
      )}

      {/* Urgent to-dos across the board and all plans */}
      {urgent.length > 0 && (
        <section {...rise(1)} id="dash-urgent">
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
                  {u.kind === 'plan' ? 'Open plan' : 'Open to-dos'} <ArrowRight size={14} />
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Your tools */}
      <section {...rise(2)}>
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

      {/* Pipeline: plans by status, as one bar and per stage */}
      {staged > 0 && (
        <section {...rise(3)}>
          <div className="dash-section-head">
            <h2>Pipeline</h2>
            <button className="btn btn-sm btn-ghost" onClick={() => navigate('/plan')}>All plans <ArrowRight size={14} /></button>
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
      )}

      <section {...rise(4)}>
        <div className="dash-section-head">
          <h2>Recent plans</h2>
          <button className="btn btn-sm" onClick={onNewPlan}><Plus size={15} /> New plan</button>
        </div>
        {plans === null ? (
          <div className="spinner" />
        ) : recent.length ? (
          <div className="dash-recent">
            {recent.map((p) => {
              const banner = p.banner ? planFileUrl(p, p.banner) : null;
              const grad = !banner ? gradientCss(p.bannerGradient) : null;
              const bg = banner ? `url("${banner}")` : grad || null;
              const el = elapsed(p);
              const td = todoCount(p);
              return (
                <button key={p.id} className="dash-plan" onClick={() => navigate(`/plan/${p.id}`)}>
                  <span className="dash-plan-bannerwrap"><span className={`dash-plan-banner ${bg ? '' : 'empty'}`} style={bg ? { backgroundImage: bg } : undefined} /></span>
                  <span className="dash-plan-avatar"><PlanAvatar plan={p} /></span>
                  <StatusBadge status={p.status} className="dash-plan-status" />
                  <span className="dash-plan-name">{p.name}</span>
                  <span className="dash-plan-meta">
                    {fmtRange(p.start, p.end) && <span className="dash-plan-range"><CalendarRange size={12} /> {fmtRange(p.start, p.end)}</span>}
                    {td.all > 0 && <span className="dash-plan-todos"><CheckCircle2 size={12} /> {td.done}/{td.all}</span>}
                  </span>
                  {el != null && <span className="dash-progress dash-plan-progress" title={`${Math.round(el * 100)}% of the timeframe`}><span style={{ width: `${el * 100}%` }} /></span>}
                </button>
              );
            })}
          </div>
        ) : (
          <div className="empty" style={{ marginTop: 8 }}>
            <PencilRuler size={28} />
            <h3>No plans yet</h3>
            <p>Start planning a new project — moodboard, notes, files and a timeframe.</p>
            <button className="btn btn-primary" onClick={onNewPlan}><Plus size={16} /> New plan</button>
          </div>
        )}
      </section>

      {/* The latest mockups, as a strip of pictures */}
      {latest.length > 0 && (
        <section {...rise(5)}>
          <div className="dash-section-head">
            <h2><MonitorSmartphone size={16} /> Latest mockups</h2>
            <button className="btn btn-sm btn-ghost" onClick={() => navigate('/mockups')}>All mockups <ArrowRight size={14} /></button>
          </div>
          <div className="dash-shots">
            {latest.map((m) => (
              <button key={m.id} type="button" className="dash-shot" onClick={() => navigate(`/mockups/${m.id}`)} title={m.name}>
                <img src={mockupFileUrl(m, m.thumb)} alt="" />
                <span className="dash-shot-name">{m.name}</span>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
