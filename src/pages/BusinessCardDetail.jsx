import { lazy, Suspense, useState } from 'react';
import { CreditCard, Tag, Maximize2, Box } from 'lucide-react';
import { api, fileUrl } from '../lib/api.js';
import { useToast } from '../components/Toast.jsx';
import TagInput from '../components/TagInput.jsx';
import Lightbox from '../components/Lightbox.jsx';
import NotesField from '../components/NotesField.jsx';
import DetailLayout from '../components/DetailLayout.jsx';
import { cardSize } from '../lib/types.js';

const BusinessCard3D = lazy(() => import('../components/BusinessCard3D.jsx')); // three.js only when needed

export default function BusinessCardDetail({ project, setProject }) {
  const toast = useToast();
  const size = cardSize(project.size);
  const ratio = `${size.w} / ${size.h}`;
  const [lightbox, setLightbox] = useState(-1);

  const savePaper = async (paper) => {
    setProject({ ...project, paper });
    try { setProject(await api.update(project.id, { paper })); }
    catch (e) { toast(`Could not save the paper: ${e.message}`, 'error'); }
  };
  const saveTags = async (tags) => {
    try { setProject(await api.update(project.id, { tags })); }
    catch (e) { toast(`Could not save tags: ${e.message}`, 'error'); }
  };

  const front = project.front ? fileUrl(project, project.front) : null;
  const back = project.back ? fileUrl(project, project.back) : null;
  const sides = [
    front && { label: 'Front', src: front },
    back && { label: 'Back', src: back },
  ].filter(Boolean);

  return (
    <DetailLayout
      side={(
        <>
          <div className="section">
            <div className="section-head"><h2><Tag size={16} /> Tags</h2></div>
            <TagInput tags={project.tags || []} onChange={saveTags} placeholder="color scheme, type…" />
          </div>

          <NotesField project={project} setProject={setProject} />
        </>
      )}
    >
      <div className="hint" style={{ marginBottom: 14 }}><CreditCard size={13} /> Size: <b>{size.label}</b></div>

      <div className="bc-detail">
        {sides.map((s, i) => (
          <figure key={s.label} className="media-frame bc-detail-side" onClick={() => setLightbox(i)} title="Fullscreen">
            <img src={s.src} alt={s.label} style={{ aspectRatio: ratio, objectFit: 'cover', width: '100%', maxHeight: 'none', borderRadius: 8 }} />
            <span className="bc-detail-label">{s.label}</span>
            <button className="media-fs icon-btn"><Maximize2 size={16} /></button>
          </figure>
        ))}
      </div>

      <div className="section">
        <div className="section-head"><h2><Box size={16} /> 3D view</h2></div>
        <Suspense fallback={<div className="bc3d-scene" />}>
          <BusinessCard3D front={front} back={back} size={size} paper={project.paper} onPaper={savePaper} name={project.title} />
        </Suspense>
      </div>

      {lightbox >= 0 && sides.length > 0 && (
        <Lightbox items={sides.map((s) => ({ src: s.src, caption: s.label }))} index={lightbox} onIndex={setLightbox} onClose={() => setLightbox(-1)} />
      )}
    </DetailLayout>
  );
}
