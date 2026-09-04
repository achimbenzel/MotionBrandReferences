import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { api } from '../lib/api.js';
import { useToast } from './Toast.jsx';

/** Rename a project and edit its year / category. */
export default function EditDetailsModal({ project, onClose, onSaved, focusField }) {
  const toast = useToast();
  const [title, setTitle] = useState(project.title || '');
  const [year, setYear] = useState(project.year || '');
  const [category, setCategory] = useState(project.category || '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !saving) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, saving]);

  const save = async () => {
    if (!title.trim() || saving) return;
    setSaving(true);
    try {
      const updated = await api.update(project.id, { title: title.trim(), year: year.trim(), category: category.trim() });
      onSaved(updated);
      toast('Project updated');
    } catch (e) {
      toast(`Update failed: ${e.message}`, 'error');
      setSaving(false);
    }
  };

  return (
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget && !saving) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true" style={{ maxWidth: 480 }}>
        <div className="modal-head">
          <h2>Edit project</h2>
          <button className="icon-btn" onClick={onClose} disabled={saving}><X size={18} /></button>
        </div>
        <div className="modal-body">
          <div className="field">
            <label>Title</label>
            <input className="input" value={title} autoFocus={focusField !== 'category'}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') save(); }} />
          </div>
          <div className="row-2">
            <div className="field">
              <label>Year</label>
              <input className="input" value={year} onChange={(e) => setYear(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') save(); }} />
            </div>
            <div className="field">
              <label>Category / subtitle</label>
              <input className="input" value={category} autoFocus={focusField === 'category'}
                onChange={(e) => setCategory(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') save(); }} />
            </div>
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={!title.trim() || saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
