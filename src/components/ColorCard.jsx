import { Trash2 } from 'lucide-react';
import { rgbString, cmykString, readableText, hexToRgb } from '../lib/color.js';
import { useToast } from './Toast.jsx';

export default function ColorCard({ color, onRemove }) {
  const toast = useToast();
  const rgb = color.rgb || hexToRgb(color.hex);
  const text = readableText(rgb);

  const copy = (label, val) => {
    navigator.clipboard?.writeText(val).then(
      () => toast(`Copied ${label}`),
      () => toast('Copy failed', 'error'),
    );
  };

  const lines = [
    { k: 'HEX', v: color.hex, approx: false },
    { k: 'RGB', v: rgbString(rgb), approx: false },
    { k: 'CMYK', v: cmykString(color.cmyk), approx: true, note: true },
    { k: 'Pantone', v: color.pantone || '—', approx: !!color.pantoneApprox },
  ];

  return (
    <div className="color-card">
      <div className="color-swatch" style={{ background: color.hex, color: text }}>
        <span className="cname">{color.name}</span>
        {onRemove && (
          <button className="del" title="Remove color" onClick={onRemove}><Trash2 size={15} /></button>
        )}
      </div>
      <div className="color-body">
        {lines.map((l) => (
          <div key={l.k} className="color-line color-copy" onClick={() => copy(l.k, l.v)} title="Click to copy">
            <span className="k">{l.k}</span>
            <span className={`v ${l.approx ? 'approx' : ''}`}>{l.v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
