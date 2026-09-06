import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Trash2, Pencil, MoreHorizontal, CalendarRange, Images, StickyNote,
  UploadCloud, X, Plus, Check, ChevronDown, ChevronRight, Image as ImageIcon, Camera,
} from 'lucide-react';
import { api, planFileUrl } from '../lib/api.js';
import { useToast } from '../components/Toast.jsx';
import Menu from '../components/Menu.jsx';
import Lightbox from '../components/Lightbox.jsx';
import GalleryNameModal from '../components/GalleryNameModal.jsx';

const rid = () => Math.random().toString(36).slice(2, 8);

export default function PlanDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [plan, setPlan] = useState(null);
  const [error, setError] = useState(null);
  const [info, setInfo] = useState('');
  const [milestones, setMilestones] = useState([]);
  const [lightbox, setLightbox] = useState(null); // { items, index }
  const [renaming, setRenaming] = useState(false);
  const [newMb, setNewMb] = useState(false);
  const [renameMb, setRenameMb] = useState(null); // moodboard object
  const skipInfo = useRef(true);
  const skipMs = useRef(true);
  const bannerRef = useRef(null);
  const avatarRef = useRef(null);
  const imgRef = useRef(null);
  const pendingMb = useRef(null);

  useEffect(() => {
    let alive = true;
    setPlan(null); setError(null); skipInfo.current = true; skipMs.current = true;
    api.getPlan(id).then((p) => {
      if (!alive) return;
      setPlan(p); setInfo(p.info || ''); setMilestones(p.milestones || []);
    }).catch((e) => { if (alive) setError(e.message); });
    return () => { alive = false; };
  }, [id]);

  // Debounced autosave for info and milestones.
  useEffect(() => {
    if (skipInfo.current) { skipInfo.current = false; return; }
    const t = setTimeout(() => api.updatePlan(id, { info }).then(setPlan).catch((e) => toast(`Could not save: ${e.message}`, 'error')), 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [info]);
  useEffect(() => {
    if (skipMs.current) { skipMs.current = false; return; }
    const t = setTimeout(() => api.updatePlan(id, { milestones }).then(setPlan).catch((e) => toast(`Could not save: ${e.message}`, 'error')), 500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [milestones]);

  const patch = (p) => api.updatePlan(id, p).then(setPlan).catch((e) => toast(`Could not save: ${e.message}`, 'error'));

  const setImage = async (kind, file) => {
    if (!file) return;
    try { setPlan(await api.setPlanImage(id, kind, file)); } catch (e) { toast(`Upload failed: ${e.message}`, 'error'); }
  };
  const clearImage = async (kind) => { try { setPlan(await api.removePlanImage(id, kind)); } catch (e) { toast(`Failed: ${e.message}`, 'error'); } };

  const remove = async () => {
    if (!window.confirm(`Delete plan “${plan.name}”? This can’t be undone.`)) return;
    try { await api.removePlan(id); toast('Plan deleted'); navigate('/plan'); }
    catch (e) { toast(`Delete failed: ${e.message}`, 'error'); }
  };

  // Milestones
  const addMilestone = () => setMilestones((m) => [...m, { id: rid(), title: '', date: '', done: false }]);
  const editMilestone = (mid, patchObj) => setMilestones((m) => m.map((x) => (x.id === mid ? { ...x, ...patchObj } : x)));
  const removeMilestone = (mid) => setMilestones((m) => m.filter((x) => x.id !== mid));

  // Moodboards
  const addImagesFor = (mbId) => { pendingMb.current = mbId; imgRef.current?.click(); };
  const onImages = async (files) => {
    if (!files?.length || !pendingMb.current) return;
    try { setPlan(await api.addMoodboardImages(id, pendingMb.current, files)); } catch (e) { toast(`Upload failed: ${e.message}`, 'error'); }
  };
  const toggleCollapse = (mb) => api.updateMoodboard(id, mb.id, { collapsed: !mb.collapsed }).then(setPlan).catch(() => {});
  const deleteMoodboard = async (mb) => {
    if (!window.confirm(`Delete moodboard “${mb.name}” and its images?`)) return;
    try { setPlan(await api.removeMoodboard(id, mb.id)); } catch (e) { toast(`Failed: ${e.message}`, 'error'); }
  };
  const removeImage = async (mbId, imgId) => { try { setPlan(await api.removeMoodboardImage(id, mbId, imgId)); } catch (e) { toast(`Failed: ${e.message}`, 'error'); } };

  if (error) return <div className="detail"><BackBtn /> <div className="center-msg">Couldn’t load: {error}</div></div>;
  if (!plan) return <div className="detail"><div className="spinner" /></div>;

  const bannerUrl = plan.banner ? planFileUrl(plan, plan.banner) : null;
  const avatarUrl = plan.avatar ? planFileUrl(plan, plan.avatar) : null;

  return (
    <div className="detail">
      <div className="plan-topbar">
        <BackBtn to="/plan" label="Back to Plans" />
        <Menu
          trigger={<button className="btn btn-sm"><Pencil size={15} /> Edit <MoreHorizontal size={15} /></button>}
          items={[
            { label: 'Rename', icon: <Pencil size={15} />, onClick: () => setRenaming(true) },
            { separator: true },
            { label: 'Delete plan', icon: <Trash2 size={15} />, danger: true, onClick: remove },
          ]}
        />
      </div>

      {/* Notion-style banner + avatar */}
      <div className={`plan-banner ${bannerUrl ? '' : 'empty'}`} style={bannerUrl ? { backgroundImage: `url("${bannerUrl}")` } : undefined}>
        <div className="plan-banner-actions">
          <button className="btn btn-sm" onClick={() => bannerRef.current?.click()}><ImageIcon size={15} /> {bannerUrl ? 'Change banner' : 'Add banner'}</button>
          {bannerUrl && <button className="btn btn-sm btn-ghost" onClick={() => clearImage('banner')}>Remove</button>}
        </div>
      </div>
      <div className="plan-idrow">
        <button className="plan-avatar" onClick={() => avatarRef.current?.click()} title="Change profile image">
          {avatarUrl ? <img src={avatarUrl} alt="" /> : <span>{(plan.name || '?').charAt(0).toUpperCase()}</span>}
          <span className="plan-avatar-edit"><Camera size={15} /></span>
        </button>
        <h1 className="plan-name">{plan.name}</h1>
      </div>

      <input ref={bannerRef} type="file" accept="image/*" className="visually-hidden-input" onChange={(e) => { setImage('banner', e.target.files[0]); e.target.value = ''; }} />
      <input ref={avatarRef} type="file" accept="image/*" className="visually-hidden-input" onChange={(e) => { setImage('avatar', e.target.files[0]); e.target.value = ''; }} />
      <input ref={imgRef} type="file" accept="image/*,.svg" multiple className="visually-hidden-input" onChange={(e) => { onImages(e.target.files); e.target.value = ''; }} />

      {/* Timeframe + milestones */}
      <div className="section">
        <div className="section-head"><h2><CalendarRange size={16} /> Timeframe</h2></div>
        <div className="row-2">
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Start</label>
            <input type="date" className="input" value={plan.start || ''} onChange={(e) => patch({ start: e.target.value })} />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>End</label>
            <input type="date" className="input" value={plan.end || ''} onChange={(e) => patch({ end: e.target.value })} />
          </div>
        </div>

        <div className="milestones">
          {milestones.map((m) => (
            <div className={`milestone ${m.done ? 'done' : ''}`} key={m.id}>
              <button className={`ms-check ${m.done ? 'on' : ''}`} onClick={() => editMilestone(m.id, { done: !m.done })} title="Toggle done">
                {m.done && <Check size={13} />}
              </button>
              <input className="ms-title input" value={m.title} placeholder="Milestone…" onChange={(e) => editMilestone(m.id, { title: e.target.value })} />
              <input className="ms-date input" type="date" value={m.date || ''} onChange={(e) => editMilestone(m.id, { date: e.target.value })} />
              <button className="ms-del icon-btn" onClick={() => removeMilestone(m.id)}><X size={14} /></button>
            </div>
          ))}
          <button className="btn btn-ghost btn-sm ms-add" onClick={addMilestone}><Plus size={15} /> Add milestone</button>
        </div>
      </div>

      {/* Moodboards */}
      <div className="section">
        <div className="section-head">
          <h2><Images size={16} /> Moodboards</h2>
          <button className="btn btn-sm" onClick={() => setNewMb(true)}><Plus size={15} /> Add moodboard</button>
        </div>

        {(plan.moodboards || []).map((mb) => (
          <div className="moodboard" key={mb.id}>
            <div className="moodboard-head">
              <button className="mb-collapse" onClick={() => toggleCollapse(mb)}>
                {mb.collapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                <span className="mb-name">{mb.name}</span>
                <span className="count">{(mb.images || []).length}</span>
              </button>
              <div className="moodboard-actions">
                <button className="btn btn-sm" onClick={() => addImagesFor(mb.id)}><UploadCloud size={14} /> Add images</button>
                <Menu align="right" trigger={<button className="icon-btn" style={{ width: 34, height: 34 }}><MoreHorizontal size={16} /></button>}
                  items={[
                    { label: 'Rename', icon: <Pencil size={15} />, onClick: () => setRenameMb(mb) },
                    { separator: true },
                    { label: 'Delete moodboard', icon: <Trash2 size={15} />, danger: true, onClick: () => deleteMoodboard(mb) },
                  ]} />
              </div>
            </div>
            {!mb.collapsed && (
              (mb.images || []).length ? (
                <div className="masonry">
                  {mb.images.map((im, i) => (
                    <div className="masonry-item" key={im.id}>
                      <img src={planFileUrl(plan, im.file)} alt="" loading="lazy"
                        onClick={() => setLightbox({ items: mb.images.map((x) => ({ src: planFileUrl(plan, x.file) })), index: i })} />
                      <div className="masonry-menu" onClick={(e) => e.stopPropagation()}>
                        <button className="icon-btn masonry-menu-btn" title="Remove" onClick={() => removeImage(mb.id, im.id)}><X size={15} /></button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="dropzone" onClick={() => addImagesFor(mb.id)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => { e.preventDefault(); pendingMb.current = mb.id; onImages(e.dataTransfer.files); }}>
                  <UploadCloud size={20} /><div>Drop or select images</div>
                </div>
              )
            )}
          </div>
        ))}
      </div>

      {/* Information */}
      <div className="section">
        <div className="section-head"><h2><StickyNote size={16} /> Information</h2></div>
        <textarea className="textarea notes-textarea" value={info} onChange={(e) => setInfo(e.target.value)}
          placeholder="Concept, goals, references, requirements…" />
      </div>

      {lightbox && (
        <Lightbox items={lightbox.items} index={lightbox.index} onIndex={(n) => setLightbox((l) => ({ ...l, index: n }))} onClose={() => setLightbox(null)} />
      )}
      {renaming && (
        <GalleryNameModal title="Rename plan" initialName={plan.name} submitLabel="Save" placeholder="Plan name"
          onSubmit={async (name) => { await patch({ name }); setRenaming(false); }} onClose={() => setRenaming(false)} />
      )}
      {newMb && (
        <GalleryNameModal title="New moodboard" submitLabel="Create" placeholder="e.g. Colors, UI, Typography"
          onSubmit={async (name) => { setPlan(await api.addMoodboard(id, name)); setNewMb(false); }} onClose={() => setNewMb(false)} />
      )}
      {renameMb && (
        <GalleryNameModal title="Rename moodboard" initialName={renameMb.name} submitLabel="Save" placeholder="Moodboard name"
          onSubmit={async (name) => { setPlan(await api.updateMoodboard(id, renameMb.id, { name })); setRenameMb(null); }} onClose={() => setRenameMb(null)} />
      )}
    </div>
  );
}

function BackBtn({ to, label = 'Back' }) {
  const navigate = useNavigate();
  return (
    <button className="detail-back" style={{ margin: 0 }} onClick={() => (to ? navigate(to) : navigate(-1))}>
      <ArrowLeft size={16} /> {label}
    </button>
  );
}
