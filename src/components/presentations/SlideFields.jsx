import { useRef } from 'react';
import { UploadCloud, Library, X, ChevronUp, ChevronDown, Trash2, Plus, Crosshair } from 'lucide-react';
import AutoTextarea from '../AutoTextarea.jsx';
import { useFromApp } from '../FromApp.jsx';
import { SLIDE_TYPES, DEFAULT_ACCENT } from '../../lib/slides.js';
import { deckFileUrl } from './Slide.jsx';

const rid = () => Math.random().toString(36).slice(2, 8);
const blankOf = (fd) => (fd.kind === 'toggle' ? false : fd.kind === 'image' ? null : fd.kind === 'select' ? fd.options[0].key : fd.kind === 'color' ? DEFAULT_ACCENT : '');

/**
 * A picture field: upload one, take one from the app, or remove it; a click on
 * the preview sets the point it's cropped around; Fill / Fit.
 */
export function ImageField({ deck, value, path, onChange, onUpload, label = 'Picture', busy }) {
  const fileRef = useRef(null);
  const [picker, pick] = useFromApp();
  const src = deckFileUrl(deck, value?.file);
  const setPoint = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    onChange({ ...value, x: Math.round(((e.clientX - r.left) / r.width) * 100), y: Math.round(((e.clientY - r.top) / r.height) * 100) });
  };
  const fromApp = async () => {
    const got = await pick({ accept: 'image', title: label });
    if (got) onUpload({ source: got.source });
  };
  return (
    <div className="pzf-image" data-path={path} tabIndex={-1}>
      {src ? (
        <button type="button" className="pzf-thumb" onClick={setPoint} title="Click where the picture should stay in view when it's cropped">
          <img src={src} alt="" style={{ objectFit: 'cover', objectPosition: `${value.x ?? 50}% ${value.y ?? 50}%` }} />
          <span className="pzf-point" style={{ left: `${value.x ?? 50}%`, top: `${value.y ?? 50}%` }}><Crosshair size={14} /></span>
        </button>
      ) : <div className="pzf-thumb empty">No picture yet — an accent-coloured frame shows instead</div>}
      <div className="pzf-image-tools">
        <button type="button" className="btn btn-sm" disabled={busy} onClick={() => fileRef.current?.click()}><UploadCloud size={14} /> {src ? 'Replace' : 'Upload'}</button>
        <button type="button" className="btn btn-sm" disabled={busy} onClick={fromApp}><Library size={14} /> From the app</button>
        {src && (
          <div className="segmented segmented-sm" role="group" aria-label="Picture fit">
            {[['cover', 'Fill'], ['contain', 'Fit']].map(([k, l]) => <button key={k} type="button" className={(value.fit || 'cover') === k ? 'on' : ''} onClick={() => onChange({ ...value, fit: k })}>{l}</button>)}
          </div>
        )}
        {src && <button type="button" className="icon-btn" onClick={() => onChange(null)} aria-label="Remove the picture" title="Remove"><X size={15} /></button>}
      </div>
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onUpload(f); }} />
      {picker}
    </div>
  );
}

function Field({ fd, value, path, deck, onChange, onUpload, busy }) {
  switch (fd.kind) {
    case 'text':
      return <input className="input" value={value ?? ''} data-path={path} onChange={(e) => onChange(e.target.value)} aria-label={fd.label} />;
    case 'textarea':
      return <AutoTextarea className="input pzf-area" value={value ?? ''} data-path={path} onChange={(e) => onChange(e.target.value)} aria-label={fd.label} />;
    case 'toggle':
      return <label className="pzf-check" data-path={path}><input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} /> {fd.label}</label>;
    case 'select':
      return (
        <div className="segmented segmented-sm pzf-seg" role="group" aria-label={fd.label} data-path={path}>
          {fd.options.map((o) => <button key={o.key} type="button" className={value === o.key ? 'on' : ''} aria-pressed={value === o.key} onClick={() => onChange(o.key)}>{o.label}</button>)}
        </div>
      );
    case 'color':
      return (
        <span className="pzf-color" data-path={path}>
          <input type="color" value={value || DEFAULT_ACCENT} onChange={(e) => onChange(e.target.value)} aria-label={fd.label} />
          <input className="input" value={value || ''} maxLength={7} onChange={(e) => onChange(e.target.value.startsWith('#') ? e.target.value : `#${e.target.value}`)} aria-label={`${fd.label} (HEX)`} />
        </span>
      );
    case 'image':
      return <ImageField deck={deck} value={value} path={path} onChange={onChange} onUpload={(pic) => onUpload(pic, path)} label={fd.label} busy={busy} />;
    case 'list':
      return <ListField fd={fd} value={value || []} path={path} deck={deck} onChange={onChange} onUpload={onUpload} busy={busy} />;
    case 'table':
      return <TableField value={value} path={path} onChange={onChange} />;
    default:
      return null;
  }
}

/** Items of a list (works, cards, packages …): each with its fields; moved, removed, added. */
function ListField({ fd, value, path, deck, onChange, onUpload, busy }) {
  const set = (i, p) => onChange(value.map((it, j) => (j === i ? { ...it, ...p } : it)));
  const move = (i, d) => { const next = [...value]; const [x] = next.splice(i, 1); next.splice(i + d, 0, x); onChange(next); };
  const headOf = (it) => String(it[fd.of[0].key] && typeof it[fd.of[0].key] === 'string' ? it[fd.of[0].key] : it.title || it.name || it.caption || '').replace(/\*/g, '').split('\n')[0];
  return (
    <div className="pzf-list">
      {value.map((it, i) => (
        <div key={it.id || i} className="pzf-item">
          <div className="pzf-item-head">
            <b>{String(i + 1).padStart(2, '0')}</b><span>{headOf(it)}</span>
            <button type="button" className="icon-btn" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up"><ChevronUp size={14} /></button>
            <button type="button" className="icon-btn" disabled={i === value.length - 1} onClick={() => move(i, 1)} aria-label="Move down"><ChevronDown size={14} /></button>
            <button type="button" className="icon-btn" onClick={() => onChange(value.filter((_, j) => j !== i))} aria-label="Remove"><Trash2 size={14} /></button>
          </div>
          {fd.of.map((sub) => (
            <div key={sub.key} className="pzf-row">
              {sub.kind !== 'toggle' && <span className="pzf-label">{sub.label}</span>}
              <Field fd={sub} value={it[sub.key]} path={`${path}.${i}.${sub.key}`} deck={deck} busy={busy}
                onChange={(v) => set(i, { [sub.key]: v })} onUpload={onUpload} />
            </div>
          ))}
        </div>
      ))}
      {value.length < (fd.max || 12) && (
        <button type="button" className="btn btn-sm btn-ghost pzf-add" onClick={() => onChange([...value, { id: rid(), ...Object.fromEntries(fd.of.map((x) => [x.key, blankOf(x)])) }])}>
          <Plus size={14} /> {fd.add || 'Add'}
        </button>
      )}
    </div>
  );
}

/** A comparison table: column heads, rows of cells, the column to highlight. */
function TableField({ value, path, onChange }) {
  const t = value || { columns: [''], rows: [], highlight: 0 };
  const set = (p) => onChange({ ...t, ...p });
  const setCell = (r, c, v) => set({ rows: t.rows.map((row, i) => (i === r ? row.map((x, j) => (j === c ? v : x)) : row)) });
  return (
    <div className="pzf-table" data-path={path}>
      <div className="pzf-table-grid" style={{ '--c': t.columns.length }}>
        {t.columns.map((c, i) => (
          <input key={`h${i}`} className="input pzf-th" value={c} placeholder={i ? `Column ${i}` : 'First column'} onChange={(e) => set({ columns: t.columns.map((x, j) => (j === i ? e.target.value : x)) })} aria-label={`Column ${i + 1}`} />
        ))}
        {t.rows.map((row, r) => row.map((cell, c) => (
          <input key={`${r}-${c}`} className="input" value={cell} onChange={(e) => setCell(r, c, e.target.value)} aria-label={`Row ${r + 1}, column ${c + 1}`} />
        )))}
      </div>
      <div className="pzf-table-tools">
        <button type="button" className="btn btn-sm" disabled={t.rows.length >= 24} onClick={() => set({ rows: [...t.rows, t.columns.map(() => '')] })}><Plus size={14} /> Row</button>
        <button type="button" className="btn btn-sm" disabled={!t.rows.length} onClick={() => set({ rows: t.rows.slice(0, -1) })}><Trash2 size={14} /> Last row</button>
        <button type="button" className="btn btn-sm" disabled={t.columns.length >= 6} onClick={() => set({ columns: [...t.columns, ''], rows: t.rows.map((row) => [...row, '']) })}><Plus size={14} /> Column</button>
        <button type="button" className="btn btn-sm" disabled={t.columns.length <= 2} onClick={() => set({ columns: t.columns.slice(0, -1), rows: t.rows.map((row) => row.slice(0, -1)), highlight: Math.min(t.highlight, t.columns.length - 2) })}><Trash2 size={14} /> Last column</button>
        <label className="pzf-inline">Highlight
          <select className="input" value={t.highlight} onChange={(e) => set({ highlight: Number(e.target.value) })}>
            <option value={0}>—</option>
            {t.columns.slice(1).map((c, i) => <option key={i + 1} value={i + 1}>{c || `Column ${i + 2}`}</option>)}
          </select>
        </label>
      </div>
      <p className="hint">✓ and — become a tick and a dash.</p>
    </div>
  );
}

/** The fields of one slide. `onUpload(pic, path)` uploads a picture and puts it at `path` ('image', 'items.2.image'). */
export default function SlideFields({ deck, slide, onData, onSlide, onUpload, busy }) {
  const t = SLIDE_TYPES[slide.type];
  const d = slide.data || {};
  return (
    <div className="pzf">
      <p className="hint pzf-hint">{t.hint}{t.fields.some((x) => x.kind === 'textarea') ? ' — *word* shows a word in your accent colour.' : ''}</p>
      {t.fields.map((fd) => (
        <div key={fd.key} className="pzf-row">
          {fd.kind !== 'toggle' && <span className="pzf-label">{fd.label}</span>}
          <Field fd={fd} value={d[fd.key]} path={fd.key} deck={deck} busy={busy}
            onChange={(v) => onData({ [fd.key]: v })} onUpload={onUpload} />
        </div>
      ))}
      {t.chrome !== false && (
        <div className="pzf-row">
          <span className="pzf-label">Label at the bottom right</span>
          <input className="input" value={slide.section || ''} data-path="@section" placeholder="e.g. HOW I WORK" onChange={(e) => onSlide({ section: e.target.value.toUpperCase() })} aria-label="Label at the bottom right" />
        </div>
      )}
    </div>
  );
}
