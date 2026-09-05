import { useEffect, useState } from 'react';
import { X, Plus } from 'lucide-react';
import { api } from '../lib/api.js';
import { useToast } from './Toast.jsx';
import { logoRenditions, logoHasOriginal, logoBg, logoScale } from '../lib/types.js';

const BG_PRESETS = ['#FFFFFF', '#111114', 'transparent'];

/** Edit a logo's appearance: background, scale, colour renditions, original. */
export default function LogoOptionsModal({ project, onClose, onSaved }) {
  const toast = useToast();
  const [bg, setBg] = useState(logoBg(project));
  const [scale, setScale] = useState(logoScale(project));
  const [renditions, setRenditions] = useState(logoRenditions(project));
  const [original, setOriginal] = useState(logoHasOriginal(project));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !saving) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, saving]);

  const addColor = (c) => setRenditions((r) => (r.includes(c) ? r : [...r, c]));
  const removeColor = (c) => setRenditions((r) => r.filter((x) => x !== c));

  const save = async () => {
    setSaving(true);
    try {
      const updated = await api.update(project.id, { bg, scale, renditions, original });
      onSaved(updated);
      toast('Logo-Optionen gespeichert');
    } catch (e) {
      toast(`Speichern fehlgeschlagen: ${e.message}`, 'error');
      setSaving(false);
    }
  };

  return (
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget && !saving) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true" style={{ maxWidth: 460 }}>
        <div className="modal-head">
          <h2>Logo-Optionen</h2>
          <button className="icon-btn" onClick={onClose} disabled={saving}><X size={18} /></button>
        </div>
        <div className="modal-body">
          <div className="field">
            <label>Hintergrund</label>
            <div className="bg-picker">
              {BG_PRESETS.map((p) => (
                <button key={p} type="button" title={p}
                  className={`bg-swatch ${p === 'transparent' ? 'checker' : ''} ${bg === p ? 'on' : ''}`}
                  style={p === 'transparent' ? undefined : { background: p }} onClick={() => setBg(p)} />
              ))}
              <label className="bg-swatch bg-custom" title="Custom" style={bg === 'transparent' ? undefined : { background: bg }}>
                <input type="color" value={bg === 'transparent' ? '#ffffff' : bg} onChange={(e) => setBg(e.target.value.toUpperCase())} />
              </label>
            </div>
          </div>

          <div className="field">
            <label>Farben (Umfärben)</label>
            <div className="bg-picker" style={{ flexWrap: 'wrap' }}>
              {renditions.map((c) => (
                <span key={c} className="rend-edit">
                  <span className={`bg-swatch ${c === 'transparent' ? 'checker' : ''}`} style={c === 'transparent' ? undefined : { background: c }} />
                  <button type="button" className="rend-edit-x" onClick={() => removeColor(c)} title="Entfernen"><X size={11} /></button>
                </span>
              ))}
              <label className="bg-swatch bg-custom" title="Farbe hinzufügen">
                <Plus size={14} />
                <input type="color" onChange={(e) => addColor(e.target.value.toUpperCase())} />
              </label>
            </div>
            <label className="check-row" style={{ marginTop: 12 }}>
              <input type="checkbox" checked={original} onChange={(e) => setOriginal(e.target.checked)} />
              Original (Farbe) als Option anzeigen
            </label>
          </div>

          <div className="field" style={{ marginBottom: 0 }}>
            <label>Größe · {Math.round(scale * 100)}%</label>
            <input type="range" min="0.2" max="1" step="0.01" value={scale}
              style={{ width: '100%', accentColor: 'var(--accent)' }} onChange={(e) => setScale(Number(e.target.value))} />
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={onClose} disabled={saving}>Abbrechen</button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Speichern…' : 'Speichern'}</button>
        </div>
      </div>
    </div>
  );
}
