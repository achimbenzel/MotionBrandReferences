import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Trash2, Pencil, Image as ImageIcon, MoreHorizontal } from 'lucide-react';
import { api, fileUrl } from '../lib/api.js';
import { useToast } from '../components/Toast.jsx';
import Menu from '../components/Menu.jsx';
import EditDetailsModal from '../components/EditDetailsModal.jsx';
import ThumbnailStudio from '../components/ThumbnailStudio.jsx';
import LogoOptionsModal from '../components/LogoOptionsModal.jsx';
import MotionDetail from './MotionDetail.jsx';
import ColorDetail from './ColorDetail.jsx';
import BrandingDetail from './BrandingDetail.jsx';
import LogoDetail from './LogoDetail.jsx';
import BusinessCardDetail from './BusinessCardDetail.jsx';
import ImageGalleryItemDetail from './ImageGalleryItemDetail.jsx';
import { coverAspect } from '../lib/types.js';

export default function ProjectDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [project, setProject] = useState(null);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(false);
  const [thumbing, setThumbing] = useState(false);
  const [thumbSaving, setThumbSaving] = useState(false);
  const [logoOptions, setLogoOptions] = useState(false);

  useEffect(() => {
    let alive = true;
    setProject(null);
    setError(null);
    api.get(id)
      .then((p) => { if (alive) setProject(p); })
      .catch((e) => { if (alive) setError(e.message); });
    return () => { alive = false; };
  }, [id]);

  const remove = async () => {
    if (!window.confirm(`Delete “${project.title}” and all its files? This can’t be undone.`)) return;
    try {
      await api.remove(id);
      toast('Project deleted');
      navigate(`/${project.type}`);
    } catch (e) {
      toast(`Delete failed: ${e.message}`, 'error');
    }
  };

  const saveThumb = async (blob, meta) => {
    setThumbSaving(true);
    try {
      const updated = await api.setThumb(id, blob, meta);
      setProject(updated);
      setThumbing(false);
      toast('Cover updated');
    } catch (e) {
      toast(`Could not save cover: ${e.message}`, 'error');
    } finally {
      setThumbSaving(false);
    }
  };

  if (error) return <div className="detail"><BackBtn /> <div className="center-msg">Couldn’t load: {error}</div></div>;
  if (!project) return <div className="detail"><div className="spinner" /></div>;

  const Body = {
    motion: MotionDetail, color: ColorDetail, branding: BrandingDetail,
    logo: LogoDetail, businesscard: BusinessCardDetail, imagegallery: ImageGalleryItemDetail,
  }[project.type];

  const isImage = project.type === 'imagegallery';
  const canSetThumb = project.type === 'motion'
    || (project.type === 'branding' && (project.assets || []).length > 0)
    || project.type === 'color';

  const menuItems = isImage
    ? [{ label: 'Delete', icon: <Trash2 size={15} />, danger: true, onClick: remove }]
    : [
        { label: 'Rename / edit details', icon: <Pencil size={15} />, onClick: () => setEditing(true) },
        ...(project.type === 'logo' ? [{ label: 'Logo-Optionen', icon: <ImageIcon size={15} />, onClick: () => setLogoOptions(true) }] : []),
        ...(canSetThumb ? [{ label: 'Change cover', icon: <ImageIcon size={15} />, onClick: () => setThumbing(true) }] : []),
        { separator: true },
        { label: 'Delete project', icon: <Trash2 size={15} />, danger: true, onClick: remove },
      ];

  return (
    <div className="detail">
      <BackBtn to={`/${project.type}`} />
      <div className="detail-head">
        <div>
          {!isImage && <h1>{project.title}</h1>}
          {!isImage && <div className="sub">{[project.category, project.year].filter(Boolean).join(' · ')}</div>}
        </div>
        <div className="detail-actions">
          <Menu
            trigger={<button className="btn btn-sm"><Pencil size={15} /> Edit <MoreHorizontal size={15} /></button>}
            items={menuItems}
          />
        </div>
      </div>

      <Body project={project} setProject={setProject} />

      {editing && (
        <EditDetailsModal
          project={project}
          onClose={() => setEditing(false)}
          onSaved={(p) => { setProject(p); setEditing(false); }}
        />
      )}

      {thumbing && (
        <ThumbnailStudio
          type={project.type}
          aspect={coverAspect(project.type, project)}
          video={project.type === 'motion' ? fileUrl(project, project.video) : null}
          assets={project.type === 'branding'
            ? (project.assets || []).map((a) => ({ id: a.id, kind: a.kind, src: fileUrl(project, a.file), name: a.name }))
            : []}
          image={project.type === 'color' && project.example ? fileUrl(project, project.example) : null}
          initialMeta={project.thumbMeta}
          saving={thumbSaving}
          onDone={saveThumb}
          onClose={() => setThumbing(false)}
        />
      )}

      {logoOptions && (
        <LogoOptionsModal
          project={project}
          onClose={() => setLogoOptions(false)}
          onSaved={(p) => { setProject(p); setLogoOptions(false); }}
        />
      )}
    </div>
  );
}

function BackBtn({ to }) {
  const navigate = useNavigate();
  return (
    <button className="detail-back" onClick={() => (to ? navigate(to) : navigate(-1))}>
      <ArrowLeft size={16} /> Back
    </button>
  );
}
