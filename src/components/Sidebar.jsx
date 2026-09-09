import { useLocation, useNavigate } from 'react-router-dom';
import {
  Search, Plus, PanelLeftClose, Trash2,
  FileText, Film, Square, CreditCard, Palette, Images, Type, PencilRuler,
} from 'lucide-react';
import { TABS } from '../lib/types.js';
import ModeToggle from './ModeToggle.jsx';
import StorageMeter from './StorageMeter.jsx';
import logoWide from '../../logo_wide_dark.svg';

const ICON = {
  branding: FileText, motion: Film, logo: Square, businesscard: CreditCard,
  color: Palette, imagegallery: Images, font: Type,
};

/** Notion-style desktop sidebar holding everything the header carries. */
export default function Sidebar({ onAdd, onSearch, onToggle, storageKey }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const planMode = pathname.startsWith('/plan');
  const onTrash = pathname === '/trash';
  const active = TABS.find((t) => pathname.startsWith(`/${t.key}`))?.key
    || sessionStorage.getItem('lastTab') || 'branding';

  const go = (key) => { sessionStorage.setItem('lastTab', key); navigate(`/${key}`); };

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

        <ModeToggle planMode={planMode} />

      <nav className="sb-nav">
        {planMode ? (
          <button className="sb-item active" onClick={() => navigate('/plan')}>
            <PencilRuler size={17} /> <span>Plans</span>
          </button>
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

        <button className="sb-add" onClick={() => onAdd(active)}>
          <Plus size={16} /> <span>{planMode ? 'New plan' : 'Add Work'}</span>
        </button>

        <div className="sb-grow" />

        <div className="sb-footer">
          <button className={`sb-item ${onTrash ? 'active' : ''}`} onClick={() => navigate('/trash')}>
            <Trash2 size={17} /> <span>Trash</span>
          </button>
          <StorageMeter refreshKey={storageKey} />
        </div>
      </div>
    </aside>
  );
}
