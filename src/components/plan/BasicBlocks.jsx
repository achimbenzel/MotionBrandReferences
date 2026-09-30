// The plan page's simpler blocks — briefing, text, to-dos, links, headings,
// dividers and tables. Each edits its block through editBlock(id, patch,
// immediate) like the bigger ones (script, storyboard, review …).
import { Copy, X, Plus, Check, AlertTriangle, Link2, ExternalLink } from 'lucide-react';
import AutoTextarea from '../AutoTextarea.jsx';
import { hostOf, normalizeUrl } from '../../lib/types.js';

const rid = () => Math.random().toString(36).slice(2, 8);
const fmtSum = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(2));
const toNum = (v) => Number(String(v ?? '').trim().replace(',', '.'));

/** Questions and answers; Copy puts them all on the clipboard. */
export function BriefingBlock({ block: b, menu, icon: Icon, editBlock, onCopy, onRemoveField }) {
  const fields = b.fields || [];
  const setFields = (next, immediate = false) => editBlock(b.id, { fields: next }, immediate);
  const patchField = (fid, p) => setFields(fields.map((f) => (f.id === fid ? { ...f, ...p } : f)));
  const answered = fields.filter((f) => f.value.trim()).length;
  return (
    <div className="section block">
      <div className="section-head">
        <h2><Icon size={16} /> {b.title} {fields.length > 0 && <span className="count" title="Answered">{answered}/{fields.length}</span>}</h2>
        <div className="moodboard-actions">
          {fields.length > 0 && <button className="btn btn-sm" onClick={onCopy}><Copy size={14} /> Copy</button>}
          {menu}
        </div>
      </div>
      <div className="brief">
        {fields.map((f) => (
          <div className={`brief-row ${f.value.trim() ? 'done' : ''}`} key={f.id}>
            <input className="brief-label" value={f.label} placeholder="Question…" aria-label="Question"
              onChange={(e) => patchField(f.id, { label: e.target.value })} />
            <AutoTextarea className="brief-value" value={f.value} placeholder="—" aria-label={f.label || 'Answer'}
              onChange={(e) => patchField(f.id, { value: e.target.value })} />
            <button className="icon-btn brief-del" title="Remove field" onClick={() => onRemoveField(f)}><X size={14} /></button>
          </div>
        ))}
        <button className="btn btn-ghost btn-sm ms-add" onClick={() => setFields([...fields, { id: rid(), label: '', value: '' }], true)}><Plus size={15} /> Add field</button>
      </div>
    </div>
  );
}

/** Free notes. */
export function TextBlock({ block: b, menu, icon: Icon, editBlock }) {
  return (
    <div className="section block">
      <div className="section-head"><h2><Icon size={16} /> {b.title}</h2>{menu}</div>
      <textarea className="textarea notes-textarea" value={b.content || ''}
        onChange={(e) => editBlock(b.id, { content: e.target.value })} placeholder="Write here…" />
    </div>
  );
}

/** A to-do list (done, urgent). */
export function TodosBlock({ block: b, menu, icon: Icon, editBlock }) {
  const items = b.items || [];
  const setItems = (next) => editBlock(b.id, { items: next });
  return (
    <div className="section block">
      <div className="section-head">
        <h2><Icon size={16} /> {b.title} {items.length > 0 && <span className="count">{items.filter((t) => t.done).length}/{items.length}</span>}</h2>{menu}
      </div>
      <div className="milestones">
        {items.map((t) => (
          <div className={`milestone ${t.done ? 'done' : ''} ${t.urgent ? 'urgent' : ''}`} key={t.id}>
            <button className={`ms-check ${t.done ? 'on' : ''}`} onClick={() => setItems(items.map((x) => (x.id === t.id ? { ...x, done: !x.done } : x)))}>{t.done && <Check size={13} />}</button>
            <input className="ms-title input" value={t.text} placeholder="To-do…" onChange={(e) => setItems(items.map((x) => (x.id === t.id ? { ...x, text: e.target.value } : x)))} />
            <button className={`ms-urgent icon-btn ${t.urgent ? 'on' : ''}`} title={t.urgent ? 'Unmark urgent' : 'Mark urgent'} onClick={() => setItems(items.map((x) => (x.id === t.id ? { ...x, urgent: !x.urgent } : x)))}><AlertTriangle size={13} /></button>
            <button className="ms-del icon-btn" onClick={() => setItems(items.filter((x) => x.id !== t.id))}><X size={14} /></button>
          </div>
        ))}
        <button className="btn btn-ghost btn-sm ms-add" onClick={() => setItems([...items, { id: rid(), text: '', done: false }])}><Plus size={15} /> Add to-do</button>
      </div>
    </div>
  );
}

/** Links with a label. */
export function LinksBlock({ block: b, menu, icon: Icon, editBlock }) {
  const items = b.items || [];
  const setItems = (next) => editBlock(b.id, { items: next });
  return (
    <div className="section block">
      <div className="section-head">
        <h2><Icon size={16} /> {b.title} {items.length > 0 && <span className="count">{items.length}</span>}</h2>
        <div className="moodboard-actions">
          <button className="btn btn-sm" onClick={() => setItems([...items, { id: rid(), url: '', title: '' }])}><Plus size={14} /> Add link</button>{menu}
        </div>
      </div>
      {items.length ? (
        <div className="linklist">
          {items.map((it) => (
            <div className="linkrow" key={it.id}>
              <Link2 size={17} className="linkrow-icon" />
              <input className="input linkrow-title" value={it.title} placeholder={hostOf(it.url) || 'Label…'}
                onChange={(e) => setItems(items.map((x) => (x.id === it.id ? { ...x, title: e.target.value } : x)))} />
              <input className="input linkrow-url" value={it.url} placeholder="https://…"
                onChange={(e) => setItems(items.map((x) => (x.id === it.id ? { ...x, url: e.target.value } : x)))} />
              <a className={`icon-btn linkrow-open ${it.url ? '' : 'is-disabled'}`} href={it.url ? normalizeUrl(it.url) : undefined}
                target="_blank" rel="noopener noreferrer" title="Open link"><ExternalLink size={15} /></a>
              <button className="icon-btn linkrow-del" onClick={() => setItems(items.filter((x) => x.id !== it.id))} title="Remove"><X size={15} /></button>
            </div>
          ))}
        </div>
      ) : (
        <div className="dropzone" onClick={() => setItems([{ id: rid(), url: '', title: '' }])}>
          <Link2 size={20} /><div>Add a link — inspiration, references, client sites…</div>
        </div>
      )}
    </div>
  );
}

/** A section heading with a line of description. */
export function HeadingBlock({ block: b, menu, editBlock }) {
  return (
    <div className="section block block-structural">
      <div className="heading-row">
        <div className="heading-fields">
          <input className="heading-input" value={b.title} placeholder="Section heading"
            onChange={(e) => editBlock(b.id, { title: e.target.value })} />
          <input className="heading-sub" value={b.content || ''} placeholder="Add a description…"
            onChange={(e) => editBlock(b.id, { content: e.target.value })} />
        </div>
        {menu}
      </div>
    </div>
  );
}

/** A line between sections. */
export function DividerBlock({ menu }) {
  return (
    <div className="section block block-structural block-divider">
      <div className="divider-row"><hr className="block-hr" />{menu}</div>
    </div>
  );
}

/** A table; number columns get a sum. */
export function TableBlock({ block: b, menu, icon: Icon, editBlock }) {
  const columns = b.columns || [];
  // Columns and rows are always saved together so no edit is lost.
  const save = (cols, rws, immediate = false) => editBlock(b.id, { columns: cols, rows: rws }, immediate);
  const rows = b.rows || [];
  const colSums = columns.map((c) => {
    const vals = rows.map((r) => String(r.cells?.[c.id] ?? '').trim()).filter((v) => v !== '');
    if (!vals.length || !vals.every((v) => isFinite(toNum(v)))) return null;
    return vals.reduce((s, v) => s + toNum(v), 0);
  });
  const showSums = colSums.some((s) => s !== null);
  return (
    <div className="section block">
      <div className="section-head">
        <h2><Icon size={16} /> {b.title}</h2>
        <div className="moodboard-actions">
          <button className="btn btn-sm" onClick={() => save(columns, [...rows, { id: rid(), cells: {} }], true)}><Plus size={14} /> Add row</button>
          {menu}
        </div>
      </div>
      <div className="table-scroll">
        <table className="plan-table">
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.id}>
                  <div className="th-inner">
                    <input className="cell-input th-input" value={c.name} placeholder=""
                      onChange={(e) => save(columns.map((x) => (x.id === c.id ? { ...x, name: e.target.value } : x)), rows)} />
                    <button className="icon-btn th-del" title="Remove column"
                      onClick={() => save(columns.filter((x) => x.id !== c.id), rows.map((r) => { const cells = { ...r.cells }; delete cells[c.id]; return { ...r, cells }; }), true)}><X size={13} /></button>
                  </div>
                </th>
              ))}
              <th className="th-add"><button className="icon-btn" title="Add column" onClick={() => save([...columns, { id: rid(), name: '' }], rows, true)}><Plus size={15} /></button></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                {columns.map((c) => (
                  <td key={c.id}>
                    <input className="cell-input" value={r.cells?.[c.id] || ''}
                      onChange={(e) => save(columns, rows.map((x) => (x.id === r.id ? { ...x, cells: { ...x.cells, [c.id]: e.target.value } } : x)))} />
                  </td>
                ))}
                <td className="row-del-cell"><button className="icon-btn row-del" title="Remove row" onClick={() => save(columns, rows.filter((x) => x.id !== r.id), true)}><X size={14} /></button></td>
              </tr>
            ))}
          </tbody>
          {showSums && (
            <tfoot>
              <tr>
                {columns.map((c, ci) => <td key={c.id} className="sum-cell">{colSums[ci] === null ? '' : `Σ ${fmtSum(colSums[ci])}`}</td>)}
                <td className="row-del-cell" />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      {!rows.length && <div className="table-empty">No rows yet — “Add row” to start.</div>}
    </div>
  );
}
