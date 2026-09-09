import { useLocation, useNavigate } from 'react-router-dom';
import { Plus, Menu as MenuIcon, Check, Search } from 'lucide-react';
import { TABS, WORK_TABS, isWorkPath } from '../lib/types.js';
import Menu from './Menu.jsx';
import StorageMeter from './StorageMeter.jsx';
import ModeToggle from './ModeToggle.jsx';

export default function Header({ onAdd, onSearch, storageKey }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const workMode = isWorkPath(pathname);
  const onPlan = pathname === '/plan' || pathname.startsWith('/plan/');

  const active = TABS.find((t) => pathname.startsWith(`/${t.key}`))?.key
    || sessionStorage.getItem('lastTab')
    || 'branding';
  const activeLabel = TABS.find((t) => t.key === active)?.label || 'Menu';

  const go = (key) => {
    sessionStorage.setItem('lastTab', key);
    navigate(`/${key}`);
  };
  const showAdd = !workMode || onPlan; // nothing to add on the Logo Tester

  return (
    <header className="header">
      <div className="header-inner">
        <ModeToggle workMode={workMode} />

        <div className="header-bar">
          {workMode ? (
            <div className="tabs">
              {WORK_TABS.map((t) => {
                const on = pathname === t.path || pathname.startsWith(`${t.path}/`);
                return (
                  <button key={t.key} className={`tab ${on ? 'active' : ''}`} onClick={() => navigate(t.path)}>
                    {t.label}
                  </button>
                );
              })}
            </div>
          ) : (
            <>
              <Menu
                align="left"
                trigger={<button className="icon-btn menu-toggle" aria-label="Sections" title={activeLabel}><MenuIcon size={18} /></button>}
                items={TABS.map((t) => ({
                  label: t.label,
                  icon: active === t.key ? <Check size={15} /> : <span style={{ width: 15, display: 'inline-block' }} />,
                  onClick: () => go(t.key),
                }))}
              />
              <div className="tabs">
                {TABS.map((t) => (
                  <button key={t.key} className={`tab ${active === t.key ? 'active' : ''}`} onClick={() => go(t.key)}>
                    {t.label}
                  </button>
                ))}
              </div>
            </>
          )}

          <button className="icon-btn header-search" title="Search (⌘K)" aria-label="Search" onClick={() => onSearch?.()}>
            <Search size={18} />
          </button>
          {showAdd && (
            <button className="icon-btn header-plus" title={workMode ? 'New plan' : 'Add new work'} aria-label={workMode ? 'New plan' : 'Add new work'} onClick={() => onAdd(active)}>
              <Plus size={19} />
            </button>
          )}
        </div>

        <StorageMeter refreshKey={storageKey} />
      </div>
    </header>
  );
}
