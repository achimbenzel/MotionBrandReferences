import { useState } from 'react';
import { Square, Tag, Maximize2 } from 'lucide-react';
import { api, fileUrl } from '../lib/api.js';
import { useToast } from '../components/Toast.jsx';
import TagInput from '../components/TagInput.jsx';
import Lightbox from '../components/Lightbox.jsx';
import NotesField from '../components/NotesField.jsx';
import LogoImage from '../components/LogoImage.jsx';
import { logoSource, logoRenditions, logoHasOriginal, logoRendition, logoBg, logoScale } from '../lib/types.js';

export default function LogoDetail({ project, setProject }) {
  const toast = useToast();
  const src = logoSource(project);
  const url = src ? fileUrl(project, src) : null;
  const renditions = logoRenditions(project);
  const hasOriginal = logoHasOriginal(project);
  const bg = logoBg(project);
  const scale = logoScale(project);
  const [rendition, setRendition] = useState(logoRendition(project));
  const [lightbox, setLightbox] = useState(false);
  const transparent = bg === 'transparent';

  const choose = async (r) => {
    setRendition(r);
    try { setProject(await api.update(project.id, { rendition: r })); }
    catch (e) { toast(`Could not save: ${e.message}`, 'error'); }
  };

  const saveTags = async (tags) => {
    try { setProject(await api.update(project.id, { tags })); }
    catch (e) { toast(`Could not save tags: ${e.message}`, 'error'); }
  };

  return (
    <div>
      <figure className={`logo-stage ${transparent ? 'checker' : ''}`} style={{ ...(transparent ? {} : { background: bg }), maxWidth: 640, margin: '0 auto' }}
        onClick={() => url && setLightbox(true)} title="Fullscreen">
        {url ? <LogoImage url={url} rendition={rendition} scalePct={scale * 100} alt={project.title} />
          : <div className="card-thumb-empty"><Square size={30} /></div>}
        <button className="media-fs icon-btn" onClick={(e) => { e.stopPropagation(); setLightbox(true); }}><Maximize2 size={16} /></button>
      </figure>

      {/* Colour switcher — only thing under the canvas (bg/scale live in Edit) */}
      {url && (renditions.length > 0 || hasOriginal) && (
        <div className="logo-swatches">
          {renditions.map((c) => (
            <button key={c} type="button" title={c}
              className={`rend-swatch ${c === 'transparent' ? 'checker' : ''} ${rendition === c ? 'on' : ''}`}
              style={c === 'transparent' ? undefined : { background: c }}
              onClick={() => choose(c)} />
          ))}
          {hasOriginal && (
            <button type="button" title="Original (colour)"
              className={`rend-original ${rendition === 'original' ? 'on' : ''}`} onClick={() => choose('original')}>
              <img src={url} alt="original" />
            </button>
          )}
        </div>
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
