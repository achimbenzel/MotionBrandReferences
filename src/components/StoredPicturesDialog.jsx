import { useEffect, useRef, useState } from 'react';
import { X, ImageDown, CheckCircle2, Square } from 'lucide-react';
import { api } from '../lib/api.js';
import { optimizeImage, imagePrefs, FORMATS, EDGES } from '../lib/imageOptimize.js';
import { useToast } from './Toast.jsx';
import Range from './Range.jsx';
import { fmtBytes, edgeLabel } from './ImageUploadPrompt.jsx';

const MINS = [250, 500, 1000, 2000];
const newBatch = () => `pics${Math.random().toString(36).slice(2, 10)}`;

/**
 * The pictures already in the library, made smaller afterwards: the big ones
 * (by area), made smaller here in the browser like new uploads (format, size,
 * quality), each swapped in on the server. The originals go to the Trash as
 * one item — restore it to undo, empty the Trash to free the space.
 */
export default function StoredPicturesDialog({ onClose }) {
  const toast = useToast();
  const [min, setMin] = useState(500);
  const [scan, setScan] = useState(null); // { count, bytes, items, areas }
  const [off, setOff] = useState(() => new Set()); // areas left out
  const [prefs, setPrefs] = useState(null);
  const [run, setRun] = useState(null); // { done, total, saved, kept, failed, current, batch, finished }
  const stop = useRef(false);

  useEffect(() => { imagePrefs().then((p) => setPrefs({ format: p.format === 'keep' ? 'webp' : p.format, maxEdge: p.maxEdge || 2560, quality: p.quality })); }, []);
  useEffect(() => {
    let alive = true;
    setScan(null);
    api.scanPictures(min).then((d) => { if (alive) setScan(d); }).catch((e) => { if (alive) { toast(e.message, 'error'); setScan({ count: 0, bytes: 0, items: [], areas: [] }); } });
    return () => { alive = false; };
  }, [min, toast]);
  const busy = run && !run.finished;
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, busy]);

  const picked = (scan?.items || []).filter((x) => !off.has(x.area));
  const pickedBytes = picked.reduce((n, x) => n + x.size, 0);

  const start = async () => {
    stop.current = false;
    const batch = newBatch();
    const state = { done: 0, total: picked.length, saved: 0, kept: 0, failed: 0, current: '', batch, finished: false };
    setRun({ ...state });
    for (const it of picked) {
      if (stop.current) break;
      state.current = it.owner;
      setRun({ ...state });
      try {
        const res = await fetch(`/data/${it.rel}`);
        if (!res.ok) throw new Error('not found');
        const blob = await res.blob();
        const name = it.rel.split('/').pop();
        const file = new File([blob], name, { type: blob.type || 'image/png' });
        const r = await optimizeImage(file, prefs);
        if (!r.changed || r.after > r.before * 0.92) { state.kept += 1; } // not worth it: stays as it is
        else {
          const out = await api.replacePicture(it.rel, batch, r.file);
          state.saved += out.before - out.after;
        }
      } catch { state.failed += 1; }
      state.done += 1;
      setRun({ ...state });
    }
    state.finished = true; state.current = '';
    setRun({ ...state });
  };
  const undo = async () => {
    try { await api.restoreTrash(run.batch); toast('The originals are back'); onClose(); }
    catch (e) { toast(`Undo failed: ${e.message}`, 'error'); }
  };
  const toggle = (k) => setOff((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });

  return (
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div className="modal img-opt stored-pics" role="dialog" aria-modal="true" aria-label="Make stored pictures smaller">
        <div className="modal-head">
          <h2><ImageDown size={18} /> Make stored pictures smaller</h2>
          <button type="button" className="icon-btn" onClick={onClose} disabled={busy} aria-label="Close"><X size={18} /></button>
        </div>
        <div className="modal-body">
          {!run ? (
            <>
              <p className="hint">Pictures you added before — made smaller like new uploads, here in your browser. Logos and mockup screens stay exact. The originals go to the Trash as one item: restore it to undo, empty it to free the space.</p>
              <div className="img-opt-row">
                <span className="img-opt-label">Pictures over</span>
                <div className="segmented segmented-sm" role="group" aria-label="Pictures over">
                  {MINS.map((m) => <button key={m} type="button" className={min === m ? 'on' : ''} onClick={() => setMin(m)}>{m >= 1000 ? `${m / 1000} MB` : `${m} KB`}</button>)}
                </div>
              </div>
              {!scan ? <div className="spinner" /> : !scan.count ? (
                <div className="stored-pics-none"><CheckCircle2 size={16} /> No stored picture is that big.</div>
              ) : (
                <>
                  <div className="img-opt-total"><span>{scan.count} picture{scan.count === 1 ? '' : 's'}</span><span className="img-opt-arrow">·</span><b>{fmtBytes(scan.bytes)}</b></div>
                  <div className="stored-pics-areas">
                    {scan.areas.map((a) => {
                      const list = scan.items.filter((x) => x.area === a.key);
                      if (!list.length) return null;
                      return (
                        <label key={a.key} className={`img-opt-item ${off.has(a.key) ? 'off' : ''}`}>
                          <input type="checkbox" checked={!off.has(a.key)} onChange={() => toggle(a.key)} />
                          <span className="img-opt-item-main"><b>{a.label}</b><small>{list.length} · {fmtBytes(list.reduce((n, x) => n + x.size, 0))} · e.g. {list[0].owner}</small></span>
                        </label>
                      );
                    })}
                  </div>
                  {prefs && (
                    <div className="img-opt-controls">
                      <div className="img-opt-row">
                        <span className="img-opt-label">Format</span>
                        <div className="segmented segmented-sm" role="group" aria-label="Format">
                          {FORMATS.map((f) => <button key={f.key} type="button" className={prefs.format === f.key ? 'on' : ''} onClick={() => setPrefs({ ...prefs, format: f.key })} title={f.hint}>{f.label}</button>)}
                        </div>
                      </div>
                      <div className="img-opt-row">
                        <span className="img-opt-label">Size <em>long edge</em></span>
                        <div className="segmented segmented-sm img-opt-edges" role="group" aria-label="Size">
                          {EDGES.map((e) => <button key={e} type="button" className={prefs.maxEdge === e ? 'on' : ''} onClick={() => setPrefs({ ...prefs, maxEdge: e })}>{edgeLabel(e)}</button>)}
                        </div>
                      </div>
                      <div className="img-opt-row">
                        <span className="img-opt-label">Quality</span>
                        <Range min={50} max={100} step={1} value={prefs.quality} onChange={(e) => setPrefs({ ...prefs, quality: Number(e.target.value) })} aria-label="Quality" />
                        <span className="img-opt-q">{prefs.quality}</span>
                      </div>
                    </div>
                  )}
                </>
              )}
            </>
          ) : (
            <div className="stored-pics-run">
              <div className="stored-pics-bar"><i style={{ width: `${run.total ? (run.done / run.total) * 100 : 100}%` }} /></div>
              <div className="img-opt-total">
                <span>{run.done} / {run.total}</span><span className="img-opt-arrow">·</span><b>{fmtBytes(run.saved)} saved</b>
              </div>
              {!run.finished && <p className="hint">Working on {run.current || '…'} — keep this window open.</p>}
              {run.finished && (
                <div className="stored-pics-done">
                  <p><CheckCircle2 size={16} /> {run.saved > 0 ? <>Saved <b>{fmtBytes(run.saved)}</b> on {run.done - run.kept - run.failed} picture{run.done - run.kept - run.failed === 1 ? '' : 's'}.</> : 'Nothing got smaller enough to swap.'}</p>
                  {run.kept > 0 && <p className="hint">{run.kept} already small enough — kept as they are.</p>}
                  {run.failed > 0 && <p className="hint">{run.failed} couldn’t be worked out here — kept as they are.</p>}
                  {run.saved > 0 && <p className="hint">The originals are in the <b>Trash</b> as one item: restore it to undo, empty the Trash to free the space.</p>}
                </div>
              )}
            </div>
          )}
        </div>
        <div className="modal-foot">
          {!run && <><button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button type="button" className="btn btn-primary" onClick={start} disabled={!picked.length || !prefs}><ImageDown size={15} /> Make {picked.length || ''} smaller{picked.length ? ` (${fmtBytes(pickedBytes)})` : ''}</button></>}
          {busy && <button type="button" className="btn" onClick={() => { stop.current = true; }}><Square size={13} fill="currentColor" /> Stop after this one</button>}
          {run?.finished && <>{run.saved > 0 && <button type="button" className="btn btn-ghost" onClick={undo}>Undo — put the originals back</button>}
            <button type="button" className="btn btn-primary" onClick={onClose}>Done</button></>}
        </div>
      </div>
    </div>
  );
}
