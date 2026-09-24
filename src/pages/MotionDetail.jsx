import { useEffect, useRef, useState } from 'react';
import { Camera, Film, Images, Tag as TagIcon, Trash2, Clock, ChevronLeft, ChevronRight, Maximize2, MoreVertical, Scissors, X } from 'lucide-react';
import { api, fileUrl } from '../lib/api.js';
import { useSaver } from '../lib/autosave.js';
import { captureFrame, lengthTag, fmtTime } from '../lib/media.js';
import { useToast } from '../components/Toast.jsx';
import TagInput from '../components/TagInput.jsx';
import Menu from '../components/Menu.jsx';
import Lightbox from '../components/Lightbox.jsx';
import NotesField from '../components/NotesField.jsx';
import DetailLayout from '../components/DetailLayout.jsx';

const rid = () => Math.random().toString(36).slice(2, 8);

export default function MotionDetail({ project, setProject }) {
  const toast = useToast();
  const videoRef = useRef(null);
  const [capturing, setCapturing] = useState(false);
  const [bulk, setBulk] = useState(null); // { done, total } while capturing one frame per second
  const [paused, setPaused] = useState(true);
  const [current, setCurrent] = useState(0);
  const [sel, setSel] = useState(0);
  const [lightbox, setLightbox] = useState(false);
  const [segments, setSegments] = useState(project.segments || []);
  const saver = useSaver();

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

  // ---- Segments: label the video's sections (Hook / Demo / Outro …) --------
  // Seed once per project; the timeline's local state is the source of truth so
  // an addFrame/tag save (which re-sets `project`) can't wipe an unsaved label.
  useEffect(() => { saver.flush(); setSegments(project.segments || []); }, [project.id, saver]); // eslint-disable-line react-hooks/exhaustive-deps
  const segDur = Number(project.duration) || (videoRef.current && Number.isFinite(videoRef.current.duration) ? videoRef.current.duration : 0);
  const saveSegments = (next, immediate = false) => {
    setSegments(next);
    const projectId = project.id;
    saver.schedule('segments', () => api.update(projectId, { segments: next }).catch((e) => toast(`Could not save: ${e.message}`, 'error')), { immediate });
  };
  // Each segment runs from its start to the next one's start (last → end).
  const segList = [...segments].sort((a, b) => a.start - b.start)
    .map((s, i, arr) => ({ ...s, end: i < arr.length - 1 ? arr[i + 1].start : (segDur || s.start) }));
  const activeSeg = segList.findIndex((s, i) => current >= s.start && (i === segList.length - 1 ? true : current < s.end));
  const splitAtPlayhead = () => {
    if (!segDur) { toast('Video length not ready yet — press play once, then try again.', 'error'); return; }
    const t = Number((videoRef.current?.currentTime ?? current).toFixed(2));
    if (!segments.length) {
      const base = [{ id: rid(), start: 0, label: '' }];
      if (t > 0.2 && t < segDur - 0.2) base.push({ id: rid(), start: t, label: '' });
      saveSegments(base, true);
      return;
    }
    if (t <= 0.1 || t >= segDur - 0.1 || segments.some((s) => Math.abs(s.start - t) < 0.15)) {
      toast('Move the playhead into the clip (away from an existing boundary), then split.');
      return;
    }
    saveSegments([...segments, { id: rid(), start: t, label: '' }].sort((a, b) => a.start - b.start), true);
  };
  const editSegLabel = (id, label) => saveSegments(segments.map((s) => (s.id === id ? { ...s, label } : s)));
  const deleteSeg = (id) => {
    let next = segments.filter((s) => s.id !== id).sort((a, b) => a.start - b.start);
    if (next.length) next = next.map((s, i) => (i === 0 ? { ...s, start: 0 } : s));
    saveSegments(next, true);
  };
  const seekSeg = (start) => { const v = videoRef.current; if (v) { v.currentTime = start; setCurrent(start); } };

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

  // Seek the <video> to a time and resolve once the new frame is painted.
  // Guards against the cases that would otherwise hang the loop: seeking to the
  // time it's already at (no 'seeked' fires) and a seek that never completes.
  const seekTo = (v, t) => new Promise((resolve) => {
    let settled = false;
    const paint = () => {
      if (typeof v.requestVideoFrameCallback === 'function') v.requestVideoFrameCallback(() => finish());
      else setTimeout(finish, 40);
    };
    const finish = () => { if (settled) return; settled = true; clearTimeout(guard); v.removeEventListener('seeked', onSeeked); resolve(); };
    const onSeeked = () => paint();
    const guard = setTimeout(finish, 1500); // never hang on a stuck/ignored seek
    if (Math.abs(v.currentTime - t) < 0.02) { paint(); return; }
    v.addEventListener('seeked', onSeeked, { once: true });
    v.currentTime = t;
  });

  // Grab one frame per whole second across the whole clip, in a single upload.
  const addPerSecond = async () => {
    const v = videoRef.current;
    if (!v || capturing || bulk) return;
    const dur = Number.isFinite(v.duration) && v.duration > 0 ? v.duration : Number(project.duration) || 0;
    if (!dur) { toast('Video length not ready yet — press play once, then try again.', 'error'); return; }
    if (v.readyState < 2 || !v.videoWidth) {
      await new Promise((res) => { v.addEventListener('loadeddata', res, { once: true }); try { v.load(); } catch { /* ignore */ } });
    }
    const wasPlaying = !v.paused;
    const originalTime = v.currentTime;
    v.pause();

    // One target per whole second (the last nudged just inside the end), skipping
    // seconds that already have a frame so repeat clicks don't pile up duplicates.
    const existing = (project.frames || []).map((f) => f.t);
    const targets = [];
    for (let s = 0; s <= Math.floor(dur); s += 1) {
      const t = Number(Math.min(s, dur - 0.05).toFixed(3));
      if (t < 0) continue;
      if (existing.some((e) => Math.abs(e - t) < 0.4) || targets.some((e) => Math.abs(e - t) < 0.4)) continue;
      targets.push(t);
    }
    if (!targets.length) { toast('A frame for each second is already there.'); return; }

    setBulk({ done: 0, total: targets.length });
    try {
      const items = [];
      for (let i = 0; i < targets.length; i += 1) {
        await seekTo(v, targets[i]);
        items.push({ blob: await captureFrame(v, 0.9), t: targets[i] });
        setBulk({ done: i + 1, total: targets.length });
      }
      const updated = await api.addFrames(project.id, items);
      setProject(updated);
      toast(`Added ${items.length} frame${items.length === 1 ? '' : 's'}`);
    } catch (e) {
      toast(`Capture failed: ${e.message}`, 'error');
    } finally {
      setBulk(null);
      try { v.currentTime = originalTime; if (wasPlaying) await v.play(); } catch { /* ignore */ }
    }
  };

  const deleteFrame = async (frameId) => {
    try { setProject(await api.removeFrame(project.id, frameId)); }
    catch (e) { toast(`Could not delete frame: ${e.message}`, 'error'); }
  };

  const step = (d) => setSel(() => (selClamped + d + frames.length) % frames.length);
  const lightboxItems = frames.map((f) => ({ src: fileUrl(project, f.file), caption: fmtTime(f.t) }));

  return (
    <DetailLayout
      side={(
        <>
          {/* Tags */}
          <div className="section">
            <div className="section-head"><h2><TagIcon size={16} /> Tags</h2></div>
            <TagInput tags={project.tags || []} onChange={saveTags} autoTags={autoLen ? [autoLen] : []} placeholder="Add a tag…" />
            <div className="hint" style={{ marginTop: 8 }}>The length tag <b>{autoLen}</b> is added automatically and used for filtering.</div>
          </div>

          {/* Notes */}
          <NotesField project={project} setProject={setProject} />
        </>
      )}
    >
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

      {/* Segment timeline — label the video's sections (Hook / Demo / Outro …) */}
      <div className="seg-timeline">
        <div className="seg-head">
          <span className="seg-title"><Scissors size={14} /> Segments</span>
          <div className="seg-actions">
            <button className="btn btn-sm" onClick={splitAtPlayhead} disabled={!segDur}><Scissors size={14} /> Split at playhead</button>
            {segList.length > 0 && <button className="btn btn-sm btn-ghost" onClick={() => saveSegments([], true)}>Clear</button>}
          </div>
        </div>
        {segList.length ? (
          <div className="seg-bar">
            {segList.map((s, i) => {
              const span = Math.max(0.0001, s.end - s.start);
              const frac = i === activeSeg && s.end > s.start ? Math.min(1, Math.max(0, (current - s.start) / (s.end - s.start))) : 0;
              return (
                <div key={s.id} className={`seg ${i === activeSeg ? 'active' : ''}`} style={{ flexGrow: span }}
                  onClick={() => seekSeg(s.start)} title={`${fmtTime(s.start)} – ${fmtTime(s.end)} · click to jump here`}>
                  {i === activeSeg && <span className="seg-playhead" style={{ left: `${frac * 100}%` }} />}
                  <input className="seg-label" value={s.label} placeholder={`Section ${i + 1}`}
                    onClick={(e) => e.stopPropagation()} onChange={(e) => editSegLabel(s.id, e.target.value)} />
                  <span className="seg-time">{fmtTime(s.start)}</span>
                  <button className="seg-del icon-btn" title="Remove section" onClick={(e) => { e.stopPropagation(); deleteSeg(s.id); }}><X size={12} /></button>
                </div>
              );
            })}
          </div>
        ) : (
          <button className="seg-empty" onClick={splitAtPlayhead} disabled={!segDur}>
            <Scissors size={15} /> Split the video into labeled sections (Hook, Demo, Outro…)
          </button>
        )}
        <div className="hint seg-hint">Seek the player, then “Split at playhead” to add a boundary. Click a section to jump to it; type to name it.</div>
      </div>

      <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <button className="btn btn-primary" onClick={addFrame} disabled={capturing || !!bulk}>
          <Camera size={16} /> {capturing ? 'Capturing…' : 'Add current frame'}
        </button>
        <button className="btn" onClick={addPerSecond} disabled={capturing || !!bulk} title="Capture one frame at every second of the clip">
          <Film size={16} /> {bulk ? `Capturing ${bulk.done}/${bulk.total}…` : 'Add a frame for each second'}
        </button>
        <span className="hint" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Clock size={13} /> {fmtTime(current)} / {fmtTime(project.duration)}
          {paused ? ' · , / . step frames' : ' · pause to grab the exact frame'}
        </span>
      </div>


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
    </DetailLayout>
  );
}
