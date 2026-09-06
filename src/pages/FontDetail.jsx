import { ExternalLink, Globe, Tag, Type } from 'lucide-react';
import { fileUrl } from '../lib/api.js';
import { api } from '../lib/api.js';
import { normalizeUrl, hostOf } from '../lib/types.js';
import { useToast } from '../components/Toast.jsx';
import TagInput from '../components/TagInput.jsx';
import NotesField from '../components/NotesField.jsx';

/** Detail for a "Fonts" entry — a link to a website for free fonts. */
export default function FontDetail({ project, setProject }) {
  const toast = useToast();
  const href = normalizeUrl(project.url);
  const shot = project.shot ? fileUrl(project, project.shot) : null;

  const saveTags = async (tags) => {
    try { setProject(await api.update(project.id, { tags })); }
    catch (e) { toast(`Could not save tags: ${e.message}`, 'error'); }
  };

  return (
    <div>
      {href ? (
        <a className="font-visit" href={href} target="_blank" rel="noopener noreferrer">
          {shot ? (
            <figure className="media-frame font-shot">
              <img src={shot} alt={project.title} />
              <span className="font-visit-badge"><ExternalLink size={15} /> Visit site</span>
            </figure>
          ) : (
            <div className="font-visit-tile">
              <Type size={34} />
              <span className="font-visit-host">{hostOf(project.url)}</span>
              <span className="font-visit-badge"><ExternalLink size={15} /> Visit site</span>
            </div>
          )}
        </a>
      ) : (
        <div className="panel" style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 28 }}>
          No URL yet. Use <strong>Edit</strong> to add the website address.
        </div>
      )}

      {href && (
        <div className="section">
          <div className="section-head"><h2><Globe size={16} /> Link</h2></div>
          <a className="font-link" href={href} target="_blank" rel="noopener noreferrer">
            {href} <ExternalLink size={14} />
          </a>
        </div>
      )}

      <div className="section">
        <div className="section-head"><h2><Tag size={16} /> Tags</h2></div>
        <TagInput tags={project.tags || []} onChange={saveTags} placeholder="Add a tag…" />
      </div>

      <NotesField project={project} setProject={setProject} />
    </div>
  );
}
