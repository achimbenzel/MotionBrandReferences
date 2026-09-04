import { useState } from 'react';
import { FileText, Image as ImageIcon, Tag } from 'lucide-react';
import { api, fileUrl } from '../lib/api.js';
import { useToast } from '../components/Toast.jsx';
import TagInput from '../components/TagInput.jsx';
import PdfViewer from '../components/PdfViewer.jsx';

const SUGGESTIONS = ['Tech', 'Restaurant', 'Fashion', 'Sport', 'Finance', 'Food', 'Retail', 'Minimal', 'Colorful', 'Monochrome', 'Warm', 'Cool'];

export default function BrandingDetail({ project, setProject }) {
  const toast = useToast();
  const assets = project.assets || [];
  const [activeId, setActiveId] = useState(assets[0]?.id);
  const active = assets.find((a) => a.id === activeId) || assets[0];

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
      {assets.length > 1 && (
        <div className="asset-tabs">
          {assets.map((a, i) => (
            <button
              key={a.id}
              className={`asset-tab ${active?.id === a.id ? 'on' : ''}`}
              onClick={() => setActiveId(a.id)}
            >
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
          <div className="example-img" style={{ marginBottom: 0 }}>
            <img src={fileUrl(project, active.file)} alt={active.name || 'image'} style={{ maxHeight: '70vh' }} />
          </div>
        )
      ) : (
        <div className="panel center-msg">No files in this project.</div>
      )}

      {/* Quick gallery of all images */}
      {assets.filter((a) => a.kind === 'image').length > 1 && (
        <div className="section">
          <div className="section-head"><h2><ImageIcon size={16} /> Images</h2></div>
          <div className="image-gallery">
            {assets.filter((a) => a.kind === 'image').map((a) => (
              <img
                key={a.id}
                src={fileUrl(project, a.file)}
                alt={a.name || 'image'}
                onClick={() => setActiveId(a.id)}
                style={{ cursor: 'pointer' }}
              />
            ))}
          </div>
        </div>
      )}

      <div className="section">
        <div className="section-head"><h2><Tag size={16} /> Tags</h2></div>
        <TagInput tags={project.tags || []} onChange={saveTags} suggestions={SUGGESTIONS} placeholder="color scheme, type…" />
        <div className="hint" style={{ marginTop: 8 }}>Tag by color scheme and type (tech, restaurant…) to filter the grid.</div>
      </div>
    </div>
  );
}

const shorten = (n) => (n.length > 22 ? n.slice(0, 20) + '…' : n);
