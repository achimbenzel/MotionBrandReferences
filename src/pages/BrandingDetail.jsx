import { useState } from 'react';
import { FileText, Image as ImageIcon, Tag, Maximize2 } from 'lucide-react';
import { api, fileUrl } from '../lib/api.js';
import { useToast } from '../components/Toast.jsx';
import TagInput from '../components/TagInput.jsx';
import PdfViewer from '../components/PdfViewer.jsx';
import Lightbox from '../components/Lightbox.jsx';

const SUGGESTIONS = ['Tech', 'Restaurant', 'Fashion', 'Sport', 'Finance', 'Food', 'Retail', 'Minimal', 'Colorful', 'Monochrome', 'Warm', 'Cool'];

export default function BrandingDetail({ project, setProject }) {
  const toast = useToast();
  const assets = project.assets || [];
  const imageAssets = assets.filter((a) => a.kind === 'image');
  const [activeId, setActiveId] = useState(assets[0]?.id);
  const [lightbox, setLightbox] = useState(-1);
  const active = assets.find((a) => a.id === activeId) || assets[0];

  const lightboxItems = imageAssets.map((a) => ({ src: fileUrl(project, a.file), caption: a.name }));
  const openLightbox = (assetId) => setLightbox(Math.max(0, imageAssets.findIndex((a) => a.id === assetId)));

  const saveTags = async (tags) => {
    try { setProject(await api.update(project.id, { tags })); }
    catch (e) { toast(`Could not save tags: ${e.message}`, 'error'); }
  };

  return (
    <div>
      {assets.length > 1 && (
        <div className="asset-tabs">
          {assets.map((a, i) => (
            <button key={a.id} className={`asset-tab ${active?.id === a.id ? 'on' : ''}`} onClick={() => setActiveId(a.id)}>
              {a.kind === 'pdf' ? <FileText size={14} /> : <ImageIcon size={14} />}
              {a.name ? shorten(a.name) : `${a.kind} ${i + 1}`}
            </button>
          ))}
        </div>
      )}

      {active ? (
        active.kind === 'pdf' ? (
          <PdfViewer url={fileUrl(project, active.file)} />
        ) : (
          <figure className="media-frame" onClick={() => openLightbox(active.id)} title="Click to view fullscreen">
            <img src={fileUrl(project, active.file)} alt={active.name || 'image'} />
            <button className="media-fs icon-btn"><Maximize2 size={16} /></button>
          </figure>
        )
      ) : (
        <div className="panel center-msg">No files in this project.</div>
      )}

      {imageAssets.length > 1 && (
        <div className="section">
          <div className="section-head"><h2><ImageIcon size={16} /> Images <span className="count">{imageAssets.length}</span></h2></div>
          <div className="image-gallery">
            {imageAssets.map((a) => (
              <img key={a.id} src={fileUrl(project, a.file)} alt={a.name || 'image'} onClick={() => openLightbox(a.id)} style={{ cursor: 'pointer' }} />
            ))}
          </div>
        </div>
      )}

      <div className="section">
        <div className="section-head"><h2><Tag size={16} /> Tags</h2></div>
        <TagInput tags={project.tags || []} onChange={saveTags} suggestions={SUGGESTIONS} placeholder="color scheme, type…" />
        <div className="hint" style={{ marginTop: 8 }}>Tag by color scheme and type (tech, restaurant…) to filter the grid.</div>
      </div>

      {lightbox >= 0 && lightboxItems.length > 0 && (
        <Lightbox items={lightboxItems} index={lightbox} onIndex={setLightbox} onClose={() => setLightbox(-1)} />
      )}
    </div>
  );
}

const shorten = (n) => (n.length > 22 ? n.slice(0, 20) + '…' : n);
