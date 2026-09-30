// The plan page's blocks that hold things from elsewhere: references from
// the library and colour palettes.
import { Plus, X, Copy, Wand2, UploadCloud, Library, FolderOpen, File as FileIcon, Palette as PaletteIcon } from 'lucide-react';
import Menu from '../Menu.jsx';
import ProjectCard from '../ProjectCard.jsx';
import { fileUrl } from '../../lib/api.js';
import { rgbToHex, hexToRgb } from '../../lib/color.js';

const rid = () => Math.random().toString(36).slice(2, 8);

/** Library references (projects / galleries) as cards; refCache holds what was loaded for each. */
export function RefsBlock({ block: b, menu, icon: Icon, refCache, onPick, onRemove, onOpen }) {
  const items = b.items || [];
  return (
    <div className="section block">
      <div className="section-head">
        <h2><Icon size={16} /> {b.title} {items.length > 0 && <span className="count">{items.length}</span>}</h2>
        <div className="moodboard-actions">
          <button className="btn btn-sm" onClick={onPick}><Plus size={14} /> Add reference</button>{menu}
        </div>
      </div>
      {items.length ? (
        <div className="grid ref-grid">
          {items.map((r) => {
            const data = refCache[`${r.refKind}:${r.refId}`];
            if (data?.project) return <ProjectCard key={r.id} project={data.project} onRemove={() => onRemove(r.id)} removeTitle="Remove reference" />;
            if (data?.gallery) {
              const covers = (data.members || []).filter((m) => m.thumb).slice(0, 4);
              const count = (data.gallery.projectIds || []).length;
              return (
                <div className="card gallery-card" key={r.id} onClick={() => onOpen(r)}>
                  <button className="card-remove icon-btn" title="Remove reference" onClick={(e) => { e.stopPropagation(); onRemove(r.id); }}><X size={15} /></button>
                  <div className="gallery-mosaic">
                    {covers.length ? covers.map((m) => <img key={m.id} src={fileUrl(m, m.thumb)} alt="" loading="lazy" />)
                      : <div className="card-thumb-empty"><FolderOpen size={26} /></div>}
                  </div>
                  <div className="card-meta"><span className="card-title">{data.gallery.name}</span></div>
                  <div className="card-sub">{count} {count === 1 ? 'project' : 'projects'}</div>
                </div>
              );
            }
            if (data?.gone) return (
              <div className="card ref-gone" key={r.id}>
                <button className="card-remove icon-btn" title="Remove reference" onClick={() => onRemove(r.id)}><X size={15} /></button>
                <div className="card-thumb"><div className="card-thumb-empty"><FileIcon size={22} /></div></div>
                <div className="card-meta"><span className="card-title">{r.title || 'Missing item'}</span></div>
                <div className="card-sub">No longer in your library</div>
              </div>
            );
            return (
              <div className="card ref-loading" key={r.id}>
                <div className="card-thumb"><div className="spinner" /></div>
                <div className="card-meta"><span className="card-title">{r.title || '…'}</span></div>
                <div className="card-sub">{r.subtitle || 'Loading…'}</div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="dropzone" onClick={onPick}>
          <Library size={20} /><div>Attach references or galleries from your library</div>
        </div>
      )}
    </div>
  );
}

/** Colour swatches (hex + name), typed or extracted from a picture. */
export function PaletteBlock({ block: b, menu, icon: Icon, editBlock, onExtract, onFromApp, toast }) {
  const items = b.items || [];
  const setItems = (next) => editBlock(b.id, { items: next });
  const copyHex = async (hex) => { try { await navigator.clipboard.writeText(hex); toast(`Copied ${hex}`); } catch { toast('Copy failed', 'error'); } };
  const patchSwatch = (sid, p) => setItems(items.map((s) => (s.id === sid ? { ...s, ...p } : s)));
  return (
    <div className="section block">
      <div className="section-head">
        <h2><Icon size={16} /> {b.title} {items.length > 0 && <span className="count">{items.length}</span>}</h2>
        <div className="moodboard-actions">
          <Menu align="right" title="Extract colours" trigger={<button className="btn btn-sm"><Wand2 size={14} /> Extract from image</button>} items={[
            { label: 'Upload a picture…', icon: <UploadCloud size={15} />, onClick: onExtract },
            { label: 'A picture from the app…', icon: <Library size={15} />, onClick: onFromApp },
          ]} />
          <button className="btn btn-sm" onClick={() => setItems([...items, { id: rid(), hex: '#5B8CFF', name: '' }])}><Plus size={14} /> Add color</button>
          {menu}
        </div>
      </div>
      {items.length ? (
        <div className="swatchlist">
          {items.map((sw) => {
            const rgb = hexToRgb(sw.hex);
            const colorVal = rgb ? rgbToHex(rgb).toLowerCase() : '#000000';
            return (
              <div className="swatch" key={sw.id}>
                <label className="swatch-chip" style={{ background: sw.hex || 'var(--surface-2)' }} title="Pick colour">
                  <input type="color" value={colorVal} onChange={(e) => patchSwatch(sw.id, { hex: e.target.value.toUpperCase() })} />
                  <span className="swatch-actions" onClick={(e) => e.preventDefault()}>
                    <button className="icon-btn" title="Copy hex" onClick={() => copyHex(sw.hex)}><Copy size={13} /></button>
                    <button className="icon-btn" title="Remove" onClick={() => setItems(items.filter((x) => x.id !== sw.id))}><X size={13} /></button>
                  </span>
                </label>
                <div className="swatch-body">
                  <input className="input swatch-hex" value={sw.hex} onChange={(e) => patchSwatch(sw.id, { hex: e.target.value })} spellCheck={false} />
                  <input className="input swatch-name" value={sw.name} placeholder="Name…" onChange={(e) => patchSwatch(sw.id, { name: e.target.value })} />
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="dropzone" onClick={onExtract}>
          <PaletteIcon size={20} /><div>Extract colours from an image · or add them by hand</div>
          <div className="dropzone-or"><span>or</span>
            <button type="button" className="btn btn-sm" onClick={(e) => { e.stopPropagation(); onFromApp(); }}><Library size={14} /> From the app…</button>
          </div>
        </div>
      )}
    </div>
  );
}
