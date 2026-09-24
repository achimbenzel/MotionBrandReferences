import { useLocation, useNavigate } from 'react-router-dom';
import {
  Search, Plus, PanelLeftClose, Trash2, Settings, X,
  FileText, Film, Square, CreditCard, Palette, Images, Type, PencilRuler, FlaskConical,
  LayoutDashboard, ListTodo, Ban, AppWindow,
} from 'lucide-react';
import { TABS, WORK_TABS, isWorkPath, setLastTab } from '../lib/types.js';
import { useActiveTab } from '../lib/useActiveTab.js';
import ModeToggle from './ModeToggle.jsx';
import StorageMeter from './StorageMeter.jsx';
import logoWide from '../../logo_wide_dark.svg';

const ICON = {
  branding: FileText, motion: Film, logo: Square, businesscard: CreditCard,
  color: Palette, imagegallery: Images, font: Type, logonogo: Ban,
};
const WORK_ICON = { dashboard: LayoutDashboard, plan: PencilRuler, software: AppWindow, board: ListTodo, logotester: FlaskConical };

/**
 * Notion-style sidebar holding all navigation. Docked on desktop (collapsible);
 * below the desktop breakpoint the same sidebar slides in as a drawer
 * (`drawer`), opened from the top bar's menu button.
 */
export default function Sidebar({ onAdd, onSearch, onToggle, drawer = false, open = false }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const workMode = isWorkPath(pathname);
  const onPlan = pathname === '/plan' || pathname.startsWith('/plan/');
  const onTrash = pathname === '/trash';
  const onSettings = pathname === '/settings';
  const active = useActiveTab(pathname);

  const go = (key) => { setLastTab(key); navigate(`/${key}`); };
  const showAdd = !onTrash && (!workMode || onPlan); // nothing to "add" on the Logo Tester

  return (
    // A closed drawer is off-screen; `inert` keeps it out of tab order too.
    <aside className={`sidebar ${drawer ? 'is-drawer' : ''}`} {...(drawer && !open ? { inert: '' } : {})} aria-label="Navigation">
      <div className="sb-inner">
        <div className="sb-brand">
          <img className="sb-logo" src={logoWide} alt="Design Reference" />
          <button className="sb-collapse icon-btn" onClick={onToggle} title={drawer ? 'Close menu' : 'Collapse sidebar'} aria-label={drawer ? 'Close menu' : 'Collapse sidebar'}>
            {drawer ? <X size={18} /> : <PanelLeftClose size={17} />}
          </button>
        </div>

        <button className="sb-search" onClick={() => onSearch?.()} title="Search (⌘K)">
          <Search size={16} /> <span>Search</span> <kbd>⌘K</kbd>
        </button>

        <ModeToggle workMode={workMode} />

        <nav className="sb-nav">
          {workMode ? (
            WORK_TABS.map((t) => {
              const I = WORK_ICON[t.key] || PencilRuler;
              const on = pathname === t.path || pathname.startsWith(`${t.path}/`);
              return (
                <button key={t.key} className={`sb-item ${on ? 'active' : ''}`} onClick={() => navigate(t.path)}>
                  <I size={17} /> <span>{t.label}</span>
                </button>
              );
            })
          ) : (
            TABS.map((t) => {
              const I = ICON[t.key] || FileText;
              return (
                <button key={t.key} className={`sb-item ${active === t.key && !onTrash ? 'active' : ''}`} onClick={() => go(t.key)}>
                  <I size={17} /> <span>{t.label}</span>
                </button>
              );
            })
          )}
        </nav>

        {showAdd && (
          <button className="sb-add" onClick={() => onAdd(active)}>
            <Plus size={16} /> <span>{workMode ? 'New plan' : 'Add project'}</span>
          </button>
        )}

        <div className="sb-grow" />

        <div className="sb-footer">
          <button className={`sb-item ${onSettings ? 'active' : ''}`} onClick={() => navigate('/settings')}>
            <Settings size={17} /> <span>Settings</span>
          </button>
          <button className={`sb-item ${onTrash ? 'active' : ''}`} onClick={() => navigate('/trash')}>
            <Trash2 size={17} /> <span>Trash</span>
          </button>
          <StorageMeter menuUp />
        </div>
      </div>
    </aside>
  );
}
