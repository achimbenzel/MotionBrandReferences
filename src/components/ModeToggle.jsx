import { useNavigate } from 'react-router-dom';
import { LayoutGrid, Briefcase } from 'lucide-react';

/**
 * Switches between Reference mode (the library) and Work mode (the working
 * area: Plans and the Logo Tester).
 */
export default function ModeToggle({ workMode }) {
  const navigate = useNavigate();
  const toReference = () => {
    const last = sessionStorage.getItem('lastTab') || 'branding';
    navigate(`/${last}`);
  };
  return (
    <div className="mode-toggle" role="tablist" aria-label="Mode">
      <button
        className={`mode-btn ${!workMode ? 'on' : ''}`}
        title="Reference mode"
        aria-selected={!workMode}
        onClick={toReference}
      >
        <LayoutGrid size={16} /> <span className="mode-label">Reference</span>
      </button>
      <button
        className={`mode-btn ${workMode ? 'on' : ''}`}
        title="Work mode"
        aria-selected={workMode}
        onClick={() => navigate('/plan')}
      >
        <Briefcase size={16} /> <span className="mode-label">Work</span>
      </button>
    </div>
  );
}
