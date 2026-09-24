import { useEffect, useState, lazy, Suspense } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Trash2, Pencil, Image as ImageIcon, MoreHorizontal, ChevronLeft, ChevronRight } from 'lucide-react';
import { api, fileUrl } from '../lib/api.js';
import { useToast } from '../components/Toast.jsx';
import Menu from '../components/Menu.jsx';
import EditDetailsModal from '../components/EditDetailsModal.jsx';
import LogoOptionsModal from '../components/LogoOptionsModal.jsx';
import { coverAspect, setLastTab } from '../lib/types.js';

// Per-type bodies + the (heavy, imaging-backed) thumbnail studio are split into
// their own chunks — opening a colour project doesn't pull the branding/logo
// code, and the studio only loads when you actually change a cover.
const ThumbnailStudio = lazy(() => import('../components/ThumbnailStudio.jsx'));
const MotionDetail = lazy(() => import('./MotionDetail.jsx'));
const ColorDetail = lazy(() => import('./ColorDetail.jsx'));
const BrandingDetail = lazy(() => import('./BrandingDetail.jsx'));
const LogoDetail = lazy(() => import('./LogoDetail.jsx'));
const BusinessCardDetail = lazy(() => import('./BusinessCardDetail.jsx'));
const ImageGalleryItemDetail = lazy(() => import('./ImageGalleryItemDetail.jsx'));
const FontDetail = lazy(() => import('./FontDetail.jsx'));
const LogoNoGoDetail = lazy(() => import('./LogoNoGoDetail.jsx'));

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
  const [siblings, setSiblings] = useState([]); // ids of same-type projects, in grid order

  useEffect(() => {
    let alive = true;
    setProject(null);
    setError(null);
    api.get(id)
      .then((p) => { if (alive) { setProject(p); setLastTab(p.type); } })
      .catch((e) => { if (alive) setError(e.message); });
    return () => { alive = false; };
  }, [id]);

  // Load same-type siblings so we can step Previous / Next through the section.
  useEffect(() => {
    if (!project?.type) return undefined;
    let alive = true;
    api.list(project.type).then((list) => { if (alive) setSiblings(list.map((p) => p.id)); }).catch(() => {});
    return () => { alive = false; };
  }, [project?.type]);

  const sibIdx = siblings.indexOf(id);
  const hasNav = sibIdx >= 0 && siblings.length > 1;
  const prevId = hasNav ? siblings[(sibIdx - 1 + siblings.length) % siblings.length] : null;
  const nextId = hasNav ? siblings[(sibIdx + 1) % siblings.length] : null;

  // Arrow keys step through siblings (ignored while typing in a field).
  useEffect(() => {
    if (!hasNav) return undefined;
    const onKey = (e) => {
      const el = document.activeElement;
      if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;
      if (e.key === 'ArrowLeft' && prevId) navigate(`/project/${prevId}`);
      else if (e.key === 'ArrowRight' && nextId) navigate(`/project/${nextId}`);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [hasNav, prevId, nextId, navigate]);

  const remove = async () => {
    const type = project.type;
    try {
      const { trashId } = await api.remove(id);
      navigate(`/${type}`);
      toast('Moved to Trash', 'ok', { label: 'Undo', onClick: async () => {
        try { await api.restoreTrash(trashId); navigate(`/project/${id}`); } catch (e) { toast(`Undo failed: ${e.message}`, 'error'); }
      } });
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
    font: FontDetail, logonogo: LogoNoGoDetail,
  }[project.type];

  const isImage = project.type === 'imagegallery';
  const canSetThumb = project.type === 'motion'
    || (project.type === 'branding' && (project.assets || []).length > 0)
    || project.type === 'color'
    || (project.type === 'font' && !!project.shot);

  const menuItems = isImage
    ? [{ label: 'Delete', icon: <Trash2 size={15} />, danger: true, onClick: remove }]
    : [
        { label: 'Rename / edit details', icon: <Pencil size={15} />, onClick: () => setEditing(true) },
        ...(project.type === 'logo' ? [{ label: 'Logo options', icon: <ImageIcon size={15} />, onClick: () => setLogoOptions(true) }] : []),
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

      <Suspense fallback={<div className="spinner" />}>
        {Body && <Body project={project} setProject={setProject} />}
      </Suspense>

      {hasNav && (
        <div className="detail-nav">
          <button className="detail-nav-btn" onClick={() => navigate(`/project/${prevId}`)} title="Previous (←)">
            <ChevronLeft size={17} /> Previous
          </button>
          <span className="detail-nav-count">{sibIdx + 1} / {siblings.length}</span>
          <button className="detail-nav-btn" onClick={() => navigate(`/project/${nextId}`)} title="Next (→)">
            Next <ChevronRight size={17} />
          </button>
        </div>
      )}

      {editing && (
        <EditDetailsModal
          project={project}
          onClose={() => setEditing(false)}
          onSaved={(p) => { setProject(p); setEditing(false); }}
        />
      )}

      {thumbing && (
        <Suspense fallback={null}>
        <ThumbnailStudio
          type={project.type}
          aspect={coverAspect(project.type, project)}
          video={project.type === 'motion' ? fileUrl(project, project.video) : null}
          assets={project.type === 'branding'
            ? (project.assets || []).map((a) => ({ id: a.id, kind: a.kind, src: fileUrl(project, a.file), name: a.name }))
            : []}
          image={project.type === 'color' && project.example ? fileUrl(project, project.example)
            : project.type === 'font' && project.shot ? fileUrl(project, project.shot) : null}
          initialMeta={project.thumbMeta}
          saving={thumbSaving}
          onDone={saveThumb}
          onClose={() => setThumbing(false)}
        />
        </Suspense>
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
