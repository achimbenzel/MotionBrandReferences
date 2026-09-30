// The plan page's blocks with uploaded files: moodboards, PDFs and files. A
// drop onto one uploads into it (the page keeps which one is dragged over).
import { useState } from 'react';
import { UploadCloud, Library, ChevronDown, ChevronRight, X, Plus, FileText, ExternalLink, Trash2, File as FileIcon } from 'lucide-react';
import PdfViewer from '../PdfViewer.jsx';
import { planFileUrl } from '../../lib/api.js';

const fmtBytes = (n) => {
  if (n == null) return '';
  const u = ['B', 'KB', 'MB', 'GB']; let v = n; let i = 0;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i += 1; }
  return `${v.toFixed(v < 10 && i > 0 ? 1 : 0)} ${u[i]}`;
};

/** Pictures in a masonry grid; drop, add, paste or pick them from the app. */
export function MoodboardBlock({ plan, block: b, menu, icon: Icon, editBlock, dragOver, onDrag, onDropFiles, onAddFiles, onFromApp, onRemoveFile, onLightbox }) {
  return (
    <div className={`section block moodboard ${dragOver ? 'dragover' : ''}`}
      onDragOver={(e) => { e.preventDefault(); onDrag(true); }}
      onDragLeave={(e) => { if (e.target === e.currentTarget) onDrag(false); }}
      onDrop={(e) => { e.preventDefault(); onDrag(false); onDropFiles(e.dataTransfer.files); }}>
      <div className="moodboard-head">
        <button className="mb-collapse" onClick={() => editBlock(b.id, { collapsed: !b.collapsed }, true)}>
          {b.collapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
          <Icon size={16} /><span className="mb-name">{b.title}</span>
          <span className="count">{(b.images || []).length}</span>
        </button>
        <div className="moodboard-actions">
          <button className="btn btn-sm" onClick={onAddFiles}><UploadCloud size={14} /> Add images</button>
          <button className="btn btn-sm btn-ghost" onClick={onFromApp} title="Pictures that are already in the app"><Library size={14} /><span className="mb-long"> From the app</span></button>
          {menu}
        </div>
      </div>
      {!b.collapsed && ((b.images || []).length ? (
        <div className="masonry">
          {b.images.map((im, idx) => (
            <div className="masonry-item" key={im.id}>
              <img src={planFileUrl(plan, im.file)} alt="" loading="lazy"
                onClick={() => onLightbox(b.images.map((x) => ({ src: planFileUrl(plan, x.file) })), idx)} />
              <div className="masonry-menu" onClick={(e) => e.stopPropagation()}>
                <button className="icon-btn masonry-menu-btn" title="Remove" onClick={() => onRemoveFile(im.id)}><X size={15} /></button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="dropzone" onClick={onAddFiles}>
          <UploadCloud size={20} /><div>Drop or select images · or paste (⌘V)</div>
        </div>
      ))}
    </div>
  );
}

/** PDFs shown inline, page by page. */
export function PdfBlock({ plan, block: b, menu, icon: Icon, dragOver, onDrag, onDropFiles, onAdd, onRemoveFile }) {
  return (
    <div className={`section block ${dragOver ? 'dragover' : ''}`}
      onDragOver={(e) => { e.preventDefault(); onDrag(true); }}
      onDragLeave={(e) => { if (e.target === e.currentTarget) onDrag(false); }}
      onDrop={(e) => { e.preventDefault(); onDrag(false); onDropFiles(e.dataTransfer.files); }}>
      <div className="section-head">
        <h2><Icon size={16} /> {b.title} {(b.files || []).length > 0 && <span className="count">{b.files.length}</span>}</h2>
        <div className="moodboard-actions">
          <button className="btn btn-sm" onClick={onAdd}><Plus size={14} /> Add PDF</button>{menu}
        </div>
      </div>
      {(b.files || []).length ? (
        <PlanPdfBlock plan={plan} files={b.files} onRemove={onRemoveFile} />
      ) : (
        <div className="dropzone" onClick={onAdd}>
          <FileText size={20} /><div>Add a PDF — it renders inline, page by page (like Branding)</div>
        </div>
      )}
    </div>
  );
}

/** Files, each with a square example picture before it. */
export function FilesBlock({ plan, block: b, menu, icon: Icon, dragOver, onDrag, onDropFiles, onAdd, onRemoveFile }) {
  return (
    <div className={`section block ${dragOver ? 'dragover' : ''}`}
      onDragOver={(e) => { e.preventDefault(); onDrag(true); }}
      onDragLeave={(e) => { if (e.target === e.currentTarget) onDrag(false); }}
      onDrop={(e) => { e.preventDefault(); onDrag(false); onDropFiles(e.dataTransfer.files); }}>
      <div className="section-head">
        <h2><Icon size={16} /> {b.title} {(b.files || []).length > 0 && <span className="count">{b.files.length}</span>}</h2>
        <div className="moodboard-actions">
          <button className="btn btn-sm" onClick={onAdd}><Plus size={14} /> Add file</button>{menu}
        </div>
      </div>

      {(b.files || []).length ? (
        <div className="filelist">
          {b.files.map((f) => {
            const ex = f.example ? planFileUrl(plan, f.example) : null;
            return (
              <div className="filerow" key={f.id}>
                <a className="filerow-ex" href={planFileUrl(plan, f.file)} target="_blank" rel="noopener noreferrer" title={f.title || f.name}>
                  {ex ? <img src={ex} alt="" loading="lazy" /> : <FileIcon size={20} />}
                </a>
                <div className="filerow-main">
                  <a className="filerow-name" href={planFileUrl(plan, f.file)} target="_blank" rel="noopener noreferrer" title={f.title || f.name}>{f.title || f.name}</a>
                  <span className="filerow-meta">{[f.title ? f.name : null, fmtBytes(f.size)].filter(Boolean).join(' · ')}</span>
                </div>
                <a className="icon-btn filerow-open" href={planFileUrl(plan, f.file)} target="_blank" rel="noopener noreferrer" title="Open"><ExternalLink size={15} /></a>
                <button className="icon-btn filerow-del" onClick={() => onRemoveFile(f.id)} title="Move to Trash"><X size={15} /></button>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="dropzone" onClick={onAdd}>
          <UploadCloud size={20} /><div>Add a file — with an optional example image</div>
        </div>
      )}
    </div>
  );
}

// A PDF block: renders the active PDF inline (like Branding), with tabs when
// there is more than one, an "Open" link and a Remove button.
function PlanPdfBlock({ plan, files, onRemove }) {
  const [activeId, setActiveId] = useState(files[0]?.id);
  const active = files.find((f) => f.id === activeId) || files[0];
  const shorten = (n) => (n && n.length > 22 ? `${n.slice(0, 20)}…` : n);
  return (
    <div>
      {files.length > 1 && (
        <div className="asset-tabs">
          {files.map((f, i) => (
            <button key={f.id} className={`asset-tab ${active?.id === f.id ? 'on' : ''}`} onClick={() => setActiveId(f.id)}>
              <FileText size={14} /> {shorten(f.title || f.name) || `PDF ${i + 1}`}
            </button>
          ))}
        </div>
      )}
      {active && (
        <>
          <PdfViewer key={active.id} url={planFileUrl(plan, active.file)} />
          <div className="plan-pdf-bar">
            <span className="plan-pdf-name" title={active.name}>{active.name}</span>
            <a className="btn btn-sm" href={planFileUrl(plan, active.file)} target="_blank" rel="noopener noreferrer"><ExternalLink size={14} /> Open</a>
            <button className="btn btn-sm btn-danger" onClick={() => onRemove(active.id)}><Trash2 size={14} /> Remove</button>
          </div>
        </>
      )}
    </div>
  );
}
