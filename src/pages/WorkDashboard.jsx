import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  PencilRuler, ListTodo, FlaskConical, Plus, ArrowRight, CalendarRange, AppWindow,
  AlertTriangle, Image as ImageIcon, UploadCloud,
} from 'lucide-react';
import { api, planFileUrl, dashboardFileUrl } from '../lib/api.js';
import { gradientCss, PLAN_GRADIENTS } from '../lib/types.js';
import { useToast } from '../components/Toast.jsx';

const fmtRange = (s, e) => (s && e ? `${s} – ${e}` : s || e || '');
const DEFAULT_BANNER = 'linear-gradient(120deg,#6a11cb,#2575fc)';

/** Work-mode landing: a Notion-style card view of the working tools. */
export default function WorkDashboard({ reloadKey, onNewPlan }) {
  const navigate = useNavigate();
  const toast = useToast();
  const [plans, setPlans] = useState(null);
  const [board, setBoard] = useState(null);
  const [software, setSoftware] = useState(null);
  const [settings, setSettings] = useState(null);
  const [bannerPicker, setBannerPicker] = useState(false);
  const bannerRef = useRef(null);

  useEffect(() => {
    let alive = true;
    api.listPlans().then((p) => { if (alive) setPlans(p); }).catch(() => { if (alive) setPlans([]); });
    api.getBoard().then((b) => { if (alive) setBoard(b); }).catch(() => { if (alive) setBoard({ columns: [] }); });
    api.listSoftware().then((s) => { if (alive) setSoftware(s); }).catch(() => { if (alive) setSoftware([]); });
    api.getSettings().then((s) => { if (alive) setSettings(s); }).catch(() => { if (alive) setSettings({}); });
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
  const recent = [...(plans || [])].slice(-6).reverse();

  // Urgent to-dos, gathered from the board and every plan's to-do blocks.
  const urgentBoard = (board?.columns || []).flatMap((c) =>
    (c.cards || []).filter((k) => k.urgent).map((k) => ({ id: k.id, kind: 'board', label: k.title || 'Untitled to-do', context: c.name || 'To-Dos', to: '/board' })));
  const urgentPlans = (plans || []).flatMap((p) =>
    (p.blocks || []).filter((b) => b.type === 'todos').flatMap((b) =>
      (b.items || []).filter((it) => it.urgent && !it.done).map((it) => ({ id: it.id, kind: 'plan', label: it.text || 'Untitled to-do', context: p.name || 'Plan', to: `/plan/${p.id}` }))));
  const urgent = [...urgentBoard, ...urgentPlans];

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
