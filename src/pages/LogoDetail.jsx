import { useEffect, useRef, useState } from 'react';
import { Square, Tag, Maximize2, Sun, Moon } from 'lucide-react';
import { api, fileUrl } from '../lib/api.js';
import { useToast } from '../components/Toast.jsx';
import TagInput from '../components/TagInput.jsx';
import Lightbox from '../components/Lightbox.jsx';
import NotesField from '../components/NotesField.jsx';
import { logoVariants } from '../lib/types.js';

const BG_PRESETS = [
  { key: '#FFFFFF', label: 'White' },
  { key: '#111114', label: 'Black' },
  { key: 'transparent', label: 'Transparent' },
];

export default function LogoDetail({ project, setProject }) {
  const toast = useToast();
  const variants = logoVariants(project);
  const hasLight = !!variants.light;
  const hasDark = !!variants.dark;

  const [variant, setVariant] = useState(project.variant || (hasDark ? 'dark' : 'light'));
  const [bg, setBg] = useState(project.bg || '#FFFFFF');
  const [scale, setScale] = useState(typeof project.scale === 'number' ? project.scale : 0.7);
  const [lightbox, setLightbox] = useState(false);
  const scaleFirst = useRef(true);

  const currentFile = (variant === 'dark' ? (variants.dark || variants.light) : (variants.light || variants.dark))
    || project.assets?.[0]?.file || null;
  const transparent = bg === 'transparent';

  const save = async (patch) => {
    try { setProject(await api.update(project.id, patch)); }
    catch (e) { toast(`Could not save: ${e.message}`, 'error'); }
  };

  const chooseVariant = (v) => { setVariant(v); save({ variant: v }); };
  const chooseBg = (c) => { setBg(c); save({ bg: c }); };

  // Debounced scale save.
  useEffect(() => {
    if (scaleFirst.current) { scaleFirst.current = false; return; }
    const t = setTimeout(() => save({ scale }), 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scale]);

  const saveTags = async (tags) => {
    try { setProject(await api.update(project.id, { tags })); }
    catch (e) { toast(`Could not save tags: ${e.message}`, 'error'); }
  };

  return (
    <div>
      <div className="logo-layout">
        <figure className={`logo-stage ${transparent ? 'checker' : ''}`} style={transparent ? undefined : { background: bg }}
          onClick={() => currentFile && setLightbox(true)} title="Fullscreen">
          {currentFile ? (
            <img src={fileUrl(project, currentFile)} alt={project.title}
              style={{ width: `${scale * 100}%`, height: `${scale * 100}%`, objectFit: 'contain' }} />
          ) : <div className="card-thumb-empty"><Square size={30} /></div>}
          <button className="media-fs icon-btn"><Maximize2 size={16} /></button>
        </figure>

        <div className="logo-controls panel">
          {(hasLight || hasDark) && (
            <div className="field">
              <label>Version</label>
              <div className="segmented">
                <button className={variant === 'light' ? 'on' : ''} disabled={!hasLight} onClick={() => chooseVariant('light')}>
                  <Sun size={14} /> Hell
                </button>
                <button className={variant === 'dark' ? 'on' : ''} disabled={!hasDark} onClick={() => chooseVariant('dark')}>
                  <Moon size={14} /> Dunkel
                </button>
              </div>
              {(!hasLight || !hasDark) && <div className="hint" style={{ marginTop: 6 }}>Nur eine Version vorhanden — beide beim Anlegen hochladen.</div>}
            </div>
          )}

          <div className="field">
            <label>Hintergrund</label>
            <div className="bg-picker">
              {BG_PRESETS.map((p) => (
                <button key={p.key} type="button" title={p.label}
                  className={`bg-swatch ${p.key === 'transparent' ? 'checker' : ''} ${bg === p.key ? 'on' : ''}`}
                  style={p.key === 'transparent' ? undefined : { background: p.key }}
                  onClick={() => chooseBg(p.key)} />
              ))}
              <label className="bg-swatch bg-custom" title="Custom" style={{ background: transparent ? undefined : bg }}>
                <input type="color" value={transparent ? '#ffffff' : bg} onChange={(e) => chooseBg(e.target.value.toUpperCase())} />
              </label>
            </div>
          </div>

          <div className="field" style={{ marginBottom: 0 }}>
            <label>Größe · {Math.round(scale * 100)}%</label>
            <input type="range" min="0.2" max="1" step="0.01" value={scale}
              style={{ width: '100%', accentColor: 'var(--accent)' }}
              onChange={(e) => setScale(Number(e.target.value))} />
          </div>
        </div>
      </div>

      <div className="section">
        <div className="section-head"><h2><Tag size={16} /> Tags</h2></div>
        <TagInput tags={project.tags || []} onChange={saveTags} placeholder="Add a tag…" />
      </div>

      <NotesField project={project} setProject={setProject} />

      {lightbox && currentFile && (
        <Lightbox items={[{ src: fileUrl(project, currentFile), caption: project.title }]} index={0} onIndex={() => {}} onClose={() => setLightbox(false)} />
      )}
    </div>
  );
}
