// The settings panel of a branding object in the 3D mockup editor, and the
// labelled choice row the editor's other panels use too.
import { FINISHES, CARD_SIZES, POSTER_SIZES, POSTER_FRAMES, BOX_MATERIALS, OBJECT_COLORS } from '../../lib/mockup3d/catalog.js';

const SWATCHES = (set, key, current, brand) => (
  <div className="mke-colors">
    <label title="Colour"><input type="color" value={(current || '#ffffff').toLowerCase()} onChange={(e) => set({ [key]: e.target.value.toUpperCase() })} /></label>
    {[...OBJECT_COLORS, ...brand.filter((h) => !OBJECT_COLORS.includes(h.toUpperCase()))].slice(0, 14).map((hex) => (
      <button key={hex} type="button" className={`mke-swatch ${current?.toUpperCase() === hex.toUpperCase() ? 'on' : ''}`} style={{ background: hex }} title={hex} onClick={() => set({ [key]: hex.toUpperCase() })} />
    ))}
  </div>
);
/** A row of choices with a label (Glass, Look, Finish …). */
export const Seg = ({ label, value, options, onChange }) => (
  <div className="mke-optrow">
    {label && <span className="mke-optlabel">{label}</span>}
    <div className="segmented segmented-sm mke-seg" role="group" aria-label={label}>
      {options.map(([k, l]) => <button key={k} type="button" className={value === k ? 'on' : ''} onClick={() => onChange(k)}>{l}</button>)}
    </div>
  </div>
);

/** The settings of a branding object: size, paper, finish, frame, box size, mug colours. */
export default function ObjectSettings({ o, set, brand }) {
  if (!o) return null;
  const finish = <Seg label="Finish" value={o.finish} options={Object.entries(FINISHES).map(([k, f]) => [k, f.label])} onChange={(v) => set({ finish: v })} />;
  if (o.type === 'card') {
    return (
      <div className="mke-obj">
        <Seg label="Size" value={o.size} options={Object.entries(CARD_SIZES).map(([k, c]) => [k, c.label])} onChange={(v) => set({ size: v })} />
        <Seg label="Shows" value={o.layout} options={[['single', 'One card'], ['pair', 'Front + back'], ['stack', 'Stack']]} onChange={(v) => set({ layout: v })} />
        <Seg label="Format" value={o.landscape ? 'l' : 'p'} options={[['l', 'Landscape'], ['p', 'Portrait']]} onChange={(v) => set({ landscape: v === 'l' })} />
        <Seg label="Corners" value={o.radius > 0 ? 'r' : 's'} options={[['s', 'Square'], ['r', 'Rounded']]} onChange={(v) => set({ radius: v === 'r' ? 3 : 0 })} />
        {finish}
        <div className="mke-subhead">Card colour</div>
        {SWATCHES(set, 'color', o.color, brand)}
      </div>
    );
  }
  if (o.type === 'poster') {
    return (
      <div className="mke-obj">
        <label className="mke-field">Size
          <select className="input" value={o.size} onChange={(e) => set({ size: e.target.value })}>
            {Object.entries(POSTER_SIZES).map(([k, x]) => <option key={k} value={k}>{x.label} · {x.w} × {x.h} cm</option>)}
          </select>
        </label>
        <Seg label="Format" value={o.landscape ? 'l' : 'p'} options={[['p', 'Portrait'], ['l', 'Landscape']]} onChange={(v) => set({ landscape: v === 'l' })} />
        <Seg label="Frame" value={o.frame} options={Object.entries(POSTER_FRAMES).map(([k, f]) => [k, k === 'none' ? 'None' : f.label])} onChange={(v) => set({ frame: v })} />
        {o.frame !== 'none' && <label className="mke-check"><input type="checkbox" checked={o.mat} onChange={(e) => set({ mat: e.target.checked })} /> Passe-partout</label>}
        <Seg label="Hangs" value={o.placement} options={[['wall', 'On the wall'], ['lean', 'Leaning'], ['free', 'Standing']]} onChange={(v) => set({ placement: v })} />
        {o.placement !== 'free' && (<><div className="mke-subhead">Wall</div>{SWATCHES(set, 'color2', o.color2, brand)}</>)}
        <div className="mke-subhead">Paper</div>
        {SWATCHES(set, 'color', o.color, brand)}
      </div>
    );
  }
  if (o.type === 'box') {
    const dim = (k, label) => (
      <label className="mke-field m2e-num">{label}
        <input className="input" type="number" min="1" max="200" step="0.5" value={o[k]} onChange={(e) => set({ [k]: Math.max(0.5, Math.min(200, Number(e.target.value) || 1)) })} />
      </label>
    );
    return (
      <div className="mke-obj">
        <div className="mke-dims">{dim('w', 'Width cm')}{dim('h', 'Height cm')}{dim('d', 'Depth cm')}</div>
        <Seg label="Board" value={o.material} options={Object.entries(BOX_MATERIALS).map(([k, x]) => [k, x.label])} onChange={(v) => set({ material: v })} />
        {finish}
      </div>
    );
  }
  return ( // mug
    <div className="mke-obj">
      <Seg label="Print" value={o.wrap} options={[['front', 'Front'], ['full', 'All round']]} onChange={(v) => set({ wrap: v })} />
      {finish}
      <div className="mke-subhead">Mug</div>
      {SWATCHES(set, 'color', o.color, brand)}
      <div className="mke-subhead">Inside</div>
      {SWATCHES(set, 'color2', o.color2, brand)}
    </div>
  );
}
