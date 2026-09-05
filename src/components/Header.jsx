import { useLocation, useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { TABS } from '../lib/types.js';
import StorageMeter from './StorageMeter.jsx';

export default function Header({ onAdd, storageKey }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  // Highlight the tab that matches the current section, including detail pages.
  const active = TABS.find((t) => pathname.startsWith(`/${t.key}`))?.key
    || sessionStorage.getItem('lastTab')
    || 'branding';

  const go = (key) => {
    sessionStorage.setItem('lastTab', key);
    navigate(`/${key}`);
  };

  return (
    <header className="header">
      <div className="header-inner">
        <div className="header-bar">
          <div className="tabs">
            {TABS.map((t) => (
              <button key={t.key} className={`tab ${active === t.key ? 'active' : ''}`} onClick={() => go(t.key)}>
                {t.label}
              </button>
            ))}
          </div>
          <button
            className="icon-btn header-plus"
            title="Add new work"
            aria-label="Add new work"
            onClick={() => onAdd(active)}
          >
            <Plus size={19} />
          </button>
        </div>
        <StorageMeter refreshKey={storageKey} />
      </div>
    </header>
  );
}
