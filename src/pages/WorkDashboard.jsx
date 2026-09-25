import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  PencilRuler, ListTodo, FlaskConical, Plus, ArrowRight, CalendarRange, AppWindow,
  AlertTriangle, Image as ImageIcon, UploadCloud, Database, Flag, CalendarClock,
} from 'lucide-react';
import { api, planFileUrl, dashboardFileUrl } from '../lib/api.js';
import { gradientCss, PLAN_GRADIENTS, PLAN_STATUSES, tagColor } from '../lib/types.js';
import { useToast } from '../components/Toast.jsx';
import StatusBadge from '../components/StatusBadge.jsx';

const fmtRange = (s, e) => (s && e ? `${s} – ${e}` : s || e || '');
const DEFAULT_BANNER = 'linear-gradient(120deg,#6a11cb,#2575fc)';

// Days from today to a yyyy-mm-dd date (negative = past), in local time.
function daysFromToday(iso) {
  const [y, m, d] = String(iso || '').split('-').map(Number);
  if (!y || !m || !d) return NaN;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return Math.round((new Date(y, m - 1, d) - today) / 86400000);
}
const whenLabel = (n) => (n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : n === -1 ? 'Yesterday' : n > 1 ? `In ${n} days` : `${-n} days ago`);
const fmtDay = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
};
const DUE_AHEAD = 14; // days ahead shown under "Coming up"
const DUE_BEHIND = 30; // overdue items stay this long

/** Work-mode landing: a Notion-style card view of the working tools. */
export default function WorkDashboard({ reloadKey, onNewPlan }) {
  const navigate = useNavigate();
  const toast = useToast();
  const [plans, setPlans] = useState(null);
  const [board, setBoard] = useState(null);
  const [software, setSoftware] = useState(null);
  const [settings, setSettings] = useState(null);
  const [needsMigration, setNeedsMigration] = useState(false);
  const [bannerPicker, setBannerPicker] = useState(false);
  const bannerRef = useRef(null);

  useEffect(() => {
    let alive = true;
    api.listPlans().then((p) => { if (alive) setPlans(p); }).catch(() => { if (alive) setPlans([]); });
    api.getBoard().then((b) => { if (alive) setBoard(b); }).catch(() => { if (alive) setBoard({ columns: [] }); });
    api.listSoftware().then((s) => { if (alive) setSoftware(s); }).catch(() => { if (alive) setSoftware([]); });
    api.getSettings().then((s) => { if (alive) setSettings(s); }).catch(() => { if (alive) setSettings({}); });
    api.maintenanceStatus().then((m) => { if (alive) setNeedsMigration(!!m.needsMigration); }).catch(() => {});
    return () => { alive = false; };
  }, [reloadKey]);

  // Banner (stored in settings)
  const bannerImg = settings?.dashboardBanner ? dashboardFileUrl(settings.dashboardBanner) : null;
  const bannerGrad = !bannerImg ? gradientCss(settings?.dashboardBannerGradient) : null;
  const bannerBg = bannerImg ? `url("${bannerImg}")` : (bannerGrad || DEFAULT_BANNER);
  const setBannerImage = async (file) => { if (!file) return; try { setSettings(await api.setDashboardBanner(file)); setBannerPicker(false); } catch (e) { toast(`Upload failed: ${e.message}`, 'error'); } };
  const pickGradient = async (gid) => { try { if (settings?.dashboardBanner) await api.removeDashboardBanner(); setSettings(await api.updateSettings({ dashboardBannerGradient: gid })); setBannerPicker(false); } catch (e) { toast(`Failed: ${e.message}`, 'error'); } };
  const removeBanner = async () => { try { setSettings(settings?.dashboardBanner ? await api.removeDashboardBanner() : await api.updateSettings({ dashboardBannerGradient: null })); } catch (e) { toast(`Failed: ${e.message}`, 'error'); } };

  const planCount = plans?.length ?? 0;
  const boardCards = (board?.columns || []).reduce((n, c) => n + c.cards.length, 0);
  const boardLists = (board?.columns || []).length;
  const softCount = software?.length ?? 0;
  // The API lists plans newest first; archived ones stay off the dashboard.
  const recent = (plans || []).filter((p) => p.status !== 'archived').slice(0, 6);

  // Urgent to-dos, gathered from the board and every plan's to-do blocks.
  const urgentBoard = (board?.columns || []).flatMap((c) =>
    (c.cards || []).filter((k) => k.urgent).map((k) => ({ id: k.id, kind: 'board', label: k.title || 'Untitled to-do', context: c.name || 'To-Dos', to: '/board' })));
  const urgentPlans = (plans || []).flatMap((p) =>
    (p.blocks || []).filter((b) => b.type === 'todos').flatMap((b) =>
      (b.items || []).filter((it) => it.urgent && !it.done).map((it) => ({ id: it.id, kind: 'plan', label: it.text || 'Untitled to-do', context: p.name || 'Plan', to: `/plan/${p.id}` }))));
  const urgent = [...urgentBoard, ...urgentPlans];

  // Open plans by status, and their upcoming milestones / deadlines.
  const openPlans = (plans || []).filter((p) => p.status !== 'delivered' && p.status !== 'archived');
  const pipeline = PLAN_STATUSES.filter((st) => st.key !== 'archived')
    .map((st) => ({ ...st, plans: (plans || []).filter((p) => p.status === st.key) }));
  const showPipeline = pipeline.some((st) => st.plans.length > 0);
  const due = openPlans.flatMap((p) => [
    ...(p.milestones || []).filter((m) => m.date && !m.done).map((m) => ({ id: `${p.id}:${m.id}`, date: m.date, label: m.title || 'Milestone', plan: p, end: false })),
    ...(p.end ? [{ id: `${p.id}:end`, date: p.end, label: 'Deadline', plan: p, end: true }] : []),
  ]).map((x) => ({ ...x, days: daysFromToday(x.date) }))
    .filter((x) => Number.isFinite(x.days) && x.days <= DUE_AHEAD && x.days >= -DUE_BEHIND)
    .sort((a, b) => a.days - b.days || Number(a.end) - Number(b.end))
    .slice(0, 8);

  const tools = [
    { key: 'plan', icon: PencilRuler, title: 'Plans', sub: planCount ? `${planCount} plan${planCount === 1 ? '' : 's'}` : 'Plan a new project', to: '/plan', accent: 'linear-gradient(120deg,#6a11cb,#2575fc)' },
    { key: 'software', icon: AppWindow, title: 'Software', sub: softCount ? `${softCount} app${softCount === 1 ? '' : 's'}` : 'Plugins, scripts & more', to: '/software', accent: 'linear-gradient(120deg,#7b4397,#dc2430)' },
    { key: 'board', icon: ListTodo, title: 'To-Do Board', sub: boardCards ? `${boardCards} card${boardCards === 1 ? '' : 's'} · ${boardLists} lists` : 'Plan your to-dos', to: '/board', accent: 'linear-gradient(120deg,#00c6a7,#1e4fd6)' },
    { key: 'logotester', icon: FlaskConical, title: 'Logo Tester', sub: 'Stress-test a logo', to: '/logo-tester', accent: 'linear-gradient(120deg,#f83600,#f9d423)' },
  ];

  return (
    <div className="dashboard">
      {/* Banner */}
      <div className="dash-banner" style={{ backgroundImage: bannerBg }}>
        <div className="dash-banner-title">
          <h1>Dashboard</h1>
          <p>Your working area — plans, to-dos and tools.</p>
        </div>
        <div className="plan-banner-actions">
          <button className="btn btn-sm" onClick={() => setBannerPicker((v) => !v)}><ImageIcon size={15} /> {(bannerImg || bannerGrad) ? 'Change banner' : 'Add banner'}</button>
          {(bannerImg || bannerGrad) && <button className="btn btn-sm btn-ghost" onClick={removeBanner}>Remove</button>}
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
            <button className="btn btn-sm banner-picker-upload" onClick={() => { setBannerPicker(false); bannerRef.current?.click(); }}>
              <UploadCloud size={14} /> Upload custom image…
            </button>
          </div>
        )}
      </div>
      <input ref={bannerRef} type="file" accept="image/*" className="visually-hidden-input" onChange={(e) => { setBannerImage(e.target.files?.[0]); e.target.value = ''; }} />

      {needsMigration && (
        <button className="dash-notice" onClick={() => navigate('/settings')}>
          <Database size={16} />
          <span><b>Your library uses an older data format.</b> Everything works as it is — review the one-click update in Settings.</span>
          <ArrowRight size={16} />
        </button>
      )}

      <div className="dash-grid">
        {tools.map((t) => (
          <button key={t.key} className="dash-card" onClick={() => navigate(t.to)}>
            <span className="dash-card-icon" style={{ backgroundImage: t.accent }}><t.icon size={22} /></span>
            <span className="dash-card-body">
              <span className="dash-card-title">{t.title}</span>
              <span className="dash-card-sub">{t.sub}</span>
            </span>
            <ArrowRight className="dash-card-go" size={18} />
          </button>
        ))}
      </div>

      {/* Urgent to-dos across the board and all plans */}
      {urgent.length > 0 && (
        <>
          <div className="dash-section-head">
            <h2><AlertTriangle size={17} className="dash-urgent-head-ico" /> Urgent <span className="count">{urgent.length}</span></h2>
          </div>
          <div className="dash-urgent">
            {urgent.map((u) => (
              <div key={`${u.kind}-${u.id}`} className="dash-urgent-row">
                <AlertTriangle className="dash-urgent-ico" size={15} />
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
        </>
      )}

      {/* Coming up: milestones and plan deadlines in the next two weeks (and overdue) */}
      {due.length > 0 && (
        <>
          <div className="dash-section-head">
            <h2><CalendarClock size={17} /> Coming up <span className="count">{due.length}</span></h2>
          </div>
          <div className="dash-due">
            {due.map((d) => (
              <button key={d.id} className={`dash-due-row ${d.days < 0 ? 'overdue' : d.days <= 1 ? 'soon' : ''}`} onClick={() => navigate(`/plan/${d.plan.id}`)}>
                <span className="dash-due-when"><b>{whenLabel(d.days)}</b><span>{fmtDay(d.date)}</span></span>
                <span className="dash-due-main">
                  <span className="dash-due-label">{d.end ? <Flag size={13} /> : null}{d.label}</span>
                  <span className="dash-due-plan">{d.plan.avatarEmoji ? `${d.plan.avatarEmoji} ` : ''}{d.plan.name}{d.plan.client ? ` · ${d.plan.client}` : ''}</span>
                </span>
                <ArrowRight className="dash-due-go" size={15} />
              </button>
            ))}
          </div>
        </>
      )}

      {/* Pipeline: plans by status */}
      {showPipeline && (
        <>
          <div className="dash-section-head">
            <h2>Pipeline</h2>
            <button className="btn btn-sm btn-ghost" onClick={() => navigate('/plan')}>All plans <ArrowRight size={14} /></button>
          </div>
          <div className="dash-pipeline">
            {pipeline.map((st) => {
              const c = tagColor(st.color);
              return (
                <button key={st.key} className={`dash-stage ${st.plans.length ? '' : 'is-empty'}`} onClick={() => navigate(`/plan?status=${st.key}`)}>
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
        </>
      )}

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
            const avatar = p.avatar ? planFileUrl(p, p.avatar) : null;
            return (
              <button key={p.id} className="dash-plan" onClick={() => navigate(`/plan/${p.id}`)}>
                <span className={`dash-plan-banner ${bg ? '' : 'empty'}`} style={bg ? { backgroundImage: bg } : undefined} />
                <span className="dash-plan-avatar">
                  {avatar ? <img src={avatar} alt="" loading="lazy" />
                    : p.avatarEmoji ? <span className="dash-plan-emoji">{p.avatarEmoji}</span>
                      : <span>{(p.name || '?').charAt(0).toUpperCase()}</span>}
                </span>
                <StatusBadge status={p.status} className="dash-plan-status" />
                <span className="dash-plan-name">{p.name}</span>
                {fmtRange(p.start, p.end) && (
                  <span className="dash-plan-range"><CalendarRange size={12} /> {fmtRange(p.start, p.end)}</span>
                )}
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
    </div>
  );
}
