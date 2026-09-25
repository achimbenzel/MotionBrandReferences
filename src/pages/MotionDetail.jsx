import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Camera, Film, Images, Tag as TagIcon, Trash2, Clock, ChevronLeft, ChevronRight, Maximize2, MoreVertical, Repeat, Crosshair, Gauge } from 'lucide-react';
import { api, fileUrl } from '../lib/api.js';
import { useSaver } from '../lib/autosave.js';
import { captureFrame, captureSmallFrame, lengthTag, fmtTime, formatOf, resolutionOf, resolveDuration, audioPeaks } from '../lib/media.js';
import { useToast } from '../components/Toast.jsx';
import TagInput from '../components/TagInput.jsx';
import Menu from '../components/Menu.jsx';
import Lightbox from '../components/Lightbox.jsx';
import NotesField from '../components/NotesField.jsx';
import DetailLayout from '../components/DetailLayout.jsx';
import SegmentTimeline from '../components/SegmentTimeline.jsx';
import MomentsPanel from '../components/MomentsPanel.jsx';

const rid = () => Math.random().toString(36).slice(2, 8);
const RATES = [0.25, 0.5, 1, 2];
const WAVE_AUTO_MAX = 150 * 1024 * 1024; // bigger files: the waveform is read on request
const loadRate = () => { try { const r = parseFloat(sessionStorage.getItem('videoRate')); return RATES.includes(r) ? r : 1; } catch { return 1; } };

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
  const [markers, setMarkers] = useState(project.markers || []);
  const [focusMarker, setFocusMarker] = useState(null);
  const [techniques, setTechniques] = useState([]);
  const [rate, setRate] = useState(loadRate);
  const [loop, setLoop] = useState(null); // { key } — a section id, or 'all'
  const [wave, setWave] = useState({ state: 'idle' }); // idle | working | large
  const [params] = useSearchParams();
  const jumped = useRef(false);
  const markersRef = useRef(markers);
  markersRef.current = markers;
  const saver = useSaver();

  const frames = [...(project.frames || [])].sort((a, b) => a.t - b.t);
  const autoLen = project.duration ? lengthTag(project.duration) : null;
  const format = formatOf(project.width, project.height);
  const resolution = resolutionOf(project.width, project.height);
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
  // Also: M marks a moment, L loops the current section, < / > change speed.
  const keys = useRef({});
  useEffect(() => {
    const FRAME = 1 / 30;
    const onKey = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const v = videoRef.current;
      if (!v) return;
      const el = document.activeElement;
      if (el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable)) return;
      if (document.querySelector('.overlay, .lightbox, .sheet-backdrop')) return;
      if (e.key === 'm' || e.key === 'M') { e.preventDefault(); keys.current.mark?.(); return; }
      if (e.key === 'l' || e.key === 'L') { e.preventDefault(); keys.current.loop?.(); return; }
      if (e.key === '<' || e.key === '>') { e.preventDefault(); keys.current.speed?.(e.key === '>' ? 1 : -1); return; }
      if (e.key !== ',' && e.key !== '.') return;
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

  // ---- Sections: the video's structure (Hook / Problem / Product reveal …) --
  // Seed once per project; the timeline's local state is the source of truth so
  // an addFrame/tag save (which re-sets `project`) can't wipe an unsaved label.
  useEffect(() => { saver.flush(); setSegments(project.segments || []); }, [project.id, saver]); // eslint-disable-line react-hooks/exhaustive-deps
  const segDur = Number(project.duration) || (videoRef.current && Number.isFinite(videoRef.current.duration) ? videoRef.current.duration : 0);
  const saveSegments = (next, immediate = false) => {
    setSegments(next);
    const projectId = project.id;
    saver.schedule('segments', () => api.update(projectId, { segments: next }).catch((e) => toast(`Could not save: ${e.message}`, 'error')), { immediate });
  };
  const segList = [...segments].sort((a, b) => a.start - b.start)
    .map((sg, i, arr) => ({ ...sg, end: i < arr.length - 1 ? arr[i + 1].start : segDur }));

  // ---- Playback speed (this session) and looping a section -----------------
  useEffect(() => {
    const v = videoRef.current; if (v) v.playbackRate = rate;
    try { sessionStorage.setItem('videoRate', String(rate)); } catch { /* ignore */ }
  }, [rate]);
  const changeSpeed = (d) => setRate((r) => RATES[Math.min(RATES.length - 1, Math.max(0, RATES.indexOf(r) + d))] ?? 1);
  // The loop follows its section if boundaries move; it ends if the section goes.
  const loopRange = !loop ? null : loop.key === 'all' ? { start: 0, end: segDur }
    : (() => { const sg = segList.find((x) => x.id === loop.key); return sg ? { start: sg.start, end: sg.end } : null; })();
  const toggleLoop = () => {
    if (loop) { setLoop(null); return; }
    const t = videoRef.current?.currentTime ?? current;
    const sg = segList.find((x, i) => t >= x.start && (i === segList.length - 1 || t < x.end));
    setLoop({ key: sg ? sg.id : 'all' });
  };
  const loopSection = (sg) => {
    if (loop?.key === sg.id) { setLoop(null); return; }
    setLoop({ key: sg.id });
    const v = videoRef.current;
    if (v) { v.currentTime = sg.start; setCurrent(sg.start); v.play().catch(() => {}); }
  };
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !loopRange || !(loopRange.end > loopRange.start)) return undefined;
    const { start, end } = loopRange;
    let raf = 0;
    let prev = v.currentTime;
    // Jump back when playback runs over the loop's end (not when you seek past it).
    const tick = () => {
      const t = v.currentTime;
      if (!v.paused && prev < end && t >= end - 0.03) { v.currentTime = start; prev = start; }
      else prev = t;
      raf = requestAnimationFrame(tick);
    };
    const onEnded = () => { if (end >= (v.duration || segDur) - 0.1) { v.currentTime = start; v.play().catch(() => {}); } };
    raf = requestAnimationFrame(tick);
    v.addEventListener('ended', onEnded);
    return () => { cancelAnimationFrame(raf); v.removeEventListener('ended', onEnded); };
  }, [loopRange?.start, loopRange?.end]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Audio waveform: read once in the browser, stored on the project ------
  const readWave = async () => {
    const projectId = project.id;
    setWave({ state: 'working' });
    let waveform = null;
    try { waveform = await audioPeaks(fileUrl(project, project.video)); }
    catch (e) { if (e.noAudio) waveform = { none: true }; } // silent / unreadable audio: don't try again
    if (waveform) { try { setProject(await api.update(projectId, { waveform })); } catch { /* tried again next time */ } }
    setWave({ state: 'idle' });
  };
  useEffect(() => {
    if (project.waveform || !project.video) { setWave({ state: 'idle' }); return undefined; }
    let alive = true;
    fetch(fileUrl(project, project.video), { method: 'HEAD' })
      .then((r) => Number(r.headers.get('content-length')) || 0)
      .catch(() => 0)
      .then((size) => {
        if (!alive) return;
        if (size > WAVE_AUTO_MAX) setWave({ state: 'large', size });
        else readWave();
      });
    return () => { alive = false; };
  }, [project.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Moments: markers tagged with a technique, with a captured frame -----
  useEffect(() => { saver.flush(); setMarkers(project.markers || []); setLoop(null); }, [project.id, saver]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { api.listTechniques().then(setTechniques).catch(() => {}); }, [project.id]);
  const saveMarkers = (next, immediate = false) => {
    markersRef.current = next;
    setMarkers(next);
    const projectId = project.id;
    saver.schedule('markers', () => api.update(projectId, { markers: markersRef.current }).catch((e) => toast(`Could not save: ${e.message}`, 'error')), { immediate });
  };
  const addMoment = async (label = '') => {
    const v = videoRef.current;
    if (!v) return;
    const t = Number((v.currentTime || 0).toFixed(2));
    const id = rid();
    saveMarkers([...markersRef.current, { id, t, label, note: '', thumb: null }], true);
    setFocusMarker(label ? null : id);
    if (label) toast(`${label} marked at ${fmtTime(t)}`);
    try {
      if (v.readyState >= 2 && v.videoWidth) {
        const file = await api.uploadMarkerThumb(project.id, await captureSmallFrame(v));
        saveMarkers(markersRef.current.map((m) => (m.id === id ? { ...m, thumb: file } : m)), true);
      }
    } catch { /* the moment works without its frame */ }
  };
  const patchMarker = (id, p) => saveMarkers(markersRef.current.map((m) => (m.id === id ? { ...m, ...p } : m)));
  const removeMarker = (m) => {
    saveMarkers(markersRef.current.filter((x) => x.id !== m.id), true);
    toast('Moment removed', 'ok', { label: 'Undo', onClick: () => saveMarkers([...markersRef.current, m], true) });
  };
  const seek = (t) => { const v = videoRef.current; if (v) { v.currentTime = t; setCurrent(t); } };
  keys.current = { mark: () => addMoment(''), loop: toggleLoop, speed: changeSpeed };

  // First load: fill in a missing size / length, and jump to ?t= (from Moments).
  const onMeta = (e) => {
    const v = e.currentTarget;
    v.playbackRate = rate;
    const patch = {};
    if (v.videoWidth && (project.width !== v.videoWidth || project.height !== v.videoHeight)) { patch.width = v.videoWidth; patch.height = v.videoHeight; }
    const t = Number(params.get('t'));
    resolveDuration(v).then((d) => {
      if (!project.duration && d > 0) patch.duration = d;
      if (Object.keys(patch).length) api.update(project.id, patch).then(setProject).catch(() => {});
      if (!jumped.current && Number.isFinite(t) && t > 0) { jumped.current = true; v.currentTime = t; setCurrent(t); }
    });
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
            <TagInput tags={project.tags || []} onChange={saveTags} autoTags={[autoLen, format].filter(Boolean)} placeholder="Add a tag…" />
            <div className="hint" style={{ marginTop: 8 }}>Length{format ? ' and format' : ''} tags are added automatically and used for filtering.</div>
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
          onLoadedMetadata={onMeta}
        />
      </div>

      {/* Player tools: speed, loop, mark a moment; the video's format */}
      <div className="player-tools">
        <div className="seg-toggle rate-toggle" role="group" aria-label="Playback speed" title="Playback speed (< / >)">
          <Gauge size={14} className="rate-ico" />
          {RATES.map((r) => (
            <button key={r} className={rate === r ? 'on' : ''} onClick={() => setRate(r)} aria-pressed={rate === r}>{r === 0.25 ? '¼' : r === 0.5 ? '½' : r}×</button>
          ))}
        </div>
        <button className={`btn btn-sm ${loop ? 'btn-on' : ''}`} onClick={toggleLoop} aria-pressed={!!loop}
          title={loop ? 'Stop looping (L)' : 'Loop the section under the playhead — or the whole video (L)'}>
          <Repeat size={14} /> {loop ? (loop.key === 'all' ? 'Looping video' : 'Looping section') : 'Loop'}
        </button>
        <button className="btn btn-sm" onClick={() => addMoment('')} title="Mark this moment and tag its technique (M)"><Crosshair size={14} /> Mark moment</button>
        {(format || resolution) && (
          <span className="player-meta" title={project.width ? `${project.width} × ${project.height}` : undefined}>
            {[format, resolution].filter(Boolean).join(' · ')}
          </span>
        )}
      </div>

      {/* Section timeline — the video's structure (Hook, Problem, Product reveal …) */}
      <SegmentTimeline videoRef={videoRef} current={current} duration={segDur} segments={segments}
        onChange={saveSegments} onSeek={setCurrent} markers={markers} loopKey={loop?.key} onLoop={loopSection}
        wave={{ ...wave, peaks: project.waveform?.peaks, onCompute: readWave }} />

      <MomentsPanel markers={markers} techniques={techniques} focusId={focusMarker} thumbUrl={(rel) => fileUrl(project, rel)}
        onAdd={addMoment} onPatch={patchMarker} onRemove={removeMarker} onSeek={seek} />

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
