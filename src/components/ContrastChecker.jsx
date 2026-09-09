import { useState } from 'react';
import { hexToRgb, contrastRatio, contrastLevels } from '../lib/color.js';

/** WCAG contrast checker between a text and a background colour. */
export default function ContrastChecker({ initialFg = '#111114', initialBg = '#FFFFFF' }) {
  const [fg, setFg] = useState(initialFg);
  const [bg, setBg] = useState(initialBg);
  const ratio = contrastRatio(hexToRgb(fg), hexToRgb(bg));
  const lv = contrastLevels(ratio);

  const swap = () => { setFg(bg); setBg(fg); };
  const Badge = ({ ok, label }) => <span className={`ct-badge ${ok ? 'pass' : 'fail'}`}>{label} {ok ? '✓' : '✕'}</span>;

  return (
    <div className="panel contrast">
      <div className="ct-preview" style={{ background: bg, color: fg }}>
        <span className="ct-big">Aa</span>
        <span className="ct-small">The quick brown fox jumps</span>
      </div>
      <div className="ct-controls">
        <label className="ct-swatch"><input type="color" value={fg} onChange={(e) => setFg(e.target.value)} /><span>Text</span></label>
        <button className="btn btn-ghost btn-sm ct-swap" onClick={swap} title="Swap">⇄</button>
        <label className="ct-swatch"><input type="color" value={bg} onChange={(e) => setBg(e.target.value)} /><span>Background</span></label>
        <div className="ct-ratio">{ratio.toFixed(2)}:1</div>
      </div>
      <div className="ct-badges">
        <Badge ok={lv.normalAA} label="AA" />
        <Badge ok={lv.normalAAA} label="AAA" />
        <Badge ok={lv.largeAA} label="AA large" />
        <Badge ok={lv.largeAAA} label="AAA large" />
      </div>
    </div>
  );
}
