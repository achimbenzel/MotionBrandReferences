import { useState } from 'react';
import { Plus } from 'lucide-react';
import LogoImage from './LogoImage.jsx';
import LogoSwitcher from './LogoSwitcher.jsx';
import { sameRendition } from '../lib/types.js';

/**
 * Full logo appearance editor: a preview, the rendition switcher (colour + bg
 * pairs), controls to add/remove pairs, and a scale slider. Used both when
 * creating a logo and in the Logo options edit dialog.
 */
export default function LogoRenditionsEditor({ url, renditions, setRenditions, selected, setSelected, scale, setScale }) {
  const [newColor, setNewColor] = useState('#111114');
  const [newBg, setNewBg] = useState('#FFFFFF');

  const addPair = (color) => {
    const pair = { color, bg: newBg };
    if (renditions.some((r) => sameRendition(r, pair))) { setSelected(pair); return; }
    setRenditions([...renditions, pair]);
    setSelected(pair);
  };
  const removeAt = (i) => {
    const removed = renditions[i];
    const next = renditions.filter((_, j) => j !== i);
    setRenditions(next);
    if (sameRendition(removed, selected)) setSelected(next[0]);
  };

  const transparent = selected?.bg === 'transparent';

  return (
    <div>
      <div className={`logo-stage ${transparent ? 'checker' : ''}`} style={{ ...(transparent ? {} : { background: selected?.bg || '#FFFFFF' }), maxWidth: 320, margin: '0 auto' }}>
        {url && <LogoImage url={url} rendition={selected?.color || 'original'} scalePct={scale * 100} alt="preview" />}
      </div>

      <LogoSwitcher url={url} renditions={renditions} selected={selected} onSelect={setSelected} onRemove={removeAt} />

      <div className="logo-add-row">
        <span className="hint">New combination:</span>
        <label className="mini-color" title="Logo colour"><span style={{ background: newColor }} /><input type="color" value={newColor} onChange={(e) => setNewColor(e.target.value.toUpperCase())} /></label>
        <span className="hint">on</span>
        <label className="mini-color" title="Background"><span className={newBg === 'transparent' ? 'checker' : ''} style={newBg === 'transparent' ? undefined : { background: newBg }} /><input type="color" value={newBg === 'transparent' ? '#ffffff' : newBg} onChange={(e) => setNewBg(e.target.value.toUpperCase())} /></label>
        <button type="button" className="btn btn-sm" onClick={() => addPair(newColor)}><Plus size={14} /> Colour</button>
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => addPair('original')}><Plus size={14} /> Original</button>
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => setNewBg((b) => (b === 'transparent' ? '#FFFFFF' : 'transparent'))}>
          {newBg === 'transparent' ? 'BG: Transparent' : 'BG: Colour'}
        </button>
      </div>

      <div className="field" style={{ marginTop: 14, marginBottom: 0 }}>
        <label>Size · {Math.round(scale * 100)}%</label>
        <input type="range" min="0.2" max="1" step="0.01" value={scale} style={{ width: '100%', accentColor: 'var(--accent)' }} onChange={(e) => setScale(Number(e.target.value))} />
      </div>
    </div>
  );
}
