import { useLocation, useNavigate } from 'react-router-dom';
import { Plus, Menu as MenuIcon, Check } from 'lucide-react';
import { TABS } from '../lib/types.js';
import Menu from './Menu.jsx';
import StorageMeter from './StorageMeter.jsx';

export default function Header({ onAdd, storageKey }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const active = TABS.find((t) => pathname.startsWith(`/${t.key}`))?.key
    || sessionStorage.getItem('lastTab')
    || 'branding';
  const activeLabel = TABS.find((t) => t.key === active)?.label || 'Menu';

  const go = (key) => {
    sessionStorage.setItem('lastTab', key);
    navigate(`/${key}`);
  };

  return (
    <header className="header">
      <div className="header-inner">
        <div className="header-bar">
          {/* Mobile: hamburger dropdown of all sections */}
          <Menu
            align="left"
            trigger={
              <button className="icon-btn menu-toggle" aria-label="Sections" title={activeLabel}>
                <MenuIcon size={18} />
              </button>
            }
            items={TABS.map((t) => ({
              label: t.label,
              icon: active === t.key ? <Check size={15} /> : <span style={{ width: 15, display: 'inline-block' }} />,
              onClick: () => go(t.key),
            }))}
          />

          {/* Desktop: inline tabs */}
          <div className="tabs">
            {TABS.map((t) => (
              <button key={t.key} className={`tab ${active === t.key ? 'active' : ''}`} onClick={() => go(t.key)}>
                {t.label}
              </button>
            ))}
          </div>

          <button className="icon-btn header-plus" title="Add new work" aria-label="Add new work" onClick={() => onAdd(active)}>
            <Plus size={19} />
          </button>
        </div>
        <StorageMeter refreshKey={storageKey} />
      </div>
    </header>
  );
}
