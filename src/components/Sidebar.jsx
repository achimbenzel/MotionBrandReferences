import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Search, Plus, PanelLeftClose, PanelLeftOpen, Trash2, Settings, X,
  FileText, Film, Square, CreditCard, Palette, Images, Type, PencilRuler, FlaskConical,
  LayoutDashboard, ListTodo, Ban, AppWindow, Inbox, Clapperboard, MonitorSmartphone,
} from 'lucide-react';
import { TABS, WORK_TABS, isWorkPath, setLastTab } from '../lib/types.js';
import { useActiveTab } from '../lib/useActiveTab.js';
import ModeToggle from './ModeToggle.jsx';
import FocusPill from './FocusPill.jsx';
import StorageMeter from './StorageMeter.jsx';
import { useInboxCount } from '../lib/inbox.js';
import logoWide from '../../logo_wide_dark.svg';

const ICON = {
  branding: FileText, motion: Film, logo: Square, businesscard: CreditCard,
  color: Palette, imagegallery: Images, font: Type, logonogo: Ban,
};
const WORK_ICON = { dashboard: LayoutDashboard, plan: PencilRuler, software: AppWindow, board: ListTodo, logotester: FlaskConical, storyboards: Clapperboard, mockups: MonitorSmartphone };

/**
 * Notion-style sidebar holding all navigation. Docked on desktop, where it
 * folds into a slim rail of icons (`rail`, names as tooltips); below the
 * desktop breakpoint the same sidebar slides in as a drawer (`drawer`),
 * opened from the top bar's menu button.
 */
export default function Sidebar({ onAdd, onSearch, onToggle, drawer = false, open = false, rail = false }) {
  const [tip, setTip] = useState(null); // the rail's tooltip: { text, top }
  const showTip = (e) => {
    if (!rail) return;
    const el = e.target.closest?.('[data-tip]');
    if (!el) { setTip(null); return; }
    const r = el.getBoundingClientRect();
    setTip({ text: el.dataset.tip, top: r.top + r.height / 2, left: r.right + 10 });
  };
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const workMode = isWorkPath(pathname);
  const onPlan = pathname === '/plan' || pathname.startsWith('/plan/');
  const onTrash = pathname === '/trash';
  const onSettings = pathname === '/settings';
  const onInbox = pathname === '/inbox';
  const inboxCount = useInboxCount(pathname);
  const active = useActiveTab(pathname);

  const go = (key) => { setLastTab(key); navigate(`/${key}`); };
  const showAdd = !onTrash && !onInbox && (!workMode || onPlan); // nothing to "add" on the Brand Tester

  return (
    // A closed drawer is off-screen; `inert` keeps it out of tab order too.
    <aside className={`sidebar ${drawer ? 'is-drawer' : ''} ${rail ? 'is-rail' : ''}`} {...(drawer && !open ? { inert: '' } : {})} aria-label="Navigation"
      onMouseOver={showTip} onFocus={showTip} onMouseLeave={() => setTip(null)} onBlur={() => setTip(null)}>
      <div className="sb-inner">
        <div className="sb-brand">
          <img className="sb-logo" src={logoWide} alt="Design Reference" />
          <button className="sb-collapse icon-btn" onClick={() => { setTip(null); onToggle(); }} data-tip={rail ? 'Open sidebar' : undefined}
            title={rail ? undefined : drawer ? 'Close menu' : 'Collapse sidebar'} aria-label={drawer ? 'Close menu' : rail ? 'Open sidebar' : 'Collapse sidebar'}>
            {drawer ? <X size={18} /> : rail ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
          </button>
        </div>

        <button className="sb-search" onClick={() => onSearch?.()} title={rail ? undefined : 'Search (⌘K)'} data-tip="Search ⌘K" aria-label="Search">
          <Search size={16} /> <span>Search</span> <kbd>⌘K</kbd>
        </button>

        <FocusPill compact={rail} />

        <button className={`sb-item sb-inbox ${onInbox ? 'active' : ''}`} onClick={() => navigate('/inbox')} data-tip={inboxCount ? `Inbox · ${inboxCount} to sort` : 'Inbox'}>
          <Inbox size={17} /> <span>Inbox</span>
          {inboxCount > 0 && <span className="sb-badge" aria-label={`${inboxCount} to sort`}>{inboxCount > 99 ? '99+' : inboxCount}</span>}
        </button>

        <ModeToggle workMode={workMode} rail={rail} />

        <nav className="sb-nav">
          {workMode ? (
            WORK_TABS.map((t) => {
              const I = WORK_ICON[t.key] || PencilRuler;
              const on = pathname === t.path || pathname.startsWith(`${t.path}/`);
              return (
                <button key={t.key} className={`sb-item ${on ? 'active' : ''}`} onClick={() => navigate(t.path)} data-tip={t.label}>
                  <I size={17} /> <span>{t.label}</span>
                </button>
              );
            })
          ) : (
            TABS.map((t) => {
              const I = ICON[t.key] || FileText;
              return (
                <button key={t.key} className={`sb-item ${active === t.key && !onTrash && !onInbox ? 'active' : ''}`} onClick={() => go(t.key)} data-tip={t.label}>
                  <I size={17} /> <span>{t.label}</span>
                </button>
              );
            })
          )}
        </nav>

        {showAdd && (
          <button className="sb-add" onClick={() => onAdd(active)} data-tip={workMode ? 'New plan' : 'Add project'}>
            <Plus size={16} /> <span>{workMode ? 'New plan' : 'Add project'}</span>
          </button>
        )}

        <div className="sb-grow" />

        <div className="sb-footer">
          <button className={`sb-item ${onSettings ? 'active' : ''}`} onClick={() => navigate('/settings')} data-tip="Settings">
            <Settings size={17} /> <span>Settings</span>
          </button>
          <button className={`sb-item ${onTrash ? 'active' : ''}`} onClick={() => navigate('/trash')} data-tip="Trash">
            <Trash2 size={17} /> <span>Trash</span>
          </button>
          <StorageMeter menuUp />
        </div>
      </div>
      {rail && tip && createPortal(<div className="sb-tip" style={{ top: tip.top, left: tip.left }} role="tooltip">{tip.text}</div>, document.body)}
    </aside>
  );
}
