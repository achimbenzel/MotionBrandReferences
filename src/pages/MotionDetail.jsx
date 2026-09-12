import { useEffect, useRef, useState } from 'react';
import { Camera, Images, Tag as TagIcon, Trash2, Clock, ChevronLeft, ChevronRight, Maximize2, MoreVertical } from 'lucide-react';
import { api, fileUrl } from '../lib/api.js';
import { captureFrame, lengthTag, fmtTime } from '../lib/media.js';
import { useToast } from '../components/Toast.jsx';
import TagInput from '../components/TagInput.jsx';
import Menu from '../components/Menu.jsx';
import Lightbox from '../components/Lightbox.jsx';
import NotesField from '../components/NotesField.jsx';

export default function MotionDetail({ project, setProject }) {
  const toast = useToast();
  const videoRef = useRef(null);
  const [capturing, setCapturing] = useState(false);
  const [paused, setPaused] = useState(true);
  const [current, setCurrent] = useState(0);
  const [sel, setSel] = useState(0);
  const [lightbox, setLightbox] = useState(false);

  const frames = [...(project.frames || [])].sort((a, b) => a.t - b.t);
  const autoLen = project.duration ? lengthTag(project.duration) : null;
  const selClamped = Math.min(sel, Math.max(0, frames.length - 1));

  // Keep selection valid as frames change.
  useEffect(() => { if (sel > frames.length - 1) setSel(Math.max(0, frames.length - 1)); }, [frames.length, sel]);

  // Remember the player volume across reloads (a global per-viewer preference).
  useEffect(() => {
    const v = videoRef.current; if (!v) return;
    try {
      const vol = parseFloat(localStorage.getItem('videoVolume'));
      if (Number.isFinite(vol)) v.volume = Math.min(1, Math.max(0, vol));
      v.muted = localStorage.getItem('videoMuted') === '1';
    } catch { /* ignore */ }
  }, [project.id]);
  const saveVolume = (e) => {
    try { localStorage.setItem('videoVolume', String(e.target.volume)); localStorage.setItem('videoMuted', e.target.muted ? '1' : '0'); } catch { /* ignore */ }
  };

  // YouTube-style frame stepping: when the video is paused, "," and "." step
  // one frame back / forward. (No universal way to read a file's fps from the
  // browser, so a frame is 1/30s — fine for grabbing an exact-ish frame.)
  useEffect(() => {
    const FRAME = 1 / 30;
    const onKey = (e) => {
      if (e.key !== ',' && e.key !== '.') return;
      const v = videoRef.current;
      if (!v) return;
      const el = document.activeElement;
      if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;
      if (!v.paused) return; // only step while paused
      e.preventDefault();
      if (e.key === ',') v.currentTime = Math.max(0, v.currentTime - FRAME);
      else v.currentTime = Math.min(v.duration || Infinity, v.currentTime + FRAME);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const saveTags = async (tags) => {
    try { setProject(await api.update(project.id, { tags })); }
    catch (e) { toast(`Could not save tags: ${e.message}`, 'error'); }
  };

  const addFrame = async () => {
    const v = videoRef.current;
    if (!v || capturing) return;
    if (!v.paused) v.pause();
    setCapturing(true);
    try {
      const blob = await captureFrame(v, 0.92);
      const updated = await api.addFrame(project.id, blob, v.currentTime);
      setProject(updated);
      // Select the newly added frame in the sorted list.
      const sorted = [...(updated.frames || [])].sort((a, b) => a.t - b.t);
      setSel(sorted.findIndex((f) => f.t === v.currentTime));
      toast(`Frame at ${fmtTime(v.currentTime)} added`);
    } catch (e) {
      toast(`Capture failed: ${e.message}`, 'error');
    } finally {
      setCapturing(false);
    }
  };

  const deleteFrame = async (frameId) => {
    try { setProject(await api.removeFrame(project.id, frameId)); }
    catch (e) { toast(`Could not delete frame: ${e.message}`, 'error'); }
  };

  const step = (d) => setSel((i) => (selClamped + d + frames.length) % frames.length);
  const lightboxItems = frames.map((f) => ({ src: fileUrl(project, f.file), caption: fmtTime(f.t) }));

  return (
    <div>
      <div className="player-wrap">
        <video
          ref={videoRef}
          src={fileUrl(project, project.video)}
          controls
          onPlay={() => setPaused(false)}
          onPause={() => setPaused(true)}
          onVolumeChange={saveVolume}
          onTimeUpdate={(e) => setCurrent(e.target.currentTime)}
        />
      </div>

      <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <button className="btn btn-primary" onClick={addFrame} disabled={capturing}>
          <Camera size={16} /> {capturing ? 'Capturing…' : 'Add current frame'}
        </button>
        <span className="hint" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Clock size={13} /> {fmtTime(current)} / {fmtTime(project.duration)}
          {paused ? ' · , / . step frames' : ' · pause to grab the exact frame'}
        </span>
      </div>

      {/* Tags */}
      <div className="section">
        <div className="section-head"><h2><TagIcon size={16} /> Tags</h2></div>
        <TagInput tags={project.tags || []} onChange={saveTags} autoTags={autoLen ? [autoLen] : []} placeholder="Add a tag…" />
        <div className="hint" style={{ marginTop: 8 }}>The length tag <b>{autoLen}</b> is added automatically and used for filtering.</div>
      </div>

      {/* Notes */}
      <NotesField project={project} setProject={setProject} />

      {/* Frames */}
      <div className="section">
        <div className="section-head">
          <h2><Images size={16} /> Frames <span className="count">{frames.length}</span></h2>
        </div>

        {frames.length === 0 ? (
          <div className="panel" style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 28 }}>
            Pause the video on a frame you like and hit <b>Add current frame</b>. Saved as WebP to keep the folder small.
          </div>
        ) : (
          <>
            {/* Big preview with arrows (fixed height → arrows stay put) */}
            <div className="frame-hero">
              {frames.length > 1 && (
                <button className="frame-hero-nav prev icon-btn" onClick={() => step(-1)} aria-label="Previous frame"><ChevronLeft size={22} /></button>
              )}
              <img
                src={fileUrl(project, frames[selClamped].file)}
                alt={`frame ${fmtTime(frames[selClamped].t)}`}
                onClick={() => setLightbox(true)}
                title="Click to view fullscreen"
              />
              {frames.length > 1 && (
                <button className="frame-hero-nav next icon-btn" onClick={() => step(1)} aria-label="Next frame"><ChevronRight size={22} /></button>
              )}
              <div className="frame-hero-bar">
                <span className="frame-hero-t">{fmtTime(frames[selClamped].t)} · {selClamped + 1}/{frames.length}</span>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="icon-btn" onClick={() => setLightbox(true)} title="Fullscreen"><Maximize2 size={16} /></button>
                  <Menu
                    align="right"
                    trigger={<button className="icon-btn" title="More"><MoreVertical size={16} /></button>}
                    items={[{ label: 'Delete frame', icon: <Trash2 size={15} />, danger: true, onClick: () => deleteFrame(frames[selClamped].id) }]}
                  />
                </div>
              </div>
            </div>

            {/* Thumbnail strip */}
            <div className="frames-grid" style={{ marginTop: 14 }}>
              {frames.map((f, i) => (
                <div key={f.id} className={`frame ${i === selClamped ? 'active' : ''}`} onClick={() => setSel(i)}>
                  <img src={fileUrl(project, f.file)} alt={`frame ${fmtTime(f.t)}`} loading="lazy" />
                  <span className="frame-t">{fmtTime(f.t)}</span>
                  <div className="frame-menu" onClick={(e) => e.stopPropagation()}>
                    <Menu
                      align="right"
                      trigger={<button className="icon-btn frame-menu-btn" title="More"><MoreVertical size={15} /></button>}
                      items={[{ label: 'Delete frame', icon: <Trash2 size={15} />, danger: true, onClick: () => deleteFrame(f.id) }]}
                    />
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {lightbox && (
        <Lightbox items={lightboxItems} index={selClamped} onIndex={setSel} onClose={() => setLightbox(false)} />
      )}
    </div>
  );
}
