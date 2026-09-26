import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, UploadCloud, Library, X, Download, FolderInput, MoreHorizontal, Copy, Trash2, Crop, ImageIcon } from 'lucide-react';
import { domToBlob } from 'modern-screenshot';
import { api, mockupFileUrl } from '../lib/api.js';
import { useSaver } from '../lib/autosave.js';
import { useToast } from '../components/Toast.jsx';
import Menu from '../components/Menu.jsx';
import SaveToPlanModal from '../components/SaveToPlanModal.jsx';
import ExportDialog from '../components/ExportDialog.jsx';
import MediaPicker from '../components/mockups/MediaPicker.jsx';
import ScreenFitter from '../components/mockups/ScreenFitter.jsx';
import Mockup2D from '../components/mockups2d/Mockup2D.jsx';
import { TYPES_2D, fieldValue, defaults2D } from '../lib/mockup2d.js';
import { FRAMES } from '../lib/mockup3d/catalog.js';

const MOCKUP_BOARD = /mockup/i;
const DESIGN_LONG = 1600; // the picture's long side in CSS px (fixed formats)
const FORMATS = ['auto', ...Object.keys(FRAMES)];
const safeName = (s) => String(s || 'mockup').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').toLowerCase() || 'mockup';
// The picture's own size — the preview is zoomed out, and the screenshot would otherwise use the zoomed size.
const ownSize = (el) => ({ width: el.offsetWidth, height: el.offsetHeight });
const bgCss = (bg) => (bg.mode === 'color' ? bg.color : bg.mode === 'gradient' || bg.mode === 'environment' ? `linear-gradient(180deg, ${bg.color2}, ${bg.color})` : 'transparent');

/**
 * The 2D mockup editor: a browser window or an Instagram / X post, story or
 * profile, with your texts and pictures — on a background, in a format, as a
 * PNG / JPG / WebP or into a plan. Click a picture in the preview to pick it.
 */
export default function Mockup2DEditor({ initial }) {
  const id = initial.id;
  const navigate = useNavigate();
  const toast = useToast();
  const saver = useSaver(500);
  const [m, setM] = useState(() => ({ ...initial, d2: initial.d2 || defaults2D('browser') }));
  const [active, setActive] = useState(null); // the picture slot being edited
  const [natural, setNatural] = useState({ w: 600, h: 600 });
  const [fit, setFit] = useState(0.5);          // preview zoom
  const [picking, setPicking] = useState(false);
  const [fitting, setFitting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [planFile, setPlanFile] = useState(null);
  const [quickPlan, setQuickPlan] = useState(false);
  const [override, setOverride] = useState(null); // background while exporting
  const [loading, setLoading] = useState('');
  const [brand, setBrand] = useState([]);
  const mRef = useRef(m);
  const pending = useRef({});
  const itemRef = useRef(null);
  const canvasRef = useRef(null);
  const stageRef = useRef(null);
  const fileRef = useRef(null);
  mRef.current = m;
  const d = m.d2;
  const type = TYPES_2D[d.type] || TYPES_2D.browser;

  useEffect(() => {
    api.list('color').then((ps) => {
      const seen = new Set();
      setBrand(ps.flatMap((p) => p.colors || []).map((c) => c.hex).filter((h) => h && !seen.has(h) && seen.add(h)).slice(0, 14));
    }).catch(() => {});
  }, []);

  // ---- Saving + the thumbnail ------------------------------------------------------------
  const thumbTimer = useRef(0);
  const makeThumb = useCallback(async () => {
    clearTimeout(thumbTimer.current); thumbTimer.current = 0;
    const el = canvasRef.current;
    if (!el) return;
    try {
      const blob = await domToBlob(el, { ...ownSize(el), scale: 640 / el.offsetWidth, type: 'image/webp', quality: 0.85 });
      if (blob) await api.setMockupThumb(id, blob);
    } catch { /* the list shows an icon instead */ }
  }, [id]);
  const refreshThumb = useCallback(() => {
    clearTimeout(thumbTimer.current);
    thumbTimer.current = setTimeout(makeThumb, 1500);
  }, [makeThumb]);
  useEffect(() => () => { if (thumbTimer.current) makeThumb(); }, [makeThumb]);
  const patch = useCallback((p) => {
    mRef.current = { ...mRef.current, ...p };
    setM((prev) => ({ ...prev, ...p }));
    pending.current = { ...pending.current, ...p };
    saver.schedule('mockup2d', () => {
      const body = pending.current; pending.current = {};
      return Object.keys(body).length ? api.updateMockup(id, body).catch((e) => toast(`Could not save: ${e.message}`, 'error')) : null;
    });
    refreshThumb();
  }, [id, saver, toast, refreshThumb]);
  const patchD = (p) => patch({ d2: { ...mRef.current.d2, ...p } });
  const setField = (f, value) => {
    const cur = mRef.current.d2;
    if (f.type === 'number') patchD({ nums: { ...cur.nums, [f.key]: value } });
    else if (f.type === 'flag') patchD({ flags: { ...cur.flags, [f.key]: value } });
    else patchD({ text: { ...cur.text, [f.key]: value } });
  };
  const takeSlots = (server) => {
    const next = { ...mRef.current, d2: { ...mRef.current.d2, slots: server.d2.slots } };
    mRef.current = next;
    setM(next);
    refreshThumb();
  };

  // ---- Layout: the mockup's own size, the picture around it, the preview zoom -----------
  useLayoutEffect(() => {
    const el = itemRef.current;
    if (!el) return undefined;
    const measure = () => setNatural({ w: el.offsetWidth || 1, h: el.offsetHeight || 1 });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [d.type]);
  const auto = m.frame === 'auto' || !FRAMES[m.frame];
  const short = Math.min(natural.w, natural.h);
  let W; let H; let k;
  if (auto) {
    const pad = d.padding * short * 2;
    W = Math.round(natural.w * d.scale + pad * 2); H = Math.round(natural.h * d.scale + pad * 2); k = d.scale;
  } else {
    const a = FRAMES[m.frame];
    W = a >= 1 ? DESIGN_LONG : Math.round(DESIGN_LONG * a); H = a >= 1 ? Math.round(DESIGN_LONG / a) : DESIGN_LONG;
    const pad = d.padding * Math.min(W, H);
    k = Math.min((W - pad * 2) / natural.w, (H - pad * 2) / natural.h) * d.scale;
  }
  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return undefined;
    const measure = () => setFit(Math.min((el.clientWidth - 40) / W, (el.clientHeight - 40) / H, 1.5));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [W, H]);

  // ---- Pictures ---------------------------------------------------------------------------
  const slots = type.slots.filter((s) => !s.when || fieldValue(d, type.fields.find((f) => f.key === s.when) || {}));
  const pick = (key) => { setActive(key); };
  const upload = async (file, key = active) => {
    if (!file || !key) return;
    setLoading('Uploading…');
    try { takeSlots(await api.setMockupSlot(id, key, file)); } catch (e) { toast(`Upload failed: ${e.message}`, 'error'); } finally { setLoading(''); }
  };
  const fromApp = async (source) => {
    setPicking(false);
    if (!active) return;
    setLoading('Loading…');
    try { takeSlots(await api.importMockupSlot(id, active, source)); } catch (e) { toast(e.message, 'error'); } finally { setLoading(''); }
  };
  const clearSlot = async (key) => { try { takeSlots(await api.clearMockupSlot(id, key)); } catch (e) { toast(e.message, 'error'); } };
  const slotUrl = (slot) => mockupFileUrl(m, slot.file);
  const activeDef = slots.find((s) => s.key === active);
  const activeSlot = active ? d.slots[active] : null;
  const usedMedia = [0, 1, 2, 3].filter((i) => d.slots[`media-${i}`]).length;
  const ratioOf = (s) => s.ratio(d, usedMedia);

  // ---- Type / theme -------------------------------------------------------------------------
  const setType = (t) => {
    if (t === d.type) return;
    const def = defaults2D(t);
    const cur = mRef.current.d2;
    const old = defaults2D(cur.type);
    // What you typed goes along to the new type; what was still the old type's default takes the new one's.
    const carry = (map, was, now) => {
      const out = { ...map, ...now };
      for (const k of Object.keys(now)) if (map[k] !== undefined && map[k] !== was[k]) out[k] = map[k];
      return out;
    };
    // Each type brings its usual format (a post square-ish, a story tall, a profile fitted).
    patch({
      frame: TYPES_2D[t].frame,
      ...(mRef.current.name === TYPES_2D[cur.type]?.label ? { name: TYPES_2D[t].label } : {}),
      d2: {
        ...cur, type: t, theme: TYPES_2D[t].themes.includes(cur.theme) ? cur.theme : TYPES_2D[t].themes[0],
        text: carry(cur.text, old.text, def.text), nums: carry(cur.nums, old.nums, def.nums), flags: carry(cur.flags, old.flags, def.flags),
      },
    });
    setActive(null);
  };

  // ---- Export -------------------------------------------------------------------------------
  const render = async ({ width, mime, quality, background, color }) => {
    const el = canvasRef.current;
    if (!el) throw new Error('Nothing to export');
    const bg = background === 'transparent' ? 'transparent' : background === 'white' ? '#FFFFFF' : background === 'black' ? '#000000' : background === 'color' ? color : null;
    if (bg) { setOverride(bg); await new Promise((r) => { requestAnimationFrame(() => requestAnimationFrame(r)); }); }
    try {
      return await domToBlob(el, { ...ownSize(el), scale: width / el.offsetWidth, type: mime, quality, backgroundColor: null });
    } finally { if (bg) setOverride(null); }
  };
  const targets = () => {
    const sizes = auto
      ? [1, 2, 3, 4].map((x) => ({ label: `${x}×`, w: Math.round(W * x), h: Math.round(H * x) }))
      : [1080, 1920, 2560, 3840].map((long) => { const a = W / H; return a >= 1 ? { label: `${long}`, w: long, h: Math.round(long / a) } : { label: `${long}`, w: Math.round(long * a), h: long }; });
    return [{
      key: 'image', label: 'Image', kind: 'image', aspect: W / H, sizes, defaultSize: 1,
      backgrounds: [{ key: 'scene', label: 'As set' }, { key: 'transparent', label: 'Transparent' }, { key: 'white', label: 'White', swatch: '#fff' }, { key: 'black', label: 'Black', swatch: '#000' }],
      allowColor: true, formats: ['png', 'jpg', 'webp'], maxSize: 8192,
    }];
  };
  const quickPng = async () => new File([await render({ width: W * 2, mime: 'image/png' })], `${safeName(m.name)}.png`, { type: 'image/png' });

  const duplicate = async () => {
    try { await saver.flush(); const copy = await api.duplicateMockup(id); navigate(`/mockups/${copy.id}`); } catch (e) { toast(e.message, 'error'); }
  };
  const remove = async () => {
    try {
      await saver.flush();
      const res = await api.removeMockup(id);
      navigate('/mockups');
      toast(`“${m.name}” moved to Trash`, 'ok', { label: 'Undo', onClick: async () => { try { await api.restoreTrash(res.trashId); navigate(`/mockups/${id}`); } catch (e) { toast(e.message, 'error'); } } });
    } catch (e) { toast(e.message, 'error'); }
  };

  const bg = m.background;
  const setBg = (p) => patch({ background: { ...bg, ...p } });
  const visibleFields = type.fields.filter((f) => !f.when || fieldValue(d, type.fields.find((x) => x.key === f.when) || {}));

  return (
    <div className="mke m2e">
      <div className="mke-top">
        <button className="detail-back" style={{ margin: 0 }} onClick={async () => { await saver.flush(); if (thumbTimer.current) await makeThumb(); navigate('/mockups'); }}><ArrowLeft size={16} /> Mockups</button>
        <input className="mke-name" value={m.name} onChange={(e) => patch({ name: e.target.value })} aria-label="Mockup name" placeholder="Untitled mockup" />
        <div className="mke-actions">
          <button className="btn btn-sm" onClick={() => setQuickPlan(true)}><FolderInput size={14} /> <span className="mke-long">Save to plan</span><span className="mke-short">Plan</span></button>
          <button className="btn btn-sm btn-primary" onClick={() => setExporting(true)}><Download size={14} /> Export</button>
          <Menu align="right" title="Mockup" trigger={<button className="btn btn-sm" aria-label="Mockup options"><MoreHorizontal size={15} /></button>}
            items={[
              { label: 'Duplicate mockup', icon: <Copy size={15} />, onClick: duplicate },
              { separator: true },
              { label: 'Delete mockup', icon: <Trash2 size={15} />, danger: true, onClick: remove },
            ]} />
        </div>
      </div>

      <div className="mke-body">
        <div className={`m2e-stage ${bg.mode === 'transparent' ? 'transparent' : ''}`} ref={stageRef} onClick={() => setActive(null)}>
          {loading && <div className="mke-loading">{loading}</div>}
          <div className="m2e-zoom" style={{ width: W * fit, height: H * fit }}>
            <div className="m2e-scale" style={{ transform: `scale(${fit})` }}>
            <div className="m2c" ref={canvasRef} style={{ width: W, height: H }}>
              <div className="m2c-bg" style={{ background: override || bgCss(bg) }} />
              <div className={`m2c-item ${d.shadow ? 'shadow' : ''}`} ref={itemRef} style={{ transform: `translate(-50%, -50%) scale(${k})` }}>
                <Mockup2D d={d} url={slotUrl} onPick={pick} active={active} />
              </div>
            </div>
            </div>
          </div>
          <div className="m2e-hint"><ImageIcon size={12} /> Click a picture to change it</div>
        </div>

        <aside className="mke-panel">
          <section>
            <h3>Mockup</h3>
            <div className="m2e-types">
              {Object.entries(TYPES_2D).map(([key, t]) => (
                <button key={key} type="button" className={d.type === key ? 'on' : ''} onClick={() => setType(key)}><t.icon size={16} /><span>{t.label}</span></button>
              ))}
            </div>
            {type.themes.length > 1 && (
              <div className="segmented mke-seg" role="group" aria-label="Appearance">
                {type.themes.map((th) => <button key={th} type="button" className={d.theme === th ? 'on' : ''} onClick={() => patchD({ theme: th })}>{th[0].toUpperCase() + th.slice(1)}</button>)}
              </div>
            )}
          </section>

          <section>
            <h3>Pictures</h3>
            <div className="m2e-slots">
              {slots.map((s) => {
                const slot = d.slots[s.key];
                return (
                  <div key={s.key} className={`m2e-slot ${active === s.key ? 'on' : ''}`} onClick={() => setActive(s.key)}>
                    <span className={`m2e-thumb ${s.round ? 'round' : ''}`}>{slot ? (slot.kind === 'video' ? <video src={slotUrl(slot)} muted /> : <img src={slotUrl(slot)} alt="" />) : <ImageIcon size={14} />}</span>
                    <span className="m2e-slot-name">{s.label}</span>
                    {slot && <button type="button" className="icon-btn" onClick={(e) => { e.stopPropagation(); clearSlot(s.key); }} aria-label={`Remove ${s.label}`}><X size={13} /></button>}
                  </div>
                );
              })}
            </div>
            {activeDef ? (
              <div className="m2e-slot-actions">
                <div className="hint">{activeDef.label}</div>
                <div className="mke-row">
                  <button className="btn btn-sm" onClick={() => fileRef.current?.click()}><UploadCloud size={14} /> Upload</button>
                  <button className="btn btn-sm" onClick={() => setPicking(true)}><Library size={14} /> From the app</button>
                </div>
                {activeSlot && <button type="button" className="btn btn-sm mke-fit-btn" onClick={() => setFitting(true)}><Crop size={14} /> Position &amp; size…</button>}
              </div>
            ) : <div className="hint">Pick a picture here or in the preview.</div>}
          </section>

          <section>
            <h3>Content</h3>
            <div className="m2e-fields">
              {visibleFields.map((f) => {
                const val = fieldValue(d, f);
                if (f.type === 'flag') return <label key={f.key} className="mke-check"><input type="checkbox" checked={!!val} onChange={(e) => setField(f, e.target.checked)} /> {f.label}</label>;
                if (f.type === 'select') {
                  return (
                    <label key={f.key} className="mke-field">{f.label}
                      <select className="input" value={val} onChange={(e) => setField(f, e.target.value)}>{f.choices.map(([k2, l]) => <option key={k2} value={k2}>{l}</option>)}</select>
                    </label>
                  );
                }
                if (f.type === 'textarea') return <label key={f.key} className="mke-field">{f.label}<textarea className="input" rows={3} value={val} onChange={(e) => setField(f, e.target.value)} /></label>;
                if (f.type === 'number') {
                  return <label key={f.key} className="mke-field m2e-num">{f.label}<input className="input" type="number" min={f.min ?? 0} max={f.max} value={val} onChange={(e) => setField(f, Number(e.target.value) || 0)} /></label>;
                }
                return <label key={f.key} className="mke-field">{f.label}<input className="input" value={val} onChange={(e) => setField(f, e.target.value)} /></label>;
              })}
            </div>
          </section>

          <section>
            <h3>Look</h3>
            <div className="segmented mke-seg mke-frames" role="group" aria-label="Format">
              {FORMATS.map((f) => <button key={f} type="button" className={m.frame === f ? 'on' : ''} onClick={() => patch({ frame: f })}>{f === 'auto' ? 'Fit' : f}</button>)}
            </div>
            <div className="segmented mke-seg" role="group" aria-label="Background">
              {[['transparent', 'None'], ['color', 'Colour'], ['gradient', 'Gradient']].map(([key, label]) => (
                <button key={key} type="button" className={bg.mode === key ? 'on' : ''} onClick={() => setBg({ mode: key })}>{label}</button>
              ))}
            </div>
            {bg.mode !== 'transparent' && (
              <div className="mke-colors">
                <label title="Colour"><input type="color" value={bg.color.toLowerCase()} onChange={(e) => setBg({ color: e.target.value.toUpperCase() })} /></label>
                {bg.mode === 'gradient' && <label title="Top colour"><input type="color" value={bg.color2.toLowerCase()} onChange={(e) => setBg({ color2: e.target.value.toUpperCase() })} /></label>}
                {brand.map((hex) => <button key={hex} type="button" className="mke-swatch" style={{ background: hex }} title={hex} onClick={() => setBg({ color: hex.toUpperCase() })} />)}
              </div>
            )}
            <label className="mke-range">Space <input type="range" min="0" max="0.3" step="0.01" value={d.padding} onChange={(e) => patchD({ padding: Number(e.target.value) })} /> <span>{Math.round(d.padding * 100)}%</span></label>
            <label className="mke-range">Size <input type="range" min="0.4" max="1.4" step="0.01" value={d.scale} onChange={(e) => patchD({ scale: Number(e.target.value) })} /> <span>{Math.round(d.scale * 100)}%</span></label>
            <label className="mke-check"><input type="checkbox" checked={d.shadow} onChange={(e) => patchD({ shadow: e.target.checked })} /> Soft shadow</label>
            <div className="hint">{W} × {H} px at 1×</div>
          </section>
        </aside>
      </div>

      <input ref={fileRef} type="file" accept="image/*,video/*" className="visually-hidden-input" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; upload(f); }} />
      {picking && <MediaPicker onPick={fromApp} onClose={() => setPicking(false)} />}
      {fitting && activeDef && activeSlot && (
        <ScreenFitter
          info={{ aspect: ratioOf(activeDef), turn: 0, guide: activeDef.round ? { radius: [0.5, 0.5, 0.5, 0.5], cutouts: [], safe: null } : null }}
          src={slotUrl(activeSlot)} kind={activeSlot.kind} fit={activeSlot.fit} adjust={activeSlot.adjust}
          onChange={({ fit: f, adjust }) => patchD({ slots: { ...mRef.current.d2.slots, [active]: { ...mRef.current.d2.slots[active], fit: f, adjust } } })}
          onClose={() => setFitting(false)} />
      )}
      {exporting && (
        <ExportDialog title="Export mockup" storeKey="mk2Export" name={safeName(m.name)} targets={targets()}
          onExport={(t, o) => render({ width: o.width, mime: o.mime, quality: o.quality, background: o.background === 'scene' ? null : o.background, color: o.color })}
          onSaveToPlan={(file) => { setExporting(false); setPlanFile(file); }}
          onClose={() => setExporting(false)} />
      )}
      {(planFile || quickPlan) && (
        <SaveToPlanModal title="Save mockup to plan" boardName="Mockups" boardMatch={MOCKUP_BOARD} submitLabel="Save mockup"
          hint={planFile ? `Saved as ${planFile.name}.` : 'Saved as a PNG at 2× — for another size or format use Export → Save to plan.'}
          makeFile={async () => planFile || quickPng()}
          onClose={() => { setPlanFile(null); setQuickPlan(false); }}
          onSaved={(plan) => { setPlanFile(null); setQuickPlan(false); toast(`Mockup saved to “${plan.name}”`, 'ok', { label: 'Open plan', onClick: () => navigate(`/plan/${plan.id}`) }); }} />
      )}
    </div>
  );
}
