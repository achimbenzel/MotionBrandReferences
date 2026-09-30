// Two panels of the 3D mockup editor: the light (setups, your own HDRIs,
// shadow) and the background and format.
import { useRef } from 'react';
import { Sun, ImagePlus, Camera } from 'lucide-react';
import { mockupHdriUrl } from '../../lib/api.js';
import { FRAMES, TONES } from '../../lib/mockup3d/stage.js';
import { LIGHT_SETUPS } from '../../lib/mockup3d/lighting.js';
import Range from '../Range.jsx';
import { Seg } from './ObjectSettings.jsx';

const SHADOW_MODES = [['contact', 'Soft'], ['sun', 'Sun'], ['both', 'Both'], ['none', 'None']];
// A hint of each light setup for its button.
const LIGHT_SWATCH = {
  studio: 'radial-gradient(circle at 30% 25%, #f2f2f2 0 18%, #3a3a40 45%, #151518)',
  product: 'linear-gradient(90deg, #fff 0 5%, #050507 12% 88%, #fff 95%)',
  daylight: 'linear-gradient(90deg, #cfe2ff 0 22%, #b8a58c 30% 100%)',
  golden: 'linear-gradient(180deg, #3c5a9a 0%, #ff9b50 55%, #3b2616 60%)',
  overcast: 'linear-gradient(180deg, #f4f6fa 0%, #d9dde3 55%, #555 60%)',
  office: 'repeating-linear-gradient(90deg, #eee 0 10%, #3d3f44 10% 25%)',
  neon: 'linear-gradient(90deg, #ff2aa0 0 8%, #0c0b1c 20% 80%, #1ecbff 92%)',
};

/** Light: the setups and your HDRIs, how it's turned, brightness, look and shadow. */
export function LightSection({ light, setLight, hdris, onImportHdri }) {
  const hdriInput = useRef(null);
  return (
    <section>
      <h3><Sun size={12} style={{ verticalAlign: '-1px' }} /> Light</h3>
      <div className="mke-lights">
        {Object.entries(LIGHT_SETUPS).map(([k, s]) => (
          <button key={k} type="button" className={light.setup === k ? 'on' : ''} onClick={() => setLight({ setup: k })} title={s.note}>
            <i style={{ background: LIGHT_SWATCH[k] }} /><span>{s.label}</span>
          </button>
        ))}
        {hdris.map((h) => (
          <button key={h.id} type="button" className={light.setup === 'hdri' && light.hdri === h.id ? 'on' : ''} onClick={() => setLight({ setup: 'hdri', hdri: h.id })} title={`${h.name} — your HDRI`}>
            <i style={h.thumb ? { backgroundImage: `url(${mockupHdriUrl(h, h.thumb)})`, backgroundSize: 'cover', backgroundPosition: 'center' } : { background: '#444' }} /><span>{h.name}</span>
          </button>
        ))}
        <button type="button" className="mke-light-add" onClick={() => hdriInput.current?.click()} title="Your own .hdr / .exr, or a 2:1 panorama picture">
          <i><ImagePlus size={14} /></i><span>Import HDRI…</span>
        </button>
      </div>
      <input ref={hdriInput} type="file" accept=".hdr,.exr,.jpg,.jpeg,.png,.webp,.avif" className="visually-hidden-input" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; onImportHdri(f); }} />
      <label className="mke-range">Turn light <Range min="-180" max="180" value={light.rotation} onChange={(e) => setLight({ rotation: Number(e.target.value) })} /> <span>{light.rotation}°</span></label>
      <label className="mke-range">Brightness <Range min="0.3" max="2.5" step="0.05" value={light.exposure} onChange={(e) => setLight({ exposure: Number(e.target.value) })} /> <span>{Math.round(light.exposure * 100)}%</span></label>
      <Seg label="Look" value={light.tone || 'neutral'} options={Object.entries(TONES).map(([k, [l]]) => [k, l])} onChange={(v) => setLight({ tone: v })} />
      <div className="mke-subhead">Shadow</div>
      <div className="segmented mke-seg" role="group" aria-label="Shadow">
        {SHADOW_MODES.map(([k, label]) => <button key={k} type="button" className={light.shadow === k ? 'on' : ''} onClick={() => setLight({ shadow: k })}>{label}</button>)}
      </div>
      {light.shadow !== 'none' && (
        <label className="mke-range">Strength <Range min="0" max="1" step="0.05" value={light.strength} onChange={(e) => setLight({ strength: Number(e.target.value) })} /> <span>{Math.round(light.strength * 100)}%</span></label>
      )}
    </section>
  );
}

/** Background (none, colour, gradient or the room) and the picture format. */
export function BackgroundSection({ bg, setBg, light, setLight, brand, frame, onFrame }) {
  return (
    <section>
      <h3>Background &amp; format</h3>
      <div className="segmented mke-seg" role="group" aria-label="Background">
        {[['transparent', 'None'], ['color', 'Colour'], ['gradient', 'Gradient'], ['environment', 'Room']].map(([k, label]) => (
          <button key={k} type="button" className={bg.mode === k ? 'on' : ''} onClick={() => setBg({ mode: k })} title={k === 'environment' ? 'The light setup’s room / sky (or your HDRI) behind the scene' : undefined}>{label}</button>
        ))}
      </div>
      {bg.mode === 'environment' && (
        <label className="mke-range">Room blur <Range min="0" max="1" step="0.05" value={light.blur ?? 0.35} onChange={(e) => setLight({ blur: Number(e.target.value) })} /> <span>{Math.round((light.blur ?? 0.35) * 100)}%</span></label>
      )}
      {(bg.mode === 'color' || bg.mode === 'gradient') && (
        <div className="mke-colors">
          <label title="Colour"><input type="color" value={bg.color.toLowerCase()} onChange={(e) => setBg({ color: e.target.value.toUpperCase() })} /></label>
          {bg.mode === 'gradient' && <label title="Top colour"><input type="color" value={bg.color2.toLowerCase()} onChange={(e) => setBg({ color2: e.target.value.toUpperCase() })} /></label>}
          {brand.map((hex) => <button key={hex} type="button" className="mke-swatch" style={{ background: hex }} title={hex} onClick={() => setBg({ color: hex.toUpperCase() })} />)}
        </div>
      )}
      <div className="segmented mke-seg mke-frames" role="group" aria-label="Format">
        {Object.keys(FRAMES).map((f) => <button key={f} type="button" className={frame === f ? 'on' : ''} onClick={() => onFrame(f)}>{f}</button>)}
      </div>
      <div className="hint mke-tip"><Camera size={12} /> Drag to turn, scroll / pinch to zoom, right-drag to move.</div>
    </section>
  );
}
