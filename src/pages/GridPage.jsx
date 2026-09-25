import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Filter, X, Film, Palette, FileText, Square, CreditCard, FolderPlus, Images, Type, UploadCloud, Ban } from 'lucide-react';
import { api, fileUrl } from '../lib/api.js';
import { lengthTag, formatOf, probeVideo } from '../lib/media.js';
import { hexToRgb, readableText } from '../lib/color.js';
import { useToast } from '../components/Toast.jsx';
import ProjectCard from '../components/ProjectCard.jsx';
import GalleryNameModal from '../components/GalleryNameModal.jsx';
import ImageMasonry from '../components/ImageMasonry.jsx';
import MomentsGrid from '../components/MomentsGrid.jsx';

const HEAD = {
  branding: { title: 'Branding', desc: 'Brand guidelines, presentations & identity work.', icon: FileText },
  motion: { title: 'Motion Design', desc: 'Animations & motion pieces with notes, tags and keyframes.', icon: Film },
  logo: { title: 'Logos', desc: 'Logomarks — shown as square previews.', icon: Square },
  businesscard: { title: 'Business Cards', desc: 'Front & back, in 85×55 or 89×51 mm.', icon: CreditCard },
  color: { title: 'Colors', desc: 'Palettes with automatic hex / rgb / cmyk / pantone.', icon: Palette },
  imagegallery: { title: 'Image Gallery', desc: 'Images only — listed like a moodboard. Paste (⌘V) or drop images to add.', icon: Images },
  font: { title: 'Fonts', desc: 'Websites & sources for free fonts.', icon: Type },
  logonogo: { title: 'Logo No Go', desc: 'Logos & symbols with a bad reputation — so you can avoid resembling them.', icon: Ban },
};

/** Effective, filterable tag list for a project (adds the auto length and format tags). */
export function effectiveTags(project) {
  const tags = [...(project.tags || [])];
  if (project.type === 'motion' && project.duration) tags.push(lengthTag(project.duration));
  if (project.type === 'motion') { const f = formatOf(project.width, project.height); if (f) tags.push(f); }
  return tags;
}

export default function GridPage({ type, reloadKey, onAdd }) {
  const navigate = useNavigate();
  const toast = useToast();
  const [projects, setProjects] = useState(null);
  const [galleries, setGalleries] = useState([]);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState([]);
  const [mode, setMode] = useState(() => sessionStorage.getItem(`galmode:${type}`) || 'all');
  const [newGallery, setNewGallery] = useState(null); // null | true | { imageId }
  const [showAllColors, setShowAllColors] = useState(false);
  const [dropping, setDropping] = useState(false);
  const head = HEAD[type];
  const isImage = type === 'imagegallery';

  const refreshGalleries = () => api.listGalleries(type).then(setGalleries).catch(() => {});

  useEffect(() => {
    setMode(sessionStorage.getItem(`galmode:${type}`) || 'all');
  }, [type]);

  useEffect(() => {
    let alive = true;
    setProjects(null);
    setError(null);
    setSelected([]);
    Promise.all([api.list(type), api.listGalleries(type)])
      .then(([p, g]) => { if (alive) { setProjects(p); setGalleries(g); } })
      .catch((e) => { if (alive) setError(e.message); });
    return () => { alive = false; };
  }, [type, reloadKey]);

  const switchMode = (m) => { setMode(m); sessionStorage.setItem(`galmode:${type}`, m); };

  // Motion: videos added before formats were recorded get their size (and a
  // missing length) read once, in the background, one at a time.
  const probed = useRef(new Set());
  useEffect(() => {
    if (type !== 'motion' || !projects) return undefined;
    const next = projects.find((p) => p.video && (!p.width || !p.height || !p.duration) && !probed.current.has(p.id));
    if (!next) return undefined;
    probed.current.add(next.id);
    let alive = true;
    probeVideo(fileUrl(next, next.video)).then(async (d) => {
      if (!alive || !d) { if (alive) setProjects((list) => [...list]); return; } // move on to the next one
      try {
        const updated = await api.update(next.id, { width: d.w, height: d.h, ...(next.duration ? {} : { duration: d.d }) });
        if (alive) setProjects((list) => list.map((x) => (x.id === updated.id ? updated : x)));
      } catch { if (alive) setProjects((list) => [...list]); }
    });
    return () => { alive = false; };
  }, [type, projects]);

  const allTags = useMemo(() => {
    const set = new Map();
    (projects || []).forEach((p) => effectiveTags(p).forEach((t) => set.set(t, (set.get(t) || 0) + 1)));
    return [...set.keys()].sort((a, b) => set.get(b) - set.get(a));
  }, [projects]);

  const filtered = useMemo(() => {
    if (!projects) return [];
    if (!selected.length) return projects;
    return projects.filter((p) => { const tags = effectiveTags(p); return selected.every((t) => tags.includes(t)); });
  }, [projects, selected]);

  const toggle = (t) => setSelected((s) => (s.includes(t) ? s.filter((x) => x !== t) : [...s, t]));

  const createGallery = async (name) => {
    const g = await api.createGallery(type, name);
    if (newGallery && newGallery.imageId) await api.updateGallery(g.id, { projectIds: [newGallery.imageId] });
    setNewGallery(null);
    navigate(`/gallery/${g.id}`);
  };

  const byId = useMemo(() => Object.fromEntries((projects || []).map((p) => [p.id, p])), [projects]);

  // Every unique colour across all colour projects (for the "All colours" view).
  const allColorList = useMemo(() => {
    if (type !== 'color' || !projects) return [];
    const seen = new Map();
    for (const p of projects) for (const c of (p.colors || [])) {
      const hex = (c.hex || '').toUpperCase();
      if (hex && !seen.has(hex)) seen.set(hex, { hex, name: c.name });
    }
    return [...seen.values()];
  }, [type, projects]);

  const copyHex = async (hex) => {
    try { await navigator.clipboard.writeText(hex); toast(`${hex} copied`); }
    catch { toast('Clipboard unavailable (needs HTTPS or localhost)', 'error'); }
  };

  // Image Gallery: add images fast via paste (⌘V) or drag-and-drop.
  const refreshProjects = () => api.list(type).then(setProjects).catch(() => {});
  const addImages = async (fileList) => {
    const images = Array.from(fileList || []).filter((f) => f.type && f.type.startsWith('image/'));
    if (!images.length) return;
    try {
      for (const file of images) {
        const fd = new FormData();
        fd.append('type', 'imagegallery');
        fd.append('image', file);
        await api.create(fd);
      }
      await refreshProjects();
      toast(`Added ${images.length} image${images.length === 1 ? '' : 's'}`);
    } catch (e) { toast(`Upload failed: ${e.message}`, 'error'); }
  };
  useEffect(() => {
    if (!isImage) return undefined;
    const onPaste = (e) => {
      const files = [...(e.clipboardData?.items || [])]
        .filter((it) => it.type.startsWith('image/')).map((it) => it.getAsFile()).filter(Boolean);
      if (files.length) { e.preventDefault(); addImages(files); }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isImage, type]);

  const dropProps = isImage ? {
    onDragOver: (e) => { e.preventDefault(); setDropping(true); },
    onDragLeave: (e) => { if (e.target === e.currentTarget) setDropping(false); },
    onDrop: (e) => { e.preventDefault(); setDropping(false); addImages(e.dataTransfer.files); },
  } : {};

  return (
    <div {...dropProps}>
      {isImage && dropping && (
        <div className="drop-overlay"><UploadCloud size={30} /><div>Drop images to add</div></div>
      )}
      <div className="page-head-row">
        <div className="page-head">
          <h1>{head.title}</h1>
          <p>{head.desc}</p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {type === 'color' && mode === 'all' && (
            <button className={`btn btn-sm ${showAllColors ? 'btn-primary' : ''}`} onClick={() => setShowAllColors((v) => !v)}>
              <Palette size={15} /> All colours
            </button>
          )}
          <div className="segmented">
            <button className={mode === 'all' ? 'on' : ''} onClick={() => switchMode('all')}>All</button>
            {type === 'motion' && <button className={mode === 'moments' ? 'on' : ''} onClick={() => switchMode('moments')}>Moments</button>}
            <button className={mode === 'galleries' ? 'on' : ''} onClick={() => switchMode('galleries')}>Galleries</button>
          </div>
        </div>
      </div>

      {error && <div className="center-msg">Couldn’t load: {error}</div>}
      {!projects && !error && <div className="spinner" />}

      {/* -------- Moments mode (motion) -------- */}
      {projects && !error && mode === 'moments' && type === 'motion' && <MomentsGrid projects={projects} />}

      {/* -------- Galleries mode -------- */}
      {projects && !error && mode === 'galleries' && (
        <div className="grid">
          {galleries.map((g) => (
            <GalleryCard key={g.id} gallery={g} byId={byId} onOpen={() => navigate(`/gallery/${g.id}`)} />
          ))}
          <button className="gallery-new" onClick={() => setNewGallery(true)}>
            <FolderPlus size={26} />
            <span>New Gallery</span>
          </button>
        </div>
      )}

      {/* -------- All mode -------- */}
      {projects && !error && mode === 'all' && (
        <>
          {type === 'color' && showAllColors && (
            <div className="allcolors">
              {allColorList.length ? allColorList.map((c) => (
                <button key={c.hex} className="allcolor" style={{ background: c.hex, color: readableText(hexToRgb(c.hex)) }}
                  title={`${c.name || 'Color'} — click to copy`} onClick={() => copyHex(c.hex)}>{c.hex}</button>
              )) : <div className="hint" style={{ padding: 8 }}>No colours yet.</div>}
            </div>
          )}
          {allTags.length > 0 && (
            <div className="filter-row">
              <span className="filter-label"><Filter size={14} /> Filter</span>
              {allTags.map((t) => (
                <button key={t} className={`chip ${selected.includes(t) ? 'on' : ''}`} onClick={() => toggle(t)}>{t}</button>
              ))}
              {selected.length > 0 && <button className="chip clear" onClick={() => setSelected([])}><X size={13} /> Clear</button>}
            </div>
          )}

          {filtered.length > 0 ? (
            isImage ? (
              <ImageMasonry
                projects={filtered}
                setProjects={setProjects}
                galleries={galleries}
                onGalleriesChanged={refreshGalleries}
                onNewGallery={(imageId) => setNewGallery({ imageId })}
              />
            ) : (
              <div className="grid">{filtered.map((p) => <ProjectCard key={p.id} project={p} />)}</div>
            )
          ) : projects.length === 0 ? (
            <div className="empty">
              <head.icon size={30} />
              <h3>No {head.title.toLowerCase()} yet</h3>
              <p>Add your first piece to start building the library.</p>
              <button className="btn btn-primary" onClick={() => onAdd(type)}><Plus size={16} /> Add {head.title}</button>
            </div>
          ) : (
            <div className="empty">
              <Filter size={30} />
              <h3>Nothing matches</h3>
              <p>No projects have all of the selected tags.</p>
              <button className="btn" onClick={() => setSelected([])}>Clear filters</button>
            </div>
          )}
        </>
      )}

      {newGallery && (
        <GalleryNameModal onSubmit={createGallery} onClose={() => setNewGallery(null)} />
      )}
    </div>
  );
}

function GalleryCard({ gallery, byId, onOpen }) {
  const members = (gallery.projectIds || []).map((id) => byId[id]).filter(Boolean);
  const covers = members.filter((p) => p.thumb).slice(0, 4);
  return (
    <div className="card gallery-card" onClick={onOpen}>
      <div className="gallery-mosaic">
        {covers.length ? (
          covers.map((p) => <img key={p.id} src={fileUrl(p, p.thumb)} alt="" loading="lazy" />)
        ) : (
          <div className="card-thumb-empty"><Images size={26} /></div>
        )}
      </div>
      <div className="card-meta">
        <span className="card-title">{gallery.name}</span>
      </div>
      <div className="card-sub">{members.length} {members.length === 1 ? 'project' : 'projects'}</div>
    </div>
  );
}
