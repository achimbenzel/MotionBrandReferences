import { useEffect, useRef, useState } from 'react';
import { X, UploadCloud, ImagePlus, FileUp } from 'lucide-react';

/**
 * Modal to add one file to a Files block: pick an optional example image
 * (shown as a square preview before the file), a title, and the file itself.
 */
export default function FileAddModal({ onSubmit, onClose }) {
  const [file, setFile] = useState(null);
  const [example, setExample] = useState(null);
  const [exampleUrl, setExampleUrl] = useState(null);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);
  const exRef = useRef(null);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, busy]);

  // Revoke the object URL when the example changes / unmounts.
  useEffect(() => () => { if (exampleUrl) URL.revokeObjectURL(exampleUrl); }, [exampleUrl]);

  const pickExample = (f) => {
    if (!f) return;
    if (exampleUrl) URL.revokeObjectURL(exampleUrl);
    setExample(f); setExampleUrl(URL.createObjectURL(f));
  };

  const submit = async () => {
    if (!file || busy) return;
    setBusy(true);
    try { await onSubmit({ file, example, title: title.trim() }); }
    finally { setBusy(false); }
  };

  return (
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true" style={{ maxWidth: 440 }}>
        <div className="modal-head">
          <h2>Add file</h2>
          <button className="icon-btn" onClick={onClose} disabled={busy}><X size={18} /></button>
        </div>
        <div className="modal-body">
          <div className="fileadd-row">
            <button type="button" className="fileadd-example" onClick={() => exRef.current?.click()} title="Choose an example image">
              {exampleUrl ? <img src={exampleUrl} alt="" /> : <span className="fileadd-example-empty"><ImagePlus size={22} /><span>Example image</span></span>}
            </button>
            <div className="fileadd-fields">
              <div className="field" style={{ marginBottom: 10 }}>
                <label>Title</label>
                <input className="input" value={title} autoFocus placeholder="Optional label…"
                  onChange={(e) => setTitle(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') submit(); }} />
              </div>
              <button type="button" className={`fileadd-file ${file ? 'has-file' : ''}`} onClick={() => fileRef.current?.click()}>
                <FileUp size={16} />
                <span>{file ? file.name : 'Choose file…'}</span>
              </button>
            </div>
          </div>
          <div className="hint" style={{ marginTop: 12 }}>The example image is shown as a square preview before the file.</div>
        </div>
        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn btn-primary" onClick={submit} disabled={!file || busy}>
            <UploadCloud size={15} /> Add file
          </button>
        </div>
      </div>
      <input ref={fileRef} type="file" className="visually-hidden-input" onChange={(e) => { setFile(e.target.files[0] || null); e.target.value = ''; }} />
      <input ref={exRef} type="file" accept="image/*" className="visually-hidden-input" onChange={(e) => { pickExample(e.target.files[0]); e.target.value = ''; }} />
    </div>
  );
}
