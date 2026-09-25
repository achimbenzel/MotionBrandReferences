import { planStatus, tagColor } from '../lib/types.js';

/** A plan's status as a small coloured pill (nothing when it has none). */
export default function StatusBadge({ status, className = '' }) {
  const s = planStatus(status);
  if (!s) return null;
  const c = tagColor(s.color);
  return (
    <span className={`status-badge ${className}`} style={{ background: c.bg, color: c.fg }}>
      <span className="status-dot" style={{ background: c.fg }} />{s.label}
    </span>
  );
}
