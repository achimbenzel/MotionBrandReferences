import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Pencil, Trash2, Plus, MoreHorizontal, FolderOpen } from 'lucide-react';
import { api } from '../lib/api.js';
import { useToast } from '../components/Toast.jsx';
import Menu from '../components/Menu.jsx';
import ProjectCard from '../components/ProjectCard.jsx';
import GalleryPicker from '../components/GalleryPicker.jsx';
import GalleryNameModal from '../components/GalleryNameModal.jsx';
import { TABS } from '../lib/types.js';

export default function GalleryDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [gallery, setGallery] = useState(null);
  const [projects, setProjects] = useState([]);
  const [error, setError] = useState(null);
  const [picking, setPicking] = useState(false);
  const [renaming, setRenaming] = useState(false);

  useEffect(() => {
    let alive = true;
    setGallery(null); setError(null);
    api.getGallery(id)
      .then(async (g) => {
        if (!alive) return;
        setGallery(g);
        const p = await api.list(g.type);
        if (alive) setProjects(p);
      })
      .catch((e) => { if (alive) setError(e.message); });
    return () => { alive = false; };
  }, [id]);

  const members = useMemo(() => {
    if (!gallery) return [];
    const byId = Object.fromEntries(projects.map((p) => [p.id, p]));
    return (gallery.projectIds || []).map((pid) => byId[pid]).filter(Boolean);
  }, [gallery, projects]);

  const setIds = async (ids) => {
    try {
      const g = await api.updateGallery(id, { projectIds: ids });
      setGallery(g);
      setPicking(false);
    } catch (e) { toast(`Konnte nicht speichern: ${e.message}`, 'error'); }
  };

  const rename = async (name) => {
    try { setGallery(await api.updateGallery(id, { name })); setRenaming(false); toast('Galerie umbenannt'); }
    catch (e) { toast(`Umbenennen fehlgeschlagen: ${e.message}`, 'error'); }
  };

  const remove = async () => {
    if (!window.confirm(`Galerie „${gallery.name}“ löschen? Die Projekte bleiben erhalten.`)) return;
    try { await api.removeGallery(id); toast('Galerie gelöscht'); navigate(`/${gallery.type}`); }
    catch (e) { toast(`Löschen fehlgeschlagen: ${e.message}`, 'error'); }
  };

  if (error) return <div className="detail"><Back /> <div className="center-msg">Couldn’t load: {error}</div></div>;
  if (!gallery) return <div className="detail"><div className="spinner" /></div>;

  const typeLabel = TABS.find((t) => t.key === gallery.type)?.label || gallery.type;

  return (
    <div className="detail">
      <Back to={`/${gallery.type}`} label={`Zurück zu ${typeLabel}`} />
      <div className="detail-head">
        <div>
          <h1><FolderOpen size={22} style={{ verticalAlign: '-3px', marginRight: 8, color: 'var(--text-muted)' }} />{gallery.name}</h1>
          <div className="sub">{typeLabel} · {members.length} {members.length === 1 ? 'Projekt' : 'Projekte'}</div>
        </div>
        <div className="detail-actions">
          <button className="btn btn-sm btn-primary" onClick={() => setPicking(true)}><Plus size={15} /> Projekte</button>
          <Menu
            trigger={<button className="btn btn-sm"><Pencil size={15} /> <MoreHorizontal size={15} /></button>}
            items={[
              { label: 'Umbenennen', icon: <Pencil size={15} />, onClick: () => setRenaming(true) },
              { separator: true },
              { label: 'Galerie löschen', icon: <Trash2 size={15} />, danger: true, onClick: remove },
            ]}
          />
        </div>
      </div>

      {members.length ? (
        <div className="grid">
          {members.map((p) => (
            <ProjectCard key={p.id} project={p} onRemove={() => setIds((gallery.projectIds || []).filter((x) => x !== p.id))} />
          ))}
        </div>
      ) : (
        <div className="empty">
          <FolderOpen size={30} />
          <h3>Galerie ist leer</h3>
          <p>Füge Projekte hinzu, z. B. Brandings von grünen Tech-Firmen.</p>
          <button className="btn btn-primary" onClick={() => setPicking(true)}><Plus size={16} /> Projekte hinzufügen</button>
        </div>
      )}

      {picking && (
        <GalleryPicker
          projects={projects}
          selectedIds={gallery.projectIds || []}
          onSave={setIds}
          onClose={() => setPicking(false)}
        />
      )}
      {renaming && (
        <GalleryNameModal title="Galerie umbenennen" initialName={gallery.name} submitLabel="Speichern" onSubmit={rename} onClose={() => setRenaming(false)} />
      )}
    </div>
  );
}

function Back({ to, label = 'Back' }) {
  const navigate = useNavigate();
  return (
    <button className="detail-back" onClick={() => (to ? navigate(to) : navigate(-1))}>
      <ArrowLeft size={16} /> {label}
    </button>
  );
}
