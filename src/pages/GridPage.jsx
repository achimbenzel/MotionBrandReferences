import { useEffect, useMemo, useState } from 'react';
import { Plus, Filter, X, Film, Palette, FileText } from 'lucide-react';
import { api } from '../lib/api.js';
import { lengthTag } from '../lib/media.js';
import ProjectCard from '../components/ProjectCard.jsx';

const HEAD = {
  branding: { title: 'Branding', desc: 'Brand guidelines, presentations & identity work.', icon: FileText },
  motion: { title: 'Motion Design', desc: 'Animations & motion pieces with notes, tags and keyframes.', icon: Film },
  color: { title: 'Colors', desc: 'Palettes with automatic hex / rgb / cmyk / pantone.', icon: Palette },
};

/** Effective, filterable tag list for a project (adds the auto length tag). */
export function effectiveTags(project) {
  const tags = [...(project.tags || [])];
  if (project.type === 'motion' && project.duration) tags.push(lengthTag(project.duration));
  return tags;
}

export default function GridPage({ type, reloadKey, onAdd }) {
  const [projects, setProjects] = useState(null);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState([]);
  const head = HEAD[type];

  useEffect(() => {
    let alive = true;
    setProjects(null);
    setError(null);
    setSelected([]);
    api.list(type)
      .then((p) => { if (alive) setProjects(p); })
      .catch((e) => { if (alive) setError(e.message); });
    return () => { alive = false; };
  }, [type, reloadKey]);

  const allTags = useMemo(() => {
    const set = new Map();
    (projects || []).forEach((p) => effectiveTags(p).forEach((t) => set.set(t, (set.get(t) || 0) + 1)));
    return [...set.keys()].sort((a, b) => set.get(b) - set.get(a));
  }, [projects]);

  const filtered = useMemo(() => {
    if (!projects) return [];
    if (!selected.length) return projects;
    return projects.filter((p) => {
      const tags = effectiveTags(p);
      return selected.every((t) => tags.includes(t));
    });
  }, [projects, selected]);

  const toggle = (t) => setSelected((s) => (s.includes(t) ? s.filter((x) => x !== t) : [...s, t]));

  return (
    <div>
      <div className="page-head">
        <h1>{head.title}</h1>
        <p>{head.desc}</p>
      </div>

      {allTags.length > 0 && (
        <div className="filter-row">
          <span className="filter-label"><Filter size={14} /> Filter</span>
          {allTags.map((t) => (
            <button key={t} className={`chip ${selected.includes(t) ? 'on' : ''}`} onClick={() => toggle(t)}>
              {t}
            </button>
          ))}
          {selected.length > 0 && (
            <button className="chip clear" onClick={() => setSelected([])}>
              <X size={13} /> Clear
            </button>
          )}
        </div>
      )}

      {error && <div className="center-msg">Couldn’t load projects: {error}</div>}
      {!projects && !error && <div className="spinner" />}

      {projects && !error && (
        filtered.length > 0 ? (
          <div className="grid">
            {filtered.map((p) => <ProjectCard key={p.id} project={p} />)}
          </div>
        ) : projects.length === 0 ? (
          <div className="empty">
            <head.icon size={30} />
            <h3>No {head.title.toLowerCase()} yet</h3>
            <p>Add your first piece to start building the library.</p>
            <button className="btn btn-primary" onClick={() => onAdd(type)}>
              <Plus size={16} /> Add {head.title}
            </button>
          </div>
        ) : (
          <div className="empty">
            <Filter size={30} />
            <h3>Nothing matches</h3>
            <p>No projects have all of the selected tags.</p>
            <button className="btn" onClick={() => setSelected([])}>Clear filters</button>
          </div>
        )
      )}
    </div>
  );
}
