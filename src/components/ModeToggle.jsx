import { useNavigate } from 'react-router-dom';
import { LayoutGrid, Briefcase } from 'lucide-react';
import { WORK_HOME } from '../lib/types.js';

/**
 * Switches between Work mode (the default: Dashboard, Plans, To-Dos, Logo
 * Tester) on the left and Reference mode (the library) on the right. Switching
 * to Work always opens the Dashboard.
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
        className={`mode-btn ${workMode ? 'on' : ''}`}
        title="Work mode"
        aria-selected={workMode}
        onClick={() => navigate(WORK_HOME)}
      >
        <Briefcase size={16} /> <span className="mode-label">Work</span>
      </button>
      <button
        className={`mode-btn ${!workMode ? 'on' : ''}`}
        title="Reference mode"
        aria-selected={!workMode}
        onClick={toReference}
      >
        <LayoutGrid size={16} /> <span className="mode-label">Reference</span>
      </button>
    </div>
  );
}
