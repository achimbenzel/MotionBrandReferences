import { useEffect, useRef, useState } from 'react';
import { X, Film, Palette, FileText, UploadCloud, Trash2, Scissors, Crop } from 'lucide-react';
import { api } from '../lib/api.js';
import { captureFrame, lengthTag, fmtTime } from '../lib/media.js';
import { renderPdfPage, cropToBlob, centerCover } from '../lib/imaging.js';
import { useToast } from './Toast.jsx';
import TagInput from './TagInput.jsx';
import ColorBuilder from './ColorBuilder.jsx';
import ColorCard from './ColorCard.jsx';
import ThumbnailStudio from './ThumbnailStudio.jsx';

const ASPECT = 16 / 10;
const isPdf = (f) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name);

const TYPES = [
  { key: 'branding', label: 'Branding', sub: 'PDFs & images', icon: FileText },
  { key: 'motion', label: 'Motion Design', sub: 'Video', icon: Film },
  { key: 'color', label: 'Colors', sub: 'Palette', icon: Palette },
];

const BRANDING_SUGGESTIONS = ['Tech', 'Restaurant', 'Fashion', 'Sport', 'Finance', 'Food', 'Retail', 'Minimal', 'Colorful', 'Monochrome', 'Warm', 'Cool'];

export default function UploadModal({ initialType, onClose, onCreated }) {
  const toast = useToast();
  const [type, setType] = useState(initialType || 'branding');
  const [title, setTitle] = useState('');
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [category, setCategory] = useState('');
  const [tags, setTags] = useState([]);
  const [saving, setSaving] = useState(false);

  // motion
  const [videoFile, setVideoFile] = useState(null);
  const [videoSrc, setVideoSrc] = useState(null);
  const [duration, setDuration] = useState(0);
  const videoRef = useRef(null);

  // color
  const [colors, setColors] = useState([]);
  const [exampleFile, setExampleFile] = useState(null);
  const [examplePreview, setExamplePreview] = useState(null);

  // branding
  const [files, setFiles] = useState([]);

  // cover (all types)
  const [coverBlob, setCoverBlob] = useState(null);
  const [coverMeta, setCoverMeta] = useState(null);
  const [coverPreview, setCoverPreview] = useState(null);
  const [studioOpen, setStudioOpen] = useState(false);

  useEffect(() => () => { if (videoSrc) URL.revokeObjectURL(videoSrc); }, [videoSrc]);
  useEffect(() => () => { if (examplePreview) URL.revokeObjectURL(examplePreview); }, [examplePreview]);
  useEffect(() => () => { if (coverPreview) URL.revokeObjectURL(coverPreview); }, [coverPreview]);

  // Drop a chosen cover when the type changes (its source no longer applies).
  const clearCover = () => {
    setCoverBlob(null); setCoverMeta(null);
    setCoverPreview((prev) => { if (prev) URL.revokeObjectURL(prev); return null; });
  };
  useEffect(() => { clearCover(); /* eslint-disable-next-line */ }, [type]);

  const acceptCover = (blob, meta) => {
    setCoverBlob(blob); setCoverMeta(meta);
    setCoverPreview((prev) => { if (prev) URL.revokeObjectURL(prev); return URL.createObjectURL(blob); });
    setStudioOpen(false);
  };

  // Close on Escape.
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !saving) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, saving]);

  const pickVideo = (file) => {
    if (!file) return;
    if (videoSrc) URL.revokeObjectURL(videoSrc);
    setVideoFile(file);
    setVideoSrc(URL.createObjectURL(file));
    setDuration(0);
    if (!title) setTitle(file.name.replace(/\.[^.]+$/, ''));
  };

  const onVideoMeta = () => {
    const v = videoRef.current;
    if (!v) return;
    setDuration(v.duration || 0);
    // Default the cover to ~15% in.
    v.currentTime = Math.min((v.duration || 0) * 0.15, (v.duration || 0) - 0.05);
  };

  const pickExample = (file) => {
    if (!file) return;
    if (examplePreview) URL.revokeObjectURL(examplePreview);
    setExampleFile(file);
    setExamplePreview(URL.createObjectURL(file));
  };

  const addFiles = (list) => {
    const arr = Array.from(list || []);
    setFiles((prev) => [...prev, ...arr]);
  };

  const canSave = title.trim() && (
    (type === 'motion' && videoFile) ||
    (type === 'color' && (colors.length > 0 || exampleFile)) ||
    (type === 'branding' && files.length > 0)
  );

  const coverAvailable = (type === 'motion' && !!videoSrc)
    || (type === 'branding' && files.length > 0)
    || (type === 'color' && !!exampleFile);
  const coverCtaLabel = type === 'branding' ? 'Choose cover (PDF page or image)'
    : type === 'motion' ? 'Frame & crop cover' : 'Frame & crop cover';
  const coverDefaultHint = type === 'branding' ? 'Default: first image, or PDF page 1'
    : type === 'motion' ? 'Default: current video frame' : 'Default: the example image';

  const brandingSources = files.map((f, i) => ({
    id: String(i), kind: isPdf(f) ? 'pdf' : 'image', src: f, name: f.name,
  }));

  const submit = async () => {
    if (!canSave || saving) return;
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append('type', type);
      fd.append('title', title.trim());
      fd.append('year', year.trim());
      fd.append('category', category.trim());
      fd.append('tags', JSON.stringify(tags));

      if (type === 'motion') {
        fd.append('video', videoFile);
        fd.append('duration', String(duration));
      }
      if (type === 'color') {
        if (exampleFile) fd.append('example', exampleFile);
        fd.append('colors', JSON.stringify(colors));
      }
      if (type === 'branding') {
        files.forEach((f) => fd.append('files', f));
      }

      // Cover thumbnail.
      const out = { w: 900, h: Math.round(900 / ASPECT) };
      if (coverBlob) {
        fd.append('thumb', coverBlob, 'thumb.webp');
        if (coverMeta) fd.append('thumbMeta', JSON.stringify(coverMeta));
      } else if (type === 'motion') {
        // Fallback: the currently-shown video frame.
        try {
          const blob = await captureFrame(videoRef.current, 0.85);
          fd.append('thumb', blob, 'thumb.webp');
        } catch { /* optional */ }
      } else if (type === 'branding' && !files.some((f) => !isPdf(f))) {
        // PDF-only branding with no chosen cover: auto-use page 1.
        try {
          const firstPdf = files.find(isPdf);
          if (firstPdf) {
            const { canvas } = await renderPdfPage(firstPdf, 1, 900);
            const rect = centerCover(canvas.width, canvas.height, ASPECT);
            const blob = await cropToBlob(canvas, rect, out);
            fd.append('thumb', blob, 'thumb.webp');
          }
        } catch { /* optional */ }
      }

      const project = await api.create(fd);
      onCreated(project);
    } catch (err) {
      toast(`Save failed: ${err.message}`, 'error');
      setSaving(false);
    }
  };

  return (
    <>
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget && !saving) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true">
        <div className="modal-head">
          <h2>Add new work</h2>
          <button className="icon-btn" onClick={onClose} disabled={saving} aria-label="Close"><X size={18} /></button>
        </div>

        <div className="modal-body">
          {/* Type picker */}
          <div className="type-picker">
            {TYPES.map((t) => {
              const Icon = t.icon;
              return (
                <button
                  key={t.key}
                  type="button"
                  className={`type-option ${type === t.key ? 'on' : ''}`}
                  onClick={() => setType(t.key)}
                >
                  <Icon size={22} />
                  <span>{t.label}</span>
                  <small>{t.sub}</small>
                </button>
              );
            })}
          </div>

          {/* Common fields */}
          <div className="field">
            <label>Title</label>
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Project name" autoFocus />
          </div>
          <div className="row-2">
            <div className="field">
              <label>Year</label>
              <input className="input" value={year} onChange={(e) => setYear(e.target.value)} placeholder="2026" />
            </div>
            <div className="field">
              <label>Category / subtitle</label>
              <input
                className="input"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder={type === 'motion' ? 'Motion Design / Animation' : type === 'color' ? 'Palette' : 'Brand Identity'}
              />
            </div>
          </div>

          {/* Type-specific */}
          {type === 'motion' && (
            <div className="field">
              <label>Video</label>
              {!videoSrc ? (
                <FilePick accept="video/*" onPick={(f) => pickVideo(f[0])}>
                  <UploadCloud size={22} />
                  <div>Select a video file</div>
                  <div className="hint">It is copied into your local library folder</div>
                </FilePick>
              ) : (
                <div>
                  <div className="player-wrap" style={{ marginBottom: 10 }}>
                    <video ref={videoRef} src={videoSrc} controls muted onLoadedMetadata={onVideoMeta} />
                  </div>
                  <div className="hint" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <Scissors size={13} />
                    Scrub/pause on the frame you want as the cover — it’s captured on save.
                    {duration > 0 && (
                      <>
                        <span className="tag auto" style={{ marginLeft: 4 }}>{fmtTime(duration)}</span>
                        <span className="tag auto">{lengthTag(duration)}</span>
                      </>
                    )}
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setVideoFile(null); setVideoSrc(null); }}>Change</button>
                  </div>
                </div>
              )}
            </div>
          )}

          {type === 'color' && (
            <>
              <div className="field">
                <label>Example image (optional)</label>
                {!examplePreview ? (
                  <FilePick accept="image/*" onPick={(f) => pickExample(f[0])}>
                    <UploadCloud size={22} />
                    <div>Select an image</div>
                  </FilePick>
                ) : (
                  <div className="example-img" style={{ marginBottom: 0, position: 'relative' }}>
                    <img src={examplePreview} alt="example" />
                    <button className="icon-btn" style={{ position: 'absolute', top: 8, right: 8 }} onClick={() => { setExampleFile(null); setExamplePreview(null); }}><Trash2 size={16} /></button>
                  </div>
                )}
              </div>
              <div className="field">
                <label>Colors — enter any one type, the rest are derived</label>
                <ColorBuilder onAdd={(c) => setColors((prev) => [...prev, { id: Math.random().toString(36).slice(2, 8), ...c }])} />
              </div>
              {colors.length > 0 && (
                <div className="color-grid" style={{ marginTop: 4 }}>
                  {colors.map((c, i) => (
                    <ColorCard key={c.id} color={c} onRemove={() => setColors((prev) => prev.filter((_, j) => j !== i))} />
                  ))}
                </div>
              )}
            </>
          )}

          {type === 'branding' && (
            <>
              <div className="field">
                <label>PDFs & images</label>
                <FilePick accept="application/pdf,image/*" multiple onPick={addFiles}>
                  <UploadCloud size={22} />
                  <div>Select PDFs (guidelines / decks) or images</div>
                  <div className="hint">You can add several — click through PDFs page by page later</div>
                </FilePick>
                {files.length > 0 && (
                  <div className="taglist" style={{ marginTop: 12 }}>
                    {files.map((f, i) => (
                      <span key={i} className="tag">
                        {f.name.length > 26 ? f.name.slice(0, 24) + '…' : f.name}
                        <span className="x" onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}><X size={12} /></span>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {/* Cover thumbnail (all types) */}
          {coverAvailable && (
            <div className="field">
              <label>Cover thumbnail</label>
              <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
                {coverPreview ? (
                  <img src={coverPreview} alt="cover" style={{ width: 168, aspectRatio: `${ASPECT}`, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)' }} />
                ) : (
                  <div className="cover-placeholder">{coverDefaultHint}</div>
                )}
                <button type="button" className="btn btn-sm" onClick={() => setStudioOpen(true)}>
                  <Crop size={15} /> {coverPreview ? 'Adjust cover' : coverCtaLabel}
                </button>
              </div>
            </div>
          )}

          {/* Tags (all types) */}
          <div className="field" style={{ marginTop: 4 }}>
            <label>Tags {type === 'branding' && <span className="hint">— color scheme, type (tech, restaurant…)</span>}</label>
            <TagInput
              tags={tags}
              onChange={setTags}
              suggestions={type === 'branding' ? BRANDING_SUGGESTIONS : []}
            />
          </div>
        </div>

        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="btn btn-primary" onClick={submit} disabled={!canSave || saving}>
            {saving ? 'Saving…' : 'Save to library'}
          </button>
        </div>
      </div>
    </div>

    {studioOpen && (
      <ThumbnailStudio
        type={type}
        video={type === 'motion' ? videoSrc : null}
        assets={type === 'branding' ? brandingSources : []}
        image={type === 'color' ? exampleFile : null}
        initialMeta={coverMeta}
        onDone={acceptCover}
        onClose={() => setStudioOpen(false)}
      />
    )}
    </>
  );
}

/** Clickable file dropzone. */
function FilePick({ accept, multiple, onPick, children }) {
  const ref = useRef(null);
  return (
    <div
      className="dropzone"
      onClick={() => ref.current?.click()}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => { e.preventDefault(); onPick(e.dataTransfer.files); }}
    >
      {children}
      <input
        ref={ref}
        type="file"
        accept={accept}
        multiple={multiple}
        className="visually-hidden-input"
        onChange={(e) => { if (e.target.files?.length) onPick(e.target.files); e.target.value = ''; }}
      />
    </div>
  );
}
