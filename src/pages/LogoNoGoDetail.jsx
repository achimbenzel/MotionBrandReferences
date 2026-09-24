import { useState } from 'react';
import { Maximize2, Ban, AlertTriangle } from 'lucide-react';
import { fileUrl } from '../lib/api.js';
import Lightbox from '../components/Lightbox.jsx';
import NotesField from '../components/NotesField.jsx';
import DetailLayout from '../components/DetailLayout.jsx';

/** A "Logo No-Go": the image of a logo/symbol to avoid, plus a note on why. */
export default function LogoNoGoDetail({ project, setProject }) {
  const [lightbox, setLightbox] = useState(false);
  const url = project.image ? fileUrl(project, project.image) : (project.thumb ? fileUrl(project, project.thumb) : null);

  return (
    <DetailLayout
      side={(
        <>
          <NotesField project={project} setProject={setProject} label="Why it's a no-go" placeholder="Its history / reputation and what to avoid…" />
        </>
      )}
    >
      <div className="nogo-banner"><AlertTriangle size={15} /> Avoid designs that resemble this.</div>

      {url ? (
        <figure className="media-frame" onClick={() => setLightbox(true)} title="Click to view fullscreen">
          <img src={url} alt={project.title || 'logo to avoid'} />
          <button className="media-fs icon-btn"><Maximize2 size={16} /></button>
        </figure>
      ) : (
        <div className="panel center-msg"><Ban size={26} /></div>
      )}


      {lightbox && url && (
        <Lightbox items={[{ src: url, caption: project.title }]} index={0} onIndex={() => {}} onClose={() => setLightbox(false)} />
      )}
    </DetailLayout>
  );
}
