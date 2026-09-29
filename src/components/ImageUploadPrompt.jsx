import { useEffect, useMemo, useRef, useState } from 'react';
import { X, ImageDown, Check } from 'lucide-react';
import { api } from '../lib/api.js';
import { setImagePrompter, optimizeImage, FORMATS, EDGES } from '../lib/imageOptimize.js';
import Range from './Range.jsx';

export const fmtBytes = (n) => {
  const u = ['B', 'KB', 'MB', 'GB']; let v = n || 0; let i = 0;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i += 1; }
  return `${v.toFixed(v < 10 && i > 0 ? 1 : 0)} ${u[i]}`;
};
export const edgeLabel = (e) => (e ? `${e} px` : 'Original');

/**
 * Asks, when pictures are about to be uploaded, whether to make them smaller:
 * the format (WebP, JPEG or as they are), the long edge and the quality —
 * with what each picture comes to. Mounted once; the uploads wait for it.
 */
export default function ImageUploadPrompt() {
  const [queue, setQueue] = useState([]); // [{ files, prefs, resolve }]
  useEffect(() => setImagePrompter((files, prefs) => new Promise((resolve) => { setQueue((q) => [...q, { files, prefs, resolve }]); })), []);
  const req = queue[0];
  if (!req) return null;
  const done = (files) => { req.resolve(files); setQueue((q) => q.slice(1)); };
  return <OptimizeDialog key={queue.length} files={req.files} prefs={req.prefs} onDone={done} />;
}

function OptimizeDialog({ files, prefs, onDone }) {
  const [format, setFormat] = useState(prefs.format);
  const [maxEdge, setMaxEdge] = useState(prefs.maxEdge);
  const [quality, setQuality] = useState(prefs.quality);
  const [always, setAlways] = useState(false);
  const [skip, setSkip] = useState(() => new Set()); // indexes kept as they are
  const [results, setResults] = useState([]);
  const [busy, setBusy] = useState(true);
  const run = useRef(0);
  const thumbs = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  useEffect(() => () => thumbs.forEach((u) => URL.revokeObjectURL(u)), [thumbs]);

  // What each picture comes to with these settings (worked out here, then uploaded as is).
  useEffect(() => {
    const id = ++run.current;
    setBusy(true);
    const t = setTimeout(async () => {
      const out = [];
      for (const f of files) {
        if (run.current !== id) return;
        out.push(await optimizeImage(f, { format, maxEdge, quality }));
        if (run.current === id) setResults([...out]);
      }
      if (run.current === id) setBusy(false);
    }, 180);
    return () => clearTimeout(t);
  }, [files, format, maxEdge, quality]);

  const keepAll = () => {
    if (always) api.updateSettings({ imageUploads: { mode: 'off' } }).catch(() => {});
    onDone(files);
  };
  const upload = () => {
    api.updateSettings({ imageUploads: { format, maxEdge, quality, ...(always ? { mode: 'auto' } : {}) } }).catch(() => {});
    onDone(files.map((f, i) => (!skip.has(i) && results[i]?.changed ? results[i].file : f)));
  };
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); keepAll(); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  const before = files.reduce((n, f) => n + f.size, 0);
  const after = files.reduce((n, f, i) => n + (!skip.has(i) && results[i] ? results[i].after : f.size), 0);
  const saved = before ? Math.round((1 - after / before) * 100) : 0;
  const toggle = (i) => setSkip((s) => { const n = new Set(s); if (n.has(i)) n.delete(i); else n.add(i); return n; });

  return (
    <div className="overlay img-opt-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) keepAll(); }}>
      <div className="modal img-opt" role="dialog" aria-modal="true" aria-label="Make pictures smaller">
        <div className="modal-head">
          <h2><ImageDown size={18} /> Make {files.length === 1 ? 'the picture' : `${files.length} pictures`} smaller?</h2>
          <button type="button" className="icon-btn" onClick={keepAll} aria-label="Close — keep the originals"><X size={18} /></button>
        </div>
        <div className="modal-body">
          <div className="img-opt-total">
            <span>{fmtBytes(before)}</span><span className="img-opt-arrow">→</span>
            <b>{busy && results.length < files.length ? '…' : fmtBytes(after)}</b>
            {!busy && saved > 0 && <em>−{saved}%</em>}
          </div>
          <div className="img-opt-controls">
            <div className="img-opt-row">
              <span className="img-opt-label">Format</span>
              <div className="segmented segmented-sm" role="group" aria-label="Format">
                {FORMATS.map((f) => <button key={f.key} type="button" className={format === f.key ? 'on' : ''} onClick={() => setFormat(f.key)} title={f.hint}>{f.label}</button>)}
              </div>
            </div>
            <div className="img-opt-row">
              <span className="img-opt-label">Size <em>long edge</em></span>
              <div className="segmented segmented-sm img-opt-edges" role="group" aria-label="Size">
                {EDGES.map((e) => <button key={e} type="button" className={maxEdge === e ? 'on' : ''} onClick={() => setMaxEdge(e)}>{edgeLabel(e)}</button>)}
              </div>
            </div>
            <div className="img-opt-row">
              <span className="img-opt-label">Quality</span>
              <Range min={50} max={100} step={1} value={quality} onChange={(e) => setQuality(Number(e.target.value))} aria-label="Quality" />
              <span className="img-opt-q">{quality}</span>
            </div>
          </div>
          <div className="img-opt-list">
            {files.map((f, i) => {
              const r = results[i];
              const off = skip.has(i);
              return (
                <label key={i} className={`img-opt-item ${off ? 'off' : ''}`}>
                  <input type="checkbox" checked={!off} onChange={() => toggle(i)} aria-label={`Make ${f.name} smaller`} />
                  <img src={thumbs[i]} alt="" />
                  <span className="img-opt-item-main">
                    <b>{f.name || 'Picture'}</b>
                    <small>
                      {!r ? 'Working it out…' : off || !r.changed
                        ? <>{fmtBytes(f.size)} · stays as it is{r.note && !off ? ` (${r.note})` : ''}</>
                        : <>{fmtBytes(r.before)} → <b>{fmtBytes(r.after)}</b> · {r.width}×{r.height} · {r.file.type.replace('image/', '').toUpperCase()}{r.note ? ` · ${r.note}` : ''}</>}
                    </small>
                  </span>
                  {r?.changed && !off && <Check size={15} className="img-opt-ok" />}
                </label>
              );
            })}
          </div>
          <label className="img-opt-always">
            <input type="checkbox" checked={always} onChange={(e) => setAlways(e.target.checked)} />
            Don’t ask again — do this every time (you can change it in Settings)
          </label>
        </div>
        <div className="modal-foot">
          <button type="button" className="btn btn-ghost" onClick={keepAll}>Keep originals</button>
          <button type="button" className="btn btn-primary" onClick={upload} disabled={busy}>{busy ? 'Working…' : 'Upload smaller'}</button>
        </div>
      </div>
    </div>
  );
}
