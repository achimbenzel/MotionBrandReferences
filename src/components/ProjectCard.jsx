import { useNavigate } from 'react-router-dom';
import { Play, Palette, FileText, Image as ImageIcon, Film } from 'lucide-react';
import { fileUrl } from '../lib/api.js';
import { fmtTime } from '../lib/media.js';

const TYPE_META = {
  motion: { icon: Film, label: 'Motion' },
  color: { icon: Palette, label: 'Colors' },
  branding: { icon: FileText, label: 'Branding' },
};

export default function ProjectCard({ project }) {
  const navigate = useNavigate();
  const meta = TYPE_META[project.type];
  const Icon = meta.icon;
  const thumb = project.thumb ? fileUrl(project, project.thumb) : null;

  const subtitle = project.category
    || (project.type === 'color' && `${(project.colors || []).length} colors`)
    || (project.type === 'branding' && `${(project.assets || []).length} files`)
    || '';

  const open = () => {
    // Keep the header tab highlighted for this project's section.
    try { sessionStorage.setItem('lastTab', project.type); } catch { /* ignore */ }
    navigate(`/project/${project.id}`);
  };

  return (
    <div className="card" onClick={open}>
      <div className="card-thumb">
        {thumb ? (
          <img src={thumb} alt={project.title} loading="lazy" />
        ) : project.type === 'color' ? (
          <ColorThumb colors={project.colors} />
        ) : (
          <div className="card-thumb-empty">
            <Icon size={26} />
          </div>
        )}

        <span className="card-badge"><Icon size={13} /> {meta.label}</span>

        {project.type === 'motion' && (
          <>
            <div className="card-play"><span><Play size={20} fill="#fff" color="#fff" /></span></div>
            {project.duration ? <span className="card-duration">{fmtTime(project.duration)}</span> : null}
          </>
        )}
      </div>

      <div className="card-meta">
        <span className="card-title">{project.title}</span>
        {project.year ? <span className="card-year">{project.year}</span> : null}
      </div>
      {subtitle ? <div className="card-sub">{subtitle}</div> : null}

      {project.type === 'color' && project.colors?.length > 0 && (
        <div className="card-swatches">
          {project.colors.slice(0, 8).map((c) => (
            <span key={c.id} className="card-swatch" style={{ background: c.hex }} />
          ))}
        </div>
      )}
    </div>
  );
}

function ColorThumb({ colors = [] }) {
  const list = colors.slice(0, 5);
  if (!list.length) {
    return <div className="card-thumb-empty"><Palette size={26} /></div>;
  }
  return (
    <div style={{ display: 'flex', width: '100%', height: '100%' }}>
      {list.map((c) => (
        <div key={c.id} style={{ flex: 1, background: c.hex }} />
      ))}
    </div>
  );
}
