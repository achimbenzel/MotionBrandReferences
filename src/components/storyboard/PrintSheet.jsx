import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Printer } from 'lucide-react';
import { fmtClock, fmtDur } from '../../lib/timing.js';
import { ratioOf, timing, sectionLabel, shotStatus } from '../../lib/storyboard.js';

// Panels per page by frame shape: [columns, rows, side] for "large" and
// "compact". `side`: frame on the left, the texts next to it (one shot a row).
const layoutFor = (ratio, compact) => {
  if (ratio > 1.2) return compact ? [3, 2, false] : [1, 3, true];
  if (ratio >= 0.7) return compact ? [5, 1, false] : [4, 1, false];
  return compact ? [6, 1, false] : [4, 1, false];
};
const FIELDS = [
  { key: 'vo', label: 'Voice-over' },
  { key: 'onscreen', label: 'On-screen text' },
  { key: 'camera', label: 'Camera' },
  { key: 'sfx', label: 'Sound' },
  { key: 'notes', label: 'Notes' },
  { key: 'status', label: 'Status' },
];

function Pages({ plan, block, shots, fileUrl, perPage, cols, rows, side, show, firstOnly = false }) {
  const ratio = ratioOf(block.aspect);
  const { starts, total } = timing(shots);
  const pages = [];
  for (let i = 0; i < Math.max(1, shots.length); i += perPage) pages.push(shots.slice(i, i + perPage).map((s, k) => ({ s, i: i + k })));
  const date = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  return (firstOnly ? pages.slice(0, 1) : pages).map((list, p) => (
    <section className="sbp-page" key={p}>
      <header className="sbp-head">
        <span><b>{plan.name}</b>{block.title ? ` — ${block.title}` : ''}</span>
        <span>{[plan.client, date].filter(Boolean).join(' · ')}</span>
      </header>
      <div className={`sbp-grid ${side ? 'side' : ''}`} style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))` }}>
        {list.map(({ s, i }) => {
          const cam = [s.size, s.camera, s.transition && i < shots.length - 1 ? `→ ${s.transition}` : ''].filter(Boolean).join(' · ');
          return (
            <article className="sbp-shot" key={s.id}>
              <div className="sbp-frame" style={{ aspectRatio: String(ratio) }}>
                {s.image ? <img src={fileUrl(s.image)} alt="" /> : <span>{i + 1}</span>}
              </div>
              <div className="sbp-text">
              <div className="sbp-meta">
                <b>{i + 1}</b> · {fmtClock(starts[i])} · {fmtDur(Number(s.duration) || 0)}
                {s.section ? <> · <b>{sectionLabel(s.section)}</b></> : null}
                {show.status && s.status ? ` · ${shotStatus(s.status)?.label}` : ''}
              </div>
              {s.visual && <p className="sbp-visual">{s.visual}</p>}
              {show.vo && s.vo && <p><em>VO</em> {s.vo}</p>}
              {show.onscreen && s.onscreen && <p><em>On screen</em> {s.onscreen}</p>}
              {show.camera && cam && <p><em>Camera</em> {cam}</p>}
              {show.sfx && s.sfx && <p><em>Sound</em> {s.sfx}</p>}
              {show.notes && s.notes && <p><em>Notes</em> {s.notes}</p>}
              </div>
            </article>
          );
        })}
      </div>
      <footer className="sbp-foot">
        <span>{block.aspect} · {shots.length} shot{shots.length === 1 ? '' : 's'} · {fmtClock(total)}{block.target ? ` (target ${fmtClock(block.target)})` : ''}</span>
        <span>{p + 1} / {pages.length}</span>
      </footer>
    </section>
  ));
}

/**
 * Storyboard as a PDF for the client: A4 landscape, 3–6 panels per page with
 * the shot's timing, section and the texts you choose. Printed through the
 * browser ("Save as PDF"), so text stays sharp and selectable.
 */
export default function PrintSheet({ plan, block, fileUrl, onClose }) {
  const shots = block.shots || [];
  const ratio = ratioOf(block.aspect);
  const [compact, setCompact] = useState(() => { try { return localStorage.getItem('sbPrintCompact') === '1'; } catch { return false; } });
  const [show, setShow] = useState(() => {
    try { return { vo: true, onscreen: true, camera: true, sfx: false, notes: false, status: false, ...JSON.parse(localStorage.getItem('sbPrintFields') || '{}') }; }
    catch { return { vo: true, onscreen: true, camera: true, sfx: false, notes: false, status: false }; }
  });
  const [busy, setBusy] = useState(false);
  const rootRef = useRef(null);
  const previewRef = useRef(null);
  const [scale, setScale] = useState(0.5);
  const [cols, rows, side] = layoutFor(ratio, compact);
  const perPage = cols * rows;

  useEffect(() => {
    try { localStorage.setItem('sbPrintCompact', compact ? '1' : '0'); localStorage.setItem('sbPrintFields', JSON.stringify(show)); } catch { /* ignore */ }
  }, [compact, show]);
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, busy]);

  // The preview page (A4 landscape, 297 mm ≈ 1123 px) scaled to the dialog.
  useEffect(() => {
    const el = previewRef.current;
    if (!el) return undefined;
    const fit = () => setScale(Math.max(0.2, (el.clientWidth - 24) / 1123));
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    fit();
    return () => ro.disconnect();
  }, []);

  const print = async () => {
    setBusy(true);
    // Every frame loaded before the print dialog takes its snapshot.
    const imgs = [...(rootRef.current?.querySelectorAll('img') || [])];
    await Promise.all(imgs.map((img) => (img.complete ? null : new Promise((r) => { img.onload = r; img.onerror = r; }))));
    const style = document.createElement('style');
    style.textContent = '@page { size: A4 landscape; margin: 10mm; }';
    document.head.appendChild(style);
    document.documentElement.classList.add('sb-printing');
    document.body.classList.add('sb-printing');
    const done = () => { document.documentElement.classList.remove('sb-printing'); document.body.classList.remove('sb-printing'); style.remove(); window.removeEventListener('afterprint', done); setBusy(false); };
    window.addEventListener('afterprint', done);
    window.print();
    setTimeout(() => { if (document.body.classList.contains('sb-printing') && !matchMedia('print').matches) done(); }, 1500);
  };

  const pages = Math.max(1, Math.ceil(shots.length / perPage));
  return (
    <>
      <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
        <div className="modal print-modal" role="dialog" aria-modal="true" aria-label="Export PDF">
          <div className="modal-head">
            <h2>Export PDF</h2>
            <button className="icon-btn" onClick={onClose} disabled={busy} aria-label="Close"><X size={18} /></button>
          </div>
          <div className="modal-body">
            <div className="field">
              <label>Panels per page</label>
              <div className="segmented" role="group">
                <button type="button" className={!compact ? 'on' : ''} onClick={() => setCompact(false)}>{layoutFor(ratio, false).reduce((a, b) => a * b)} · large</button>
                <button type="button" className={compact ? 'on' : ''} onClick={() => setCompact(true)}>{layoutFor(ratio, true).reduce((a, b) => a * b)} · compact</button>
              </div>
            </div>
            <div className="field">
              <label>Show under each frame</label>
              <div className="print-fields">
                <span className="print-field fixed">What we see</span>
                {FIELDS.map((f) => (
                  <label key={f.key} className="print-field">
                    <input type="checkbox" checked={!!show[f.key]} onChange={(e) => setShow((v) => ({ ...v, [f.key]: e.target.checked }))} /> {f.label}
                  </label>
                ))}
              </div>
            </div>
            <div className="print-preview" aria-hidden="true" ref={previewRef} style={{ '--pp-scale': scale }}>
              <div className="print-preview-page">
                <Pages plan={plan} block={block} shots={shots} fileUrl={fileUrl} perPage={perPage} cols={cols} rows={rows} side={side} show={show} firstOnly />
              </div>
            </div>
            <p className="hint">A4 landscape · {pages} page{pages === 1 ? '' : 's'}. In the print dialog choose <b>Save as PDF</b> as the printer.</p>
          </div>
          <div className="modal-foot">
            <button className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
            <button className="btn btn-primary" onClick={print} disabled={busy || !shots.length}><Printer size={15} /> Print / Save as PDF</button>
          </div>
        </div>
      </div>
      {createPortal(
        <div className="sb-print-root" ref={rootRef}>
          <Pages plan={plan} block={block} shots={shots} fileUrl={fileUrl} perPage={perPage} cols={cols} rows={rows} side={side} show={show} />
        </div>,
        document.body,
      )}
    </>
  );
}
