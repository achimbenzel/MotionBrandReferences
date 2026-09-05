import { X } from 'lucide-react';
import LogoImage from './LogoImage.jsx';
import { sameRendition } from '../lib/types.js';

/**
 * Row of rendition swatches. Each swatch previews the pairing (the logo in that
 * colour on that background). Clicking selects it. If `onRemove` is given, a
 * small delete affordance shows on hover (kept to at least one rendition).
 */
export default function LogoSwitcher({ url, renditions, selected, onSelect, onRemove }) {
  return (
    <div className="logo-swatches">
      {renditions.map((r, i) => {
        const on = sameRendition(r, selected);
        const transparent = r.bg === 'transparent';
        return (
          <span className="rend-edit" key={`${r.color}-${r.bg}-${i}`}>
            <button
              type="button"
              className={`rend-swatch ${transparent ? 'checker' : ''} ${on ? 'on' : ''}`}
              style={transparent ? undefined : { background: r.bg }}
              title={r.color === 'original' ? 'Original' : `${r.color} auf ${r.bg}`}
              onClick={() => onSelect(r)}
            >
              {url && <LogoImage url={url} rendition={r.color} scalePct={72} alt="" />}
            </button>
            {onRemove && renditions.length > 1 && (
              <button type="button" className="rend-edit-x" title="Entfernen" onClick={() => onRemove(i)}><X size={11} /></button>
            )}
          </span>
        );
      })}
    </div>
  );
}
