import { useState } from 'react';
import { Maximize2, Image as ImageIcon } from 'lucide-react';
import { fileUrl } from '../lib/api.js';
import Lightbox from '../components/Lightbox.jsx';

/** A single image-gallery item — just the image, shown at its true ratio. */
export default function ImageGalleryItemDetail({ project }) {
  const [lightbox, setLightbox] = useState(false);
  const url = project.image ? fileUrl(project, project.image) : (project.thumb ? fileUrl(project, project.thumb) : null);

  return (
    <div>
      {url ? (
        <figure className="media-frame" onClick={() => setLightbox(true)} title="Fullscreen">
          <img src={url} alt="" />
          <button className="media-fs icon-btn"><Maximize2 size={16} /></button>
        </figure>
      ) : (
        <div className="panel center-msg"><ImageIcon size={26} /></div>
      )}

      {lightbox && url && (
        <Lightbox items={[{ src: url }]} index={0} onIndex={() => {}} onClose={() => setLightbox(false)} />
      )}
    </div>
  );
}
