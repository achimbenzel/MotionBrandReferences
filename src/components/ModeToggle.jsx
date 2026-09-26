import { useNavigate } from 'react-router-dom';
import { LayoutGrid, Briefcase } from 'lucide-react';
import { WORK_HOME } from '../lib/types.js';

/**
 * Switches between Work mode (the default: Dashboard, Plans, To-Dos, Logo
 * Tester) on the left and Reference mode (the library) on the right. Switching
 * to Work always opens the Dashboard. In the folded sidebar (`rail`) the two
 * stand one above the other, as icons.
 */
export default function ModeToggle({ workMode, rail = false }) {
  const navigate = useNavigate();
  const toReference = () => {
    const last = sessionStorage.getItem('lastTab') || 'branding';
    navigate(`/${last}`);
  };
  return (
    <div className={`mode-toggle ${rail ? 'is-rail' : ''}`} role="tablist" aria-label="Mode">
      <button
        className={`mode-btn ${workMode ? 'on' : ''}`}
        title={rail ? undefined : 'Work mode'}
        data-tip="Work"
        aria-label="Work mode"
        aria-selected={workMode}
        onClick={() => navigate(WORK_HOME)}
      >
        <Briefcase size={16} /> <span className="mode-label">Work</span>
      </button>
      <button
        className={`mode-btn ${!workMode ? 'on' : ''}`}
        title={rail ? undefined : 'Reference mode'}
        data-tip="Reference"
        aria-label="Reference mode"
        aria-selected={!workMode}
        onClick={toReference}
      >
        <LayoutGrid size={16} /> <span className="mode-label">Reference</span>
      </button>
    </div>
  );
}
