import { useEffect, useRef, useState } from 'react';
import { Camera, Images, StickyNote, Tag as TagIcon, Trash2, Clock } from 'lucide-react';
import { api, fileUrl } from '../lib/api.js';
import { captureFrame, lengthTag, fmtTime } from '../lib/media.js';
import { useToast } from '../components/Toast.jsx';
import TagInput from '../components/TagInput.jsx';

export default function MotionDetail({ project, setProject }) {
  const toast = useToast();
  const videoRef = useRef(null);
  const [notes, setNotes] = useState(project.notes || '');
  const [noteState, setNoteState] = useState('idle'); // idle | saving | saved
  const [capturing, setCapturing] = useState(false);
  const [paused, setPaused] = useState(true);
  const [current, setCurrent] = useState(0);
  const firstRender = useRef(true);

  const frames = [...(project.frames || [])].sort((a, b) => a.t - b.t);
  const autoLen = project.duration ? lengthTag(project.duration) : null;

  // Debounced notes autosave.
  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return; }
    setNoteState('saving');
    const t = setTimeout(async () => {
      try {
        const updated = await api.update(project.id, { notes });
        setProject(updated);
        setNoteState('saved');
        setTimeout(() => setNoteState('idle'), 1500);
      } catch {
        setNoteState('idle');
        toast('Could not save notes', 'error');
      }
    }, 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notes]);

  const saveTags = async (tags) => {
    try {
      const updated = await api.update(project.id, { tags });
      setProject(updated);
    } catch (e) {
      toast(`Could not save tags: ${e.message}`, 'error');
    }
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
      toast(`Frame at ${fmtTime(v.currentTime)} added`);
    } catch (e) {
      toast(`Capture failed: ${e.message}`, 'error');
    } finally {
      setCapturing(false);
    }
  };

  const deleteFrame = async (frameId) => {
    try {
      const updated = await api.removeFrame(project.id, frameId);
      setProject(updated);
    } catch (e) {
      toast(`Could not delete frame: ${e.message}`, 'error');
    }
  };

  return (
    <div>
      <div className="player-wrap">
        <video
          ref={videoRef}
          src={fileUrl(project, project.video)}
          controls
          onPlay={() => setPaused(false)}
          onPause={() => setPaused(true)}
          onTimeUpdate={(e) => setCurrent(e.target.currentTime)}
        />
      </div>

      <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <button className="btn btn-primary" onClick={addFrame} disabled={capturing}>
          <Camera size={16} /> {capturing ? 'Capturing…' : 'Add current frame'}
        </button>
        <span className="hint" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Clock size={13} /> {fmtTime(current)} / {fmtTime(project.duration)}
          {!paused && ' · pause to grab the exact frame'}
        </span>
      </div>

      {/* Tags */}
      <div className="section">
        <div className="section-head">
          <h2><TagIcon size={16} /> Tags</h2>
        </div>
        <TagInput
          tags={project.tags || []}
          onChange={saveTags}
          autoTags={autoLen ? [autoLen] : []}
          placeholder="Add a tag…"
        />
        <div className="hint" style={{ marginTop: 8 }}>
          The length tag <b>{autoLen}</b> is added automatically and used for filtering.
        </div>
      </div>

      {/* Notes */}
      <div className="section">
        <div className="section-head">
          <h2><StickyNote size={16} /> Notes</h2>
        </div>
        <div className="notes-area">
          <textarea
            className="textarea"
            style={{ minHeight: 130 }}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Ideas, feedback, references, what worked…"
          />
          <span className="notes-status">
            {noteState === 'saving' ? 'Saving…' : noteState === 'saved' ? 'Saved' : ''}
          </span>
        </div>
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
          <div className="frames-grid">
            {frames.map((f) => (
              <div key={f.id} className="frame">
                <img src={fileUrl(project, f.file)} alt={`frame ${fmtTime(f.t)}`} loading="lazy" />
                <span className="frame-t">{fmtTime(f.t)}</span>
                <button className="frame-del" title="Delete frame" onClick={() => deleteFrame(f.id)}>
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
