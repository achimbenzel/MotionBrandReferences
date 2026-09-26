import { ChevronDown } from 'lucide-react';
import Menu from '../Menu.jsx';
import { SEGMENT_KINDS, SHOT_STATUS, segmentColor, statusColor, sectionLabel, shotStatus } from '../../lib/storyboard.js';

const dot = (fg) => <span className="status-dot" style={{ background: fg }} />;

/** The section a shot belongs to (Hook, Problem …) — a coloured chip + menu. */
export function SectionPick({ value, onChange, compact = false }) {
  const c = value ? segmentColor(value) : null;
  return (
    <Menu align="left" title="Section"
      trigger={(
        <button type="button" className={`sb-chip ${value ? '' : 'empty'}`} style={c ? { background: c.bg, color: c.fg } : undefined}
          aria-label={`Section: ${sectionLabel(value) || 'none'}`}>
          {value ? sectionLabel(value) : (compact ? 'Section' : 'No section')} <ChevronDown size={11} />
        </button>
      )}
      items={[
        ...SEGMENT_KINDS.map((k) => ({ label: k.label, icon: dot(segmentColor(k.key).fg), onClick: () => onChange(k.key) })),
        { separator: true },
        { label: 'No section', icon: dot('var(--text-faint)'), onClick: () => onChange('') },
      ]}
    />
  );
}

/** Where a shot stands: sketch → styleframe → animated → approved. */
export function StatusPick({ value, onChange }) {
  const st = shotStatus(value);
  const c = st ? statusColor(value) : null;
  return (
    <Menu align="left" title="Status"
      trigger={(
        <button type="button" className={`sb-chip ${st ? '' : 'empty'}`} style={c ? { background: c.bg, color: c.fg } : undefined}
          aria-label={`Status: ${st?.label || 'none'}`}>
          {st ? st.label : 'Status'} <ChevronDown size={11} />
        </button>
      )}
      items={[
        ...SHOT_STATUS.map((s) => ({ label: s.label, icon: dot(statusColor(s.key).fg), onClick: () => onChange(s.key) })),
        { separator: true },
        { label: 'No status', icon: dot('var(--text-faint)'), onClick: () => onChange('') },
      ]}
    />
  );
}

/** A compact labelled dropdown (shot size, camera move, transition). */
export function TermSelect({ label, value, options, onChange, prefix = '' }) {
  const list = value && !options.includes(value) ? [value, ...options] : options;
  return (
    <label className={`sb-term ${value ? 'set' : ''}`} title={label}>
      <span className="sb-term-label">{prefix || label}</span>
      <select value={value || ''} onChange={(e) => onChange(e.target.value)} aria-label={label}>
        <option value="">—</option>
        {list.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  );
}
