import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Play, Palette, Square, X, Type } from 'lucide-react';
import { fileUrl } from '../lib/api.js';
import { fmtTime, formatOf } from '../lib/media.js';
import { cardSize, logoSource, logoScale, logoActive, hostOf, setLastTab } from '../lib/types.js';
import LogoImage from './LogoImage.jsx';
import { segmentColor, segmentName } from '../lib/segments.js';

// Hover previews only where there is a real hover (mouse / trackpad).
const canHover = () => typeof window !== 'undefined' && !!window.matchMedia?.('(hover: hover) and (pointer: fine)').matches;

export default function ProjectCard({ project, onRemove, removeTitle = 'Remove from gallery' }) {
  const navigate = useNavigate();
  const thumb = project.thumb ? fileUrl(project, project.thumb) : null;
  const isImage = project.type === 'imagegallery';
  const [preview, setPreview] = useState(false);
  const hoverTimer = useRef(0);
  const hasVideo = project.type === 'motion' && !!project.video;
  useEffect(() => () => clearTimeout(hoverTimer.current), []);
  // A motion card plays its video, muted, while the pointer rests on it.
  const hover = hasVideo ? {
    onMouseEnter: () => { if (canHover()) hoverTimer.current = setTimeout(() => setPreview(true), 220); },
    onMouseLeave: () => { clearTimeout(hoverTimer.current); setPreview(false); },
  } : {};

  const open = () => {
    setLastTab(project.type);
    navigate(`/project/${project.id}`);
  };

  const subtitle = project.category
    || (project.type === 'color' && `${(project.colors || []).length} colors`)
    || (project.type === 'businesscard' && cardSize(project.size).label)
    || (project.type === 'font' && hostOf(project.url))
    || '';

  return (
    <div className="card" onClick={open} {...hover}>
      {onRemove && (
        <button className="card-remove icon-btn" title={removeTitle}
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
          ) : project.type === 'font' ? (
            <div className="font-plate"><Type size={30} /><span>{hostOf(project.url) || 'Fonts'}</span></div>
          ) : (
            <div className="card-thumb-empty"><Palette size={26} /></div>
          )}

          {project.type === 'motion' && (
            <>
              {preview && <HoverVideo src={fileUrl(project, project.video)} />}
              <div className="card-play"><span><Play size={20} fill="#fff" color="#fff" /></span></div>
              <span className="card-badges">
                {formatOf(project.width, project.height) && <span className="card-badge">{formatOf(project.width, project.height)}</span>}
                {project.duration ? <span className="card-badge">{fmtTime(project.duration)}</span> : null}
              </span>
              <StructureStrip segments={project.segments} duration={Number(project.duration) || 0} />
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

// Muted, looping preview over the cover; shown once it actually plays (no
// black flash), with a thin progress line.
function HoverVideo({ src }) {
  const [ready, setReady] = useState(false);
  const [progress, setProgress] = useState(0);
  return (
    <>
      <video className={`card-preview ${ready ? 'on' : ''}`} src={src} muted loop playsInline autoPlay preload="auto"
        onPlaying={() => setReady(true)}
        onTimeUpdate={(e) => { const v = e.currentTarget; if (v.duration) setProgress(v.currentTime / v.duration); }} />
      {ready && <span className="card-preview-progress" style={{ width: `${progress * 100}%` }} />}
    </>
  );
}

// A motion video's sections as a thin coloured strip along the cover.
function StructureStrip({ segments, duration }) {
  if (!duration || !Array.isArray(segments) || !segments.length) return null;
  const list = [...segments].sort((a, b) => a.start - b.start);
  return (
    <div className="card-structure" title={list.map((s, i) => segmentName(s, i)).join(' → ')}>
      {list.map((s, i) => {
        const end = i < list.length - 1 ? list[i + 1].start : duration;
        return <span key={s.id} style={{ flexGrow: Math.max(0.0001, end - s.start), background: segmentColor(s.kind).fg }} />;
      })}
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
