import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Filter, X, Film, Palette, FileText, Square, CreditCard, FolderPlus, Images, Type } from 'lucide-react';
import { api, fileUrl } from '../lib/api.js';
import { lengthTag } from '../lib/media.js';
import ProjectCard from '../components/ProjectCard.jsx';
import GalleryNameModal from '../components/GalleryNameModal.jsx';
import ImageMasonry from '../components/ImageMasonry.jsx';

const HEAD = {
  branding: { title: 'Branding', desc: 'Brand guidelines, presentations & identity work.', icon: FileText },
  motion: { title: 'Motion Design', desc: 'Animations & motion pieces with notes, tags and keyframes.', icon: Film },
  logo: { title: 'Logos', desc: 'Logomarks — shown as square previews.', icon: Square },
  businesscard: { title: 'Business Cards', desc: 'Front & back, in 85×55 or 89×51 mm.', icon: CreditCard },
  color: { title: 'Colors', desc: 'Palettes with automatic hex / rgb / cmyk / pantone.', icon: Palette },
  imagegallery: { title: 'Image Gallery', desc: 'Images only — listed like a moodboard.', icon: Images },
  font: { title: 'Fonts', desc: 'Websites & sources for free fonts.', icon: Type },
};

/** Effective, filterable tag list for a project (adds the auto length tag). */
export function effectiveTags(project) {
  const tags = [...(project.tags || [])];
  if (project.type === 'motion' && project.duration) tags.push(lengthTag(project.duration));
  return tags;
}

export default function GridPage({ type, reloadKey, onAdd }) {
  const navigate = useNavigate();
  const [projects, setProjects] = useState(null);
  const [galleries, setGalleries] = useState([]);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState([]);
  const [mode, setMode] = useState(() => sessionStorage.getItem(`galmode:${type}`) || 'all');
  const [newGallery, setNewGallery] = useState(null); // null | true | { imageId }
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

  return (
    <div>
      <div className="page-head-row">
        <div className="page-head">
          <h1>{head.title}</h1>
          <p>{head.desc}</p>
        </div>
        <div className="segmented">
          <button className={mode === 'all' ? 'on' : ''} onClick={() => switchMode('all')}>All</button>
          <button className={mode === 'galleries' ? 'on' : ''} onClick={() => switchMode('galleries')}>Galleries</button>
        </div>
      </div>

      {error && <div className="center-msg">Couldn’t load: {error}</div>}
      {!projects && !error && <div className="spinner" />}

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
