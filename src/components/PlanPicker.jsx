import { useEffect, useMemo, useState } from 'react';
import { X, Search, Check, PencilRuler } from 'lucide-react';
import { isTouch } from '../lib/useMedia.js';
import StatusBadge from './StatusBadge.jsx';

/**
 * Pick a plan from a searchable list (archived plans last). `current` is
 * highlighted; `allowNone` adds "No plan". onPick(planId | null).
 */
export default function PlanPicker({ plans, current = null, title = 'Choose a plan', allowNone = false, onPick, onClose }) {
  const [q, setQ] = useState('');
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return [...(plans || [])]
      .filter((p) => !t || `${p.name} ${p.client || ''}`.toLowerCase().includes(t))
      .sort((a, b) => Number(a.status === 'archived') - Number(b.status === 'archived'));
  }, [plans, q]);

  return (
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal plan-picker" role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>
        <div className="modal-body">
          <label className="pp-search">
            <Search size={15} />
            <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search plans…" autoFocus={!isTouch()} />
          </label>
          <div className="pp-list">
            {allowNone && (
              <button className={`pp-item ${!current ? 'on' : ''}`} onClick={() => onPick(null)}>
                <span className="pp-avatar"><X size={15} /></span>
                <span className="pp-name">No plan</span>
                {!current && <Check size={15} className="pp-check" />}
              </button>
            )}
            {list.map((p) => (
              <button key={p.id} className={`pp-item ${current === p.id ? 'on' : ''}`} onClick={() => onPick(p.id)}>
                <span className="pp-avatar">{p.avatarEmoji || <PencilRuler size={15} />}</span>
                <span className="pp-name">{p.name}{p.client ? <span className="pp-client"> · {p.client}</span> : null}</span>
                <StatusBadge status={p.status} />
                {current === p.id && <Check size={15} className="pp-check" />}
              </button>
            ))}
            {!list.length && <div className="hint" style={{ padding: 10 }}>{plans?.length ? 'No plan matches.' : 'No plans yet — create one under Plans.'}</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
