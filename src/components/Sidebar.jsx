import { useLocation, useNavigate } from 'react-router-dom';
import {
  Search, Plus, PanelLeftClose, Trash2,
  FileText, Film, Square, CreditCard, Palette, Images, Type, PencilRuler, FlaskConical,
  LayoutDashboard, ListTodo,
} from 'lucide-react';
import { TABS, WORK_TABS, isWorkPath } from '../lib/types.js';
import ModeToggle from './ModeToggle.jsx';
import StorageMeter from './StorageMeter.jsx';
import logoWide from '../../logo_wide_dark.svg';

const ICON = {
  branding: FileText, motion: Film, logo: Square, businesscard: CreditCard,
  color: Palette, imagegallery: Images, font: Type,
};
const WORK_ICON = { dashboard: LayoutDashboard, plan: PencilRuler, board: ListTodo, logotester: FlaskConical };

/** Notion-style desktop sidebar holding everything the header carries. */
export default function Sidebar({ onAdd, onSearch, onToggle, storageKey }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const workMode = isWorkPath(pathname);
  const onPlan = pathname === '/plan' || pathname.startsWith('/plan/');
  const onTrash = pathname === '/trash';
  const active = TABS.find((t) => pathname.startsWith(`/${t.key}`))?.key
    || sessionStorage.getItem('lastTab') || 'branding';

  const go = (key) => { sessionStorage.setItem('lastTab', key); navigate(`/${key}`); };
  const showAdd = !onTrash && (!workMode || onPlan); // nothing to "add" on the Logo Tester

  return (
    <aside className="sidebar">
      <div className="sb-inner">
        <div className="sb-brand">
          <img className="sb-logo" src={logoWide} alt="Design Reference" />
          <button className="sb-collapse icon-btn" onClick={onToggle} title="Collapse sidebar" aria-label="Collapse sidebar">
            <PanelLeftClose size={17} />
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
            <Plus size={16} /> <span>{workMode ? 'New plan' : 'Add Work'}</span>
          </button>
        )}

        <div className="sb-grow" />

        <div className="sb-footer">
          <button className={`sb-item ${onTrash ? 'active' : ''}`} onClick={() => navigate('/trash')}>
            <Trash2 size={17} /> <span>Trash</span>
          </button>
          <StorageMeter refreshKey={storageKey} menuUp />
        </div>
      </div>
    </aside>
  );
}
