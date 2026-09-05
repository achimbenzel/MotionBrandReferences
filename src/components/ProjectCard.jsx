import { useNavigate } from 'react-router-dom';
import { Play, Palette, FileText, Film, Square, CreditCard, X } from 'lucide-react';
import { fileUrl } from '../lib/api.js';
import { fmtTime } from '../lib/media.js';
import { cardSize, logoFileFor, logoBg, logoScale } from '../lib/types.js';

const TYPE_META = {
  motion: { icon: Film, label: 'Motion' },
  color: { icon: Palette, label: 'Colors' },
  branding: { icon: FileText, label: 'Branding' },
  logo: { icon: Square, label: 'Logo' },
  businesscard: { icon: CreditCard, label: 'Business Card' },
};

export default function ProjectCard({ project, onRemove }) {
  const navigate = useNavigate();
  const meta = TYPE_META[project.type];
  const Icon = meta.icon;
  const thumb = project.thumb ? fileUrl(project, project.thumb) : null;

  const open = () => {
    try { sessionStorage.setItem('lastTab', project.type); } catch { /* ignore */ }
    navigate(`/project/${project.id}`);
  };

  const subtitle = project.category
    || (project.type === 'color' && `${(project.colors || []).length} colors`)
    || (project.type === 'branding' && `${(project.assets || []).length} files`)
    || (project.type === 'businesscard' && cardSize(project.size).label)
    || (project.type === 'logo' && `${(project.assets || []).length} image${(project.assets || []).length === 1 ? '' : 's'}`)
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
            <img src={thumb} alt={project.title} loading="lazy" />
          ) : project.type === 'color' ? (
            <ColorThumb colors={project.colors} />
          ) : (
            <div className="card-thumb-empty"><Icon size={26} /></div>
          )}

          <span className="card-badge"><Icon size={13} /> {meta.label}</span>

          {project.type === 'motion' && (
            <>
              <div className="card-play"><span><Play size={20} fill="#fff" color="#fff" /></span></div>
              {project.duration ? <span className="card-duration">{fmtTime(project.duration)}</span> : null}
            </>
          )}
        </div>
      )}

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

function BusinessCardThumb({ project }) {
  const size = cardSize(project.size);
  const ratio = `${size.w} / ${size.h}`;
  const front = project.front ? fileUrl(project, project.front) : null;
  const back = project.back ? fileUrl(project, project.back) : null;
  const Side = ({ src, label }) => (
    <div className="bc-side" style={{ aspectRatio: ratio }}>
      {src ? <img src={src} alt={label} loading="lazy" /> : <div className="card-thumb-empty"><CreditCard size={20} /></div>}
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

function LogoThumb({ project }) {
  const file = logoFileFor(project);
  const bg = logoBg(project);
  const scale = logoScale(project);
  const transparent = bg === 'transparent';
  return (
    <div className="card-thumb square">
      <div className={`logo-plate ${transparent ? 'checker' : ''}`} style={transparent ? undefined : { background: bg }}>
        {file ? (
          <img src={fileUrl(project, file)} alt={project.title} loading="lazy"
            style={{ width: `${scale * 100}%`, height: `${scale * 100}%`, objectFit: 'contain' }} />
        ) : <div className="card-thumb-empty"><Square size={26} /></div>}
      </div>
      <span className="card-badge"><Square size={13} /> Logo</span>
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
