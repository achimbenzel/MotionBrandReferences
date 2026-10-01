import { useRef, useState } from 'react';
import { Paperclip, UploadCloud, FileText, Image as ImageIcon, FileCode2, Trash2, Plus, Check } from 'lucide-react';
import { api } from '../../lib/api.js';
import { fmtDay } from '../../lib/dates.js';
import { missingReceipts, needsReceipts } from '../../lib/expenses.js';
import { fmtBytes } from '../../lib/format.js';

const ACCEPT = 'application/pdf,.pdf,image/*,.heic,.heif,.xml,text/xml,application/xml';
const OK = /\.(pdf|png|jpe?g|webp|gif|heic|heif|avif|xml)$/i;
const ICON = { pdf: FileText, image: ImageIcon, xml: FileCode2, other: FileText };
const sizeOf = (n) => fmtBytes(Math.max(1024, n || 0));
const LONG = { day: 'numeric', month: 'short', year: 'numeric' };
const SHORT = { day: 'numeric', month: 'short' };
const SHOW_MISSING = 6;

/**
 * The receipts of an expense — the invoice or bill for each payment. Added by
 * picking or dropping files (on a phone: the camera too), each for a day: the
 * payment it belongs to, found by itself (a date in the file name, else the
 * latest payment without one) or picked from the ones still missing. Saved
 * right away — apart from the editor's Save. The year's receipts are listed;
 * those of other years on request.
 */
export default function Receipts({ expense, need, year, today, onChange, onReload, toast }) {
  const fileRef = useRef(null);
  const forDate = useRef(null); // the payment picked from "missing"
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [all, setAll] = useState(false);
  const receipts = expense.receipts || [];
  const needed = need ?? needsReceipts(expense); // as set in the editor, before it's saved
  const missing = missingReceipts({ ...expense, needsReceipt: needed }, year, today);
  const inYear = receipts.filter((r) => r.date.startsWith(`${year}-`));
  const shown = all ? receipts : inYear;
  const others = receipts.length - inYear.length;

  const pick = (date = null) => { forDate.current = date; fileRef.current?.click(); };
  const upload = async (files) => {
    const date = forDate.current;
    forDate.current = null;
    const list = [...(files || [])].filter((f) => OK.test(f.name));
    if (!list.length) { if (files?.length) toast('Pick a PDF, a picture or an e-invoice (XML).', 'error'); return; }
    setBusy(true);
    try {
      const { expense: x, receipts: added } = await api.addReceipts(expense.id, list, date);
      onChange(x);
      if (added.some((r) => !r.date.startsWith(`${year}-`))) setAll(true);
      toast(added.length === 1 ? `Receipt added for ${fmtDay(added[0].date, LONG)}` : `${added.length} receipts added`);
    } catch (e) { toast(`Upload failed: ${e.message}`, 'error'); } finally { setBusy(false); }
  };
  // Another day: saved when the field is left (typing a year passes through others).
  const setDate = async (r, date) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date === r.date) return;
    try { onChange((await api.updateReceipt(expense.id, r.id, { date })).expense); } catch (e) { toast(`Could not save: ${e.message}`, 'error'); }
  };
  const remove = async (r) => {
    try {
      const { expense: x, trashId } = await api.removeReceipt(expense.id, r.id);
      onChange(x);
      toast('Receipt moved to Trash', 'ok', { label: 'Undo', onClick: async () => { await api.restoreTrash(trashId); onReload(); } });
    } catch (e) { toast(e.message, 'error'); }
  };

  return (
    <section className={`ex-rc-box ${drag ? 'drag' : ''}`} aria-label="Receipts"
      onDragOver={(e) => { if ([...e.dataTransfer.types].includes('Files')) { e.preventDefault(); setDrag(true); } }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDrag(false); }}
      onDrop={(e) => { e.preventDefault(); setDrag(false); upload(e.dataTransfer.files); }}>
      <div className="ex-rc-head">
        <b><Paperclip size={14} /> Receipts <span className="count">{receipts.length || ''}</span></b>
        <em>{needed ? 'saved right away' : 'not needed — you can still keep some'}</em>
        <button type="button" className="btn btn-sm" onClick={() => pick()} disabled={busy}><UploadCloud size={14} /> {busy ? 'Uploading…' : 'Add'}</button>
      </div>
      <input ref={fileRef} type="file" accept={ACCEPT} multiple hidden onChange={(e) => { upload(e.target.files); e.target.value = ''; }} />
      {needed && missing.length > 0 && (
        <div className="ex-rc-missing">
          <span>Missing in {year}:</span>
          {missing.slice(-SHOW_MISSING).reverse().map((d) => (
            <button key={d} type="button" className="ex-rc-miss" onClick={() => pick(d)} disabled={busy} title={`Add the receipt for ${fmtDay(d, LONG)}`}>
              <Plus size={12} /> {fmtDay(d, SHORT)}
            </button>
          ))}
          {missing.length > SHOW_MISSING && <small>+ {missing.length - SHOW_MISSING} earlier</small>}
        </div>
      )}
      {needed && !missing.length && inYear.length > 0 && <p className="ex-rc-done"><Check size={13} /> Every payment in {year} so far has its receipt.</p>}
      {shown.map((r) => {
        const Icon = ICON[r.kind] || FileText;
        return (
          <div key={r.id} className="ex-rc">
            <a className={`ex-rc-file ${r.kind}`} href={api.expenseFileUrl(expense, r.file)} target="_blank" rel="noreferrer" title={`Open ${r.name}`}><Icon size={15} /></a>
            <a className="ex-rc-name" href={api.expenseFileUrl(expense, r.file)} target="_blank" rel="noreferrer" title={r.name}>{r.name}<small>{sizeOf(r.size)}</small></a>
            <input type="date" className="input ex-rc-date" key={`${r.id}:${r.date}`} defaultValue={r.date} aria-label={`Day of ${r.name}`}
              onBlur={(e) => setDate(r, e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); e.currentTarget.blur(); } }} />
            <button type="button" className="icon-btn" onClick={() => remove(r)} aria-label={`Delete ${r.name}`} title="Delete (to the Trash)"><Trash2 size={14} /></button>
          </div>
        );
      })}
      {!all && others > 0 && <button type="button" className="ex-rc-more" onClick={() => setAll(true)}>{others} more from other years</button>}
      {!receipts.length && (
        <button type="button" className="ex-rc-drop" onClick={() => pick()} disabled={busy}>
          <UploadCloud size={18} /><span>Drop invoices here or pick them — PDF, a photo or scan, an e-invoice (XML). Each finds its payment by itself.</span>
        </button>
      )}
    </section>
  );
}
