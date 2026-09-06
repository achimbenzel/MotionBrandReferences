import { useEffect, useRef, useState } from 'react';
import { X, ChevronLeft, ChevronRight, Image as ImageIcon, FileText, Film, Upload, Check, Loader2 } from 'lucide-react';
import { loadImage, renderPdfPage } from '../lib/imaging.js';
import ThumbCropper from './ThumbCropper.jsx';

/**
 * Choose a cover source (video frame, PDF page, or image) and crop/zoom it.
 * `video`, `assets`, `image` are the available sources (File objects when
 * creating, /data URLs when editing an existing project). Calls
 * onDone(blob, meta); the parent performs the upload and closes.
 */
export default function ThumbnailStudio({ type, video, assets = [], image, initialMeta, onDone, onClose, saving, aspect = 16 / 10 }) {
  const [step, setStep] = useState('pick');
  const [source, setSource] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const cropRef = useRef(null);
  const uploadRef = useRef(null);
  const cleanupRef = useRef(null);

  // Branding PDF pager.
  const imageAssets = assets.filter((a) => a.kind === 'image');
  const pdfAssets = assets.filter((a) => a.kind === 'pdf');
  const [activeAsset, setActiveAsset] = useState(assets[0]?.id);
  const [pdfPage, setPdfPage] = useState(1);
  const [pdfInfo, setPdfInfo] = useState({ numPages: 0 });
  const [pdfPreview, setPdfPreview] = useState(null); // canvas for preview
  const active = assets.find((a) => a.id === activeAsset);

  useEffect(() => () => cleanupRef.current?.(), []);

  const useSource = (src, cleanup) => {
    cleanupRef.current?.();
    cleanupRef.current = cleanup || null;
    setSource(src);
    setStep('crop');
  };

  const fromImage = async (src) => {
    setBusy(true); setError(null);
    try { const { img, cleanup } = await loadImage(src); useSource(img, cleanup); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };

  // Render the active PDF page for preview whenever page/asset changes.
  // We keep the rendered canvas (crop source) plus a data-URL for display —
  // rendering via <img> avoids inserting a raw canvas into React's tree.
  useEffect(() => {
    if (!active || active.kind !== 'pdf') { setPdfPreview(null); return; }
    let alive = true;
    setBusy(true); setError(null);
    renderPdfPage(active.src, pdfPage, 900)
      .then(({ canvas, numPages }) => {
        if (alive) { setPdfPreview({ canvas, url: canvas.toDataURL('image/webp', 0.9) }); setPdfInfo({ numPages }); }
      })
      .catch((e) => { if (alive) setError(e.message); })
      .finally(() => { if (alive) setBusy(false); });
    return () => { alive = false; };
  }, [active, pdfPage]);

  // Color / Font: jump straight into cropping the provided image if present.
  useEffect(() => {
    if ((type === 'color' || type === 'font') && image && step === 'pick') fromImage(image);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const confirm = async () => {
    try {
      const { blob, meta } = await cropRef.current.capture();
      onDone(blob, meta);
    } catch (e) { setError(e.message); }
  };

  return (
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget && !saving) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true" style={{ maxWidth: 680 }}>
        <div className="modal-head">
          <h2>{step === 'crop' ? 'Frame the cover' : 'Choose a cover'}</h2>
          <button className="icon-btn" onClick={onClose} disabled={saving}><X size={18} /></button>
        </div>

        <div className="modal-body">
          {error && <div className="hint" style={{ color: 'var(--danger)', marginBottom: 10 }}>{error}</div>}

          {step === 'pick' && (
            <div>
              {type === 'motion' && video && (
                <MotionPicker src={video} onUse={(canvas) => useSource(canvas)} busy={busy} />
              )}

              {(type === 'branding' || type === 'logo') && assets.length > 0 && (
                <div>
                  {assets.length > 1 && (
                    <div className="asset-tabs">
                      {assets.map((a, i) => (
                        <button key={a.id} className={`asset-tab ${active?.id === a.id ? 'on' : ''}`}
                          onClick={() => { setActiveAsset(a.id); setPdfPage(1); }}>
                          {a.kind === 'pdf' ? <FileText size={14} /> : <ImageIcon size={14} />}
                          {a.name ? (a.name.length > 18 ? a.name.slice(0, 16) + '…' : a.name) : `${a.kind} ${i + 1}`}
                        </button>
                      ))}
                    </div>
                  )}

                  {active?.kind === 'pdf' ? (
                    <div className="pdf-viewer">
                      <div className="pdf-stage" style={{ minHeight: 260 }}>
                        {busy && <Loader2 size={24} style={{ animation: 'spin 1s linear infinite', color: 'var(--text-faint)' }} />}
                        {pdfPreview && <img className="pdf-preview-img" src={pdfPreview.url} alt="PDF page preview" />}
                      </div>
                      <div className="pdf-controls">
                        <button className="icon-btn" disabled={pdfPage <= 1} onClick={() => setPdfPage((p) => Math.max(1, p - 1))}><ChevronLeft size={18} /></button>
                        <span className="page-num">{pdfPage} / {pdfInfo.numPages || '…'}</span>
                        <button className="icon-btn" disabled={pdfPage >= pdfInfo.numPages} onClick={() => setPdfPage((p) => p + 1)}><ChevronRight size={18} /></button>
                      </div>
                      <button className="btn btn-primary" disabled={!pdfPreview || busy} onClick={() => useSource(pdfPreview.canvas)}>
                        <Check size={16} /> Use this page
                      </button>
                    </div>
                  ) : active?.kind === 'image' ? (
                    <div style={{ textAlign: 'center' }}>
                      <div className="example-img" style={{ marginBottom: 12 }}>
                        <img src={active.src} alt={active.name} style={{ maxHeight: 320, width: 'auto', margin: '0 auto' }} />
                      </div>
                      <button className="btn btn-primary" onClick={() => fromImage(active.src)}><Check size={16} /> Use this image</button>
                    </div>
                  ) : null}
                </div>
              )}

              {(type === 'color' || type === 'font') && !image && (
                <div className="dropzone" onClick={() => uploadRef.current?.click()}>
                  <Upload size={22} />
                  <div>Upload an image to use as the cover</div>
                </div>
              )}

              <div style={{ marginTop: 16, textAlign: 'center' }}>
                <button className="btn btn-ghost btn-sm" onClick={() => uploadRef.current?.click()}>
                  <Upload size={15} /> Upload a different image
                </button>
                <input ref={uploadRef} type="file" accept="image/*" className="visually-hidden-input"
                  onChange={(e) => { if (e.target.files?.[0]) fromImage(e.target.files[0]); e.target.value = ''; }} />
              </div>
            </div>
          )}

          {step === 'crop' && source && (
            <div>
              <ThumbCropper ref={cropRef} source={source} initial={initialMeta} aspect={aspect} />
              <div className="hint" style={{ marginTop: 10 }}>Drag to reposition · use the slider to zoom. This is exactly what shows on the card.</div>
            </div>
          )}
        </div>

        <div className="modal-foot">
          {step === 'crop' && !((type === 'color' || type === 'font') && !video && assets.length === 0) && (
            <button className="btn btn-ghost" onClick={() => { setStep('pick'); }} disabled={saving} style={{ marginRight: 'auto' }}>
              <ChevronLeft size={15} /> Back
            </button>
          )}
          <button className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancel</button>
          {step === 'crop' && (
            <button className="btn btn-primary" onClick={confirm} disabled={saving}>
              {saving ? 'Saving…' : 'Save cover'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Small video scrubber that hands back the current frame as a canvas. */
function MotionPicker({ src, onUse, busy }) {
  const ref = useRef(null);
  const grab = () => {
    const v = ref.current;
    if (!v || !v.videoWidth) return;
    const c = document.createElement('canvas');
    c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext('2d').drawImage(v, 0, 0);
    onUse(c);
  };
  return (
    <div>
      <div className="player-wrap" style={{ marginBottom: 10 }}>
        <video ref={ref} src={src} controls muted />
      </div>
      <div className="hint" style={{ marginBottom: 12 }}><Film size={13} /> Scrub/pause on the frame you want, then continue.</div>
      <button className="btn btn-primary" onClick={grab} disabled={busy}><Check size={16} /> Use this frame</button>
    </div>
  );
}

