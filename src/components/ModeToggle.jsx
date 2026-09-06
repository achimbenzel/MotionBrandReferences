import { useNavigate } from 'react-router-dom';
import { LayoutGrid, PencilRuler } from 'lucide-react';

/**
 * Switches between Reference mode (the library) and Plan mode (planning new
 * projects). Sits on the left of the header, mirroring the storage pill.
 */
export default function ModeToggle({ planMode }) {
  const navigate = useNavigate();
  const toReference = () => {
    const last = sessionStorage.getItem('lastTab') || 'branding';
    navigate(`/${last}`);
  };
  return (
    <div className="mode-toggle" role="tablist" aria-label="Mode">
      <button
        className={`mode-btn ${!planMode ? 'on' : ''}`}
        title="Reference mode"
        aria-selected={!planMode}
        onClick={toReference}
      >
        <LayoutGrid size={16} /> <span className="mode-label">Reference</span>
      </button>
      <button
        className={`mode-btn ${planMode ? 'on' : ''}`}
        title="Plan mode"
        aria-selected={planMode}
        onClick={() => navigate('/plan')}
      >
        <PencilRuler size={16} /> <span className="mode-label">Plan</span>
      </button>
    </div>
  );
}
