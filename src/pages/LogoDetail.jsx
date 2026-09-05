import { useState } from 'react';
import { Square, Tag, Maximize2 } from 'lucide-react';
import { api, fileUrl } from '../lib/api.js';
import { useToast } from '../components/Toast.jsx';
import TagInput from '../components/TagInput.jsx';
import Lightbox from '../components/Lightbox.jsx';
import NotesField from '../components/NotesField.jsx';
import LogoImage from '../components/LogoImage.jsx';
import LogoSwitcher from '../components/LogoSwitcher.jsx';
import { logoSource, logoRenditionList, logoActive, logoScale } from '../lib/types.js';

export default function LogoDetail({ project, setProject }) {
  const toast = useToast();
  const src = logoSource(project);
  const url = src ? fileUrl(project, src) : null;
  const renditions = logoRenditionList(project);
  const scale = logoScale(project);
  const [active, setActive] = useState(logoActive(project));
  const [lightbox, setLightbox] = useState(false);
  const transparent = active?.bg === 'transparent';

  const choose = async (r) => {
    setActive(r);
    try { setProject(await api.update(project.id, { rendition: r })); }
    catch (e) { toast(`Could not save: ${e.message}`, 'error'); }
  };

  const saveTags = async (tags) => {
    try { setProject(await api.update(project.id, { tags })); }
    catch (e) { toast(`Could not save tags: ${e.message}`, 'error'); }
  };

  return (
    <div>
      <figure className={`logo-stage ${transparent ? 'checker' : ''}`} style={{ ...(transparent ? {} : { background: active?.bg || '#FFFFFF' }), maxWidth: 640, margin: '0 auto' }}
        onClick={() => url && setLightbox(true)} title="Fullscreen">
        {url ? <LogoImage url={url} rendition={active?.color || 'original'} scalePct={scale * 100} alt={project.title} />
          : <div className="card-thumb-empty"><Square size={30} /></div>}
        <button className="media-fs icon-btn" onClick={(e) => { e.stopPropagation(); setLightbox(true); }}><Maximize2 size={16} /></button>
      </figure>

      {/* Colour switcher — each option is a logo-colour + background pairing */}
      {url && renditions.length > 0 && (
        <LogoSwitcher url={url} renditions={renditions} selected={active} onSelect={choose} />
      )}

      <div className="section">
        <div className="section-head"><h2><Tag size={16} /> Tags</h2></div>
        <TagInput tags={project.tags || []} onChange={saveTags} placeholder="Add a tag…" />
      </div>

      <NotesField project={project} setProject={setProject} />

      {lightbox && url && (
        <Lightbox items={[{ src: url, caption: project.title }]} index={0} onIndex={() => {}} onClose={() => setLightbox(false)} />
      )}
    </div>
  );
}
