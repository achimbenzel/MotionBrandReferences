import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Trash2, CalendarRange, Images, StickyNote, UploadCloud, X } from 'lucide-react';
import { api, planFileUrl } from '../lib/api.js';
import { useToast } from '../components/Toast.jsx';
import Lightbox from '../components/Lightbox.jsx';

export default function PlanDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [plan, setPlan] = useState(null);
  const [error, setError] = useState(null);
  const [name, setName] = useState('');
  const [info, setInfo] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [lightbox, setLightbox] = useState(-1);
  const skip = useRef(true);
  const fileRef = useRef(null);

  useEffect(() => {
    let alive = true;
    setPlan(null); setError(null); skip.current = true;
    api.getPlan(id).then((p) => {
      if (!alive) return;
      setPlan(p); setName(p.name || ''); setInfo(p.info || ''); setStart(p.start || ''); setEnd(p.end || '');
    }).catch((e) => { if (alive) setError(e.message); });
    return () => { alive = false; };
  }, [id]);

  // Debounced autosave for name + info.
  useEffect(() => {
    if (skip.current) { skip.current = false; return; }
    const t = setTimeout(() => {
      api.updatePlan(id, { name: name.trim() || 'Untitled plan', info })
        .then(setPlan).catch((e) => toast(`Could not save: ${e.message}`, 'error'));
    }, 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, info]);

  const saveDates = (s, e) => {
    api.updatePlan(id, { start: s, end: e }).then(setPlan).catch((err) => toast(`Could not save: ${err.message}`, 'error'));
  };

  const addImages = async (list) => {
    if (!list?.length) return;
    try { setPlan(await api.addMoodboard(id, list)); }
    catch (e) { toast(`Upload failed: ${e.message}`, 'error'); }
  };
  const removeImage = async (imgId) => {
    try { setPlan(await api.removeMoodboard(id, imgId)); }
    catch (e) { toast(`Could not remove: ${e.message}`, 'error'); }
  };
  const remove = async () => {
    if (!window.confirm(`Delete plan “${plan.name}”? This can’t be undone.`)) return;
    try { await api.removePlan(id); toast('Plan deleted'); navigate('/plan'); }
    catch (e) { toast(`Delete failed: ${e.message}`, 'error'); }
  };

  if (error) return <div className="detail"><Back /> <div className="center-msg">Couldn’t load: {error}</div></div>;
  if (!plan) return <div className="detail"><div className="spinner" /></div>;

  const moodboard = plan.moodboard || [];
  const items = moodboard.map((m) => ({ src: planFileUrl(plan, m.file) }));

  return (
    <div className="detail">
      <Back to="/plan" label="Back to Plans" />
      <div className="detail-head">
        <input className="plan-title-input" value={name} placeholder="Plan name"
          onChange={(e) => setName(e.target.value)} />
        <div className="detail-actions">
          <button className="btn btn-danger btn-sm" onClick={remove}><Trash2 size={15} /> Delete</button>
        </div>
      </div>

      <div className="section" style={{ marginTop: 4 }}>
        <div className="section-head"><h2><CalendarRange size={16} /> Timeframe</h2></div>
        <div className="row-2">
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Start</label>
            <input type="date" className="input" value={start} onChange={(e) => { setStart(e.target.value); saveDates(e.target.value, end); }} />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>End</label>
            <input type="date" className="input" value={end} onChange={(e) => { setEnd(e.target.value); saveDates(start, e.target.value); }} />
          </div>
        </div>
      </div>

      <div className="section">
        <div className="section-head">
          <h2><Images size={16} /> Moodboard <span className="count">{moodboard.length}</span></h2>
          <button className="btn btn-sm" onClick={() => fileRef.current?.click()}><UploadCloud size={15} /> Add images</button>
          <input ref={fileRef} type="file" accept="image/*,.svg" multiple className="visually-hidden-input"
            onChange={(e) => { addImages(e.target.files); e.target.value = ''; }} />
        </div>
        {moodboard.length ? (
          <div className="masonry">
            {moodboard.map((m, i) => (
              <div className="masonry-item" key={m.id}>
                <img src={planFileUrl(plan, m.file)} alt="" loading="lazy" onClick={() => setLightbox(i)} />
                <div className="masonry-menu" onClick={(e) => e.stopPropagation()}>
                  <button className="icon-btn masonry-menu-btn" title="Remove" onClick={() => removeImage(m.id)}><X size={15} /></button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div
            className="dropzone"
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); addImages(e.dataTransfer.files); }}
          >
            <UploadCloud size={22} />
            <div>Drop or select images for the moodboard</div>
          </div>
        )}
      </div>

      <div className="section">
        <div className="section-head"><h2><StickyNote size={16} /> Information</h2></div>
        <textarea className="textarea notes-textarea" value={info} onChange={(e) => setInfo(e.target.value)}
          placeholder="Concept, goals, references, requirements…" />
      </div>

      {lightbox >= 0 && items.length > 0 && (
        <Lightbox items={items} index={lightbox} onIndex={setLightbox} onClose={() => setLightbox(-1)} />
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
