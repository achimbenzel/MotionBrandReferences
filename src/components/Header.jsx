import { useLocation, useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';

const TABS = [
  { key: 'branding', label: 'Branding' },
  { key: 'motion', label: 'Motion Design' },
  { key: 'color', label: 'Colors' },
];

export default function Header({ onAdd }) {
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
      <div className="header-bar">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={`tab ${active === t.key ? 'active' : ''}`}
            onClick={() => go(t.key)}
          >
            {t.label}
          </button>
        ))}
        <button
          className="icon-btn header-plus"
          title="Add new work"
          aria-label="Add new work"
          onClick={() => onAdd(active)}
        >
          <Plus size={19} />
        </button>
      </div>
    </header>
  );
}
