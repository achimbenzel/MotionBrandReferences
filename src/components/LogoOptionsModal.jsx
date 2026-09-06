import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { api, fileUrl } from '../lib/api.js';
import { useToast } from './Toast.jsx';
import LogoRenditionsEditor from './LogoRenditionsEditor.jsx';
import { logoSource, logoRenditionList, logoActive, logoScale } from '../lib/types.js';

/** Edit a logo's appearance: colour+background renditions and scale. */
export default function LogoOptionsModal({ project, onClose, onSaved }) {
  const toast = useToast();
  const url = logoSource(project) ? fileUrl(project, logoSource(project)) : null;
  const [renditions, setRenditions] = useState(logoRenditionList(project));
  const [selected, setSelected] = useState(logoActive(project));
  const [scale, setScale] = useState(logoScale(project));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !saving) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, saving]);

  const save = async () => {
    setSaving(true);
    try {
      const list = renditions.length ? renditions : [{ color: 'original', bg: '#FFFFFF' }];
      const sel = list.some((r) => r.color === selected?.color && r.bg === selected?.bg) ? selected : list[0];
      const updated = await api.update(project.id, { renditions: list, rendition: sel, scale });
      onSaved(updated);
      toast('Logo options saved');
    } catch (e) {
      toast(`Save failed: ${e.message}`, 'error');
      setSaving(false);
    }
  };

  return (
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget && !saving) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true" style={{ maxWidth: 520 }}>
        <div className="modal-head">
          <h2>Logo options</h2>
          <button className="icon-btn" onClick={onClose} disabled={saving}><X size={18} /></button>
        </div>
        <div className="modal-body">
          <LogoRenditionsEditor url={url} renditions={renditions} setRenditions={setRenditions}
            selected={selected} setSelected={setSelected} scale={scale} setScale={setScale} />
        </div>
        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    </div>
  );
}
