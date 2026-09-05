import { useNavigate } from 'react-router-dom';
import { Play, Palette, Square, X } from 'lucide-react';
import { fileUrl } from '../lib/api.js';
import { fmtTime } from '../lib/media.js';
import { cardSize, logoSource, logoScale, logoActive } from '../lib/types.js';
import LogoImage from './LogoImage.jsx';

export default function ProjectCard({ project, onRemove }) {
  const navigate = useNavigate();
  const thumb = project.thumb ? fileUrl(project, project.thumb) : null;
  const isImage = project.type === 'imagegallery';

  const open = () => {
    try { sessionStorage.setItem('lastTab', project.type); } catch { /* ignore */ }
    navigate(`/project/${project.id}`);
  };

  const subtitle = project.category
    || (project.type === 'color' && `${(project.colors || []).length} colors`)
    || (project.type === 'branding' && `${(project.assets || []).length} files`)
    || (project.type === 'businesscard' && cardSize(project.size).label)
    || '';

  return (
    <div className="card" onClick={open}>
      {onRemove && (
        <button className="card-remove icon-btn" title="Remove from gallery"
          onClick={(e) => { e.stopPropagation(); onRemove(); }}><X size={15} /></button>
      )}

      {project.type === 'businesscard' ? (
        <BusinessCardThumb project={project} />
      ) : project.type === 'logo' ? (
        <LogoThumb project={project} />
      ) : (
        <div className="card-thumb">
          {thumb ? (
            <img src={thumb} alt={project.title || ''} loading="lazy" />
          ) : project.type === 'color' ? (
            <ColorThumb colors={project.colors} />
          ) : (
            <div className="card-thumb-empty"><Palette size={26} /></div>
          )}

          {project.type === 'motion' && (
            <>
              <div className="card-play"><span><Play size={20} fill="#fff" color="#fff" /></span></div>
              {project.duration ? <span className="card-duration">{fmtTime(project.duration)}</span> : null}
            </>
          )}
        </div>
      )}

      {!isImage && (
        <>
          <div className="card-meta">
            <span className="card-title">{project.title}</span>
            {project.year ? <span className="card-year">{project.year}</span> : null}
          </div>
          {subtitle ? <div className="card-sub">{subtitle}</div> : null}
        </>
      )}

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

function LogoThumb({ project }) {
  const src = logoSource(project);
  const scale = logoScale(project);
  const active = logoActive(project);
  const transparent = active.bg === 'transparent';
  return (
    <div className="card-thumb square">
      <div className={`logo-plate ${transparent ? 'checker' : ''}`} style={transparent ? undefined : { background: active.bg }}>
        {src ? <LogoImage url={fileUrl(project, src)} rendition={active.color} scalePct={scale * 100} alt={project.title} />
          : <div className="card-thumb-empty"><Square size={26} /></div>}
      </div>
    </div>
  );
}

function BusinessCardThumb({ project }) {
  const size = cardSize(project.size);
  const ratio = `${size.w} / ${size.h}`;
  const front = project.front ? fileUrl(project, project.front) : null;
  const back = project.back ? fileUrl(project, project.back) : null;
  const Side = ({ src, label }) => (
    <div className="bc-side" style={{ aspectRatio: ratio }}>
      {src ? <img src={src} alt={label} loading="lazy" /> : <div className="card-thumb-empty" />}
      <span className="bc-label">{label}</span>
    </div>
  );
  return (
    <div className="bc-stack">
      <Side src={front} label="Front" />
      <Side src={back} label="Back" />
    </div>
  );
}

function ColorThumb({ colors = [] }) {
  const list = colors.slice(0, 5);
  if (!list.length) return <div className="card-thumb-empty"><Palette size={26} /></div>;
  return (
    <div style={{ display: 'flex', width: '100%', height: '100%' }}>
      {list.map((c) => <div key={c.id} style={{ flex: 1, background: c.hex }} />)}
    </div>
  );
}
