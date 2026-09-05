import { useState } from 'react';
import { Palette, Plus, Tag, Maximize2 } from 'lucide-react';
import { api, fileUrl } from '../lib/api.js';
import { useToast } from '../components/Toast.jsx';
import ColorCard from '../components/ColorCard.jsx';
import ColorBuilder from '../components/ColorBuilder.jsx';
import TagInput from '../components/TagInput.jsx';
import Lightbox from '../components/Lightbox.jsx';
import NotesField from '../components/NotesField.jsx';

export default function ColorDetail({ project, setProject }) {
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [lightbox, setLightbox] = useState(false);
  const colors = project.colors || [];

  const persist = async (nextColors) => {
    try {
      const updated = await api.update(project.id, { colors: nextColors });
      setProject(updated);
    } catch (e) {
      toast(`Could not save: ${e.message}`, 'error');
    }
  };

  const addColor = (c) => {
    persist([...colors, { id: Math.random().toString(36).slice(2, 8), ...c }]);
    setAdding(false);
  };
  const removeColor = (id) => persist(colors.filter((c) => c.id !== id));

  const saveTags = async (tags) => {
    try {
      const updated = await api.update(project.id, { tags });
      setProject(updated);
    } catch (e) {
      toast(`Could not save tags: ${e.message}`, 'error');
    }
  };

  return (
    <div>
      {project.example && (
        <figure className="media-frame" onClick={() => setLightbox(true)} title="Click to view fullscreen">
          <img src={fileUrl(project, project.example)} alt="example" />
          <button className="media-fs icon-btn"><Maximize2 size={16} /></button>
        </figure>
      )}

      <div className="section" style={{ marginTop: project.example ? 0 : 8 }}>
        <div className="section-head">
          <h2><Palette size={16} /> Palette <span className="count">{colors.length}</span></h2>
          <button className="btn btn-sm" onClick={() => setAdding((v) => !v)}>
            <Plus size={15} /> {adding ? 'Close' : 'Add color'}
          </button>
        </div>

        {adding && (
          <div style={{ marginBottom: 18 }}>
            <ColorBuilder onAdd={addColor} />
          </div>
        )}

        {colors.length === 0 ? (
          <div className="panel" style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 28 }}>
            No colors yet. Add one in any format — hex, rgb, cmyk or pantone — and all types show up automatically.
          </div>
        ) : (
          <div className="color-grid">
            {colors.map((c) => (
              <ColorCard key={c.id} color={c} onRemove={() => removeColor(c.id)} />
            ))}
          </div>
        )}
        <div className="hint" style={{ marginTop: 12 }}>
          CMYK is a standard approximation; Pantone is a nearest-match suggestion (labelled “approx.”). Click any value to copy.
        </div>
      </div>

      <div className="section">
        <div className="section-head"><h2><Tag size={16} /> Tags</h2></div>
        <TagInput tags={project.tags || []} onChange={saveTags} placeholder="Add a tag…" />
      </div>

      <NotesField project={project} setProject={setProject} />

      {lightbox && project.example && (
        <Lightbox
          items={[{ src: fileUrl(project, project.example), caption: project.title }]}
          index={0}
          onIndex={() => {}}
          onClose={() => setLightbox(false)}
        />
      )}
    </div>
  );
}
