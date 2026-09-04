import { useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { expandColor, readableText, hexToRgb } from '../lib/color.js';

const SPACES = [
  { key: 'hex', label: 'HEX', placeholder: '#2EC5D3' },
  { key: 'rgb', label: 'RGB', placeholder: '46, 197, 211' },
  { key: 'cmyk', label: 'CMYK', placeholder: '78, 7, 0, 17' },
  { key: 'pantone', label: 'Pantone', placeholder: 'Process Blue C' },
];

/** Inline form to compose a color; calls onAdd(colorObject). */
export default function ColorBuilder({ onAdd }) {
  const [space, setSpace] = useState('hex');
  const [value, setValue] = useState('');
  const [name, setName] = useState('');

  const expanded = useMemo(() => (value.trim() ? expandColor(space, value.trim()) : null), [space, value]);
  const previewRgb = expanded ? hexToRgb(expanded.hex) : null;

  const submit = () => {
    if (!expanded) return;
    onAdd({ name: name.trim() || 'Color', ...expanded });
    setValue('');
    setName('');
  };

  const spaceMeta = SPACES.find((s) => s.key === space);

  return (
    <div className="panel">
      <div className="color-builder">
        <div
          className="color-preview"
          style={{
            background: expanded ? expanded.hex : 'var(--surface-2)',
            color: previewRgb ? readableText(previewRgb) : 'var(--text-faint)',
          }}
        >
          {expanded ? expanded.hex : 'Preview'}
        </div>

        <div>
          <div className="field" style={{ marginBottom: 12 }}>
            <label>Name (optional)</label>
            <input className="input" value={name} placeholder="e.g. Primary" onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="row-2" style={{ marginBottom: 12 }}>
            <div>
              <label className="hint" style={{ display: 'block', marginBottom: 6 }}>Enter as</label>
              <select className="input" value={space} onChange={(e) => { setSpace(e.target.value); setValue(''); }}>
                {SPACES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
            </div>
            <div>
              <label className="hint" style={{ display: 'block', marginBottom: 6 }}>Value</label>
              <input
                className="input"
                value={value}
                placeholder={spaceMeta.placeholder}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } }}
              />
            </div>
          </div>
          <button type="button" className="btn btn-primary btn-sm" disabled={!expanded} onClick={submit}>
            <Plus size={15} /> Add color
          </button>
          {value.trim() && !expanded && <span className="hint" style={{ marginLeft: 10 }}>Couldn’t read that value</span>}
        </div>
      </div>
    </div>
  );
}
