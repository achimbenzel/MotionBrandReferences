import { useState } from 'react';
import { Square, Tag, Maximize2 } from 'lucide-react';
import { api, fileUrl } from '../lib/api.js';
import { useToast } from '../components/Toast.jsx';
import TagInput from '../components/TagInput.jsx';
import Lightbox from '../components/Lightbox.jsx';

export default function LogoDetail({ project, setProject }) {
  const toast = useToast();
  const images = project.assets || [];
  const [lightbox, setLightbox] = useState(-1);

  const saveTags = async (tags) => {
    try { setProject(await api.update(project.id, { tags })); }
    catch (e) { toast(`Could not save tags: ${e.message}`, 'error'); }
  };

  const items = images.map((a) => ({ src: fileUrl(project, a.file), caption: a.name }));

  return (
    <div>
      {images.length ? (
        <div className="logo-grid">
          {images.map((a, i) => (
            <figure key={a.id} className="logo-frame" onClick={() => setLightbox(i)} title="Fullscreen">
              <img src={fileUrl(project, a.file)} alt={a.name || 'logo'} />
              <button className="media-fs icon-btn"><Maximize2 size={16} /></button>
            </figure>
          ))}
        </div>
      ) : (
        <div className="panel center-msg"><Square size={26} /><div style={{ marginTop: 8 }}>No image in this logo project.</div></div>
      )}

      <div className="section">
        <div className="section-head"><h2><Tag size={16} /> Tags</h2></div>
        <TagInput tags={project.tags || []} onChange={saveTags} placeholder="Add a tag…" />
      </div>

      {lightbox >= 0 && items.length > 0 && (
        <Lightbox items={items} index={lightbox} onIndex={setLightbox} onClose={() => setLightbox(-1)} />
      )}
    </div>
  );
}
