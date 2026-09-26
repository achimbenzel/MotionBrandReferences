import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, UploadCloud, Library, X, Download, FolderInput, MoreHorizontal, Copy, Trash2, Play, Pause, Smartphone, Tablet,
  Laptop, AppWindow, Box, RotateCw, FlipHorizontal, Camera,
} from 'lucide-react';
import { api, mockupFileUrl, mockupModelUrl } from '../lib/api.js';
import { useSaver } from '../lib/autosave.js';
import { useToast } from '../components/Toast.jsx';
import Menu from '../components/Menu.jsx';
import SaveToPlanModal from '../components/SaveToPlanModal.jsx';
import MediaPicker from '../components/mockups/MediaPicker.jsx';
import { MockupStage, FRAMES, VIEW_LABELS, loadModel, guessScreen } from '../lib/mockup3d/stage.js';
import { DEVICES } from '../lib/mockup3d/catalog.js';

const DEVICE_ICON = { iphone: Smartphone, ipad: Tablet, macbook: Laptop, browser: AppWindow };
const SIZES = [{ key: 1, label: '1×', long: 1920 }, { key: 2, label: '2×', long: 3840 }, { key: 4, label: '4×', long: 7680 }];
const MOCKUP_BOARD = /mockup/i;
const exportSize = (frame, long) => {
  const a = FRAMES[frame] || 16 / 9;
  return a >= 1 ? [long, Math.round(long / a)] : [Math.round(long * a), long];
};
const safeName = (s) => String(s || 'mockup').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').toLowerCase() || 'mockup';

/**
 * The mockup editor: a 3D device (or an imported model) with a picture or
 * video on its screen — turn it with the mouse / a finger, pick a view,
 * finish, background and format, then download a PNG or save it into a plan.
 * Settings save as you go.
 */
export default function MockupEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const saver = useSaver(600);
  const [m, setM] = useState(null);
  const [models, setModels] = useState([]);
  const [error, setError] = useState(null);
  const [meshes, setMeshes] = useState([]);       // mesh names of the imported model
  const [loading, setLoading] = useState('');     // what the stage is loading
  const [picking, setPicking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [size, setSize] = useState(2);
  const [playing, setPlaying] = useState(true);
  const [brand, setBrand] = useState([]);
  const holder = useRef(null);
  const stageRef = useRef(null);
  const mRef = useRef(null);
  const pending = useRef({});
  const modelCache = useRef(new Map());
  const built = useRef(null);  // key of what's on stage (device + options)
  const framed = useRef(false);
  const fileRef = useRef(null);
  const modelRef = useRef(null);
  mRef.current = m;

  useEffect(() => {
    let on = true;
    Promise.all([api.getMockup(id), api.listMockups()]).then(([mock, list]) => {
      if (!on) return;
      setM(mock); setModels(list.models || []);
    }).catch((e) => { if (on) setError(e.message); });
    api.list('color').then((ps) => {
      const seen = new Set();
      setBrand(ps.flatMap((p) => p.colors || []).map((c) => c.hex).filter((h) => h && !seen.has(h) && seen.add(h)).slice(0, 14));
    }).catch(() => {});
    return () => { on = false; };
  }, [id]);

  // ---- Saving (merged patches) and the thumbnail for the list ------------------------
  // The thumbnail is rendered a moment after the last change (or when there
  // is none yet), or right away when leaving the editor with one still due —
  // never while the picture is still loading.
  const thumbTimer = useRef(0);
  const changed = useRef(false);
  const makeThumb = useCallback(async (st = stageRef.current) => {
    clearTimeout(thumbTimer.current); thumbTimer.current = 0;
    const cur = mRef.current;
    if (!st || !cur || st.loadingContent) return;
    changed.current = false;
    const [w, h] = exportSize(cur.frame, 640);
    const blob = await st.toBlob(w, h, 'image/webp', 0.85);
    if (blob) await api.setMockupThumb(cur.id, blob).catch(() => {});
  }, []);
  const refreshThumb = useCallback(() => {
    if (!changed.current && mRef.current?.thumb) return;
    clearTimeout(thumbTimer.current);
    thumbTimer.current = setTimeout(() => makeThumb(), 1800);
  }, [makeThumb]);
  const flushThumb = useCallback((st) => (thumbTimer.current ? makeThumb(st) : Promise.resolve()), [makeThumb]);
  const patch = useCallback((p, immediate = false) => {
    changed.current = true;
    setM((prev) => ({ ...prev, ...p }));
    pending.current = { ...pending.current, ...p };
    saver.schedule('mockup', () => {
      const body = pending.current; pending.current = {};
      if (!Object.keys(body).length) return null;
      return api.updateMockup(id, body).catch((e) => toast(`Could not save: ${e.message}`, 'error'));
    }, { immediate });
    refreshThumb();
  }, [id, saver, toast, refreshThumb]);

  // ---- The stage ------------------------------------------------------------------------
  const ready = !!m;
  useEffect(() => {
    if (!ready || !holder.current) return undefined;
    const st = new MockupStage(holder.current, {
      onCamera: (camera) => patch({ camera: { ...camera, preset: '' } }),
    });
    st.setFrame(mRef.current.frame);
    stageRef.current = st;
    return () => { flushThumb(st); st.dispose(); stageRef.current = null; built.current = null; framed.current = false; };
  }, [ready, patch, flushThumb]);

  const model = m?.device === 'custom' ? models.find((x) => x.id === m.modelId) || null : null;
  const deviceKey = m ? JSON.stringify(m.device === 'custom'
    ? ['custom', model?.id, model?.screenMesh, model?.screenTurn, model?.screenFlip]
    : [m.device, m.color, m.landscape, m.lying, m.lid, m.url]) : '';
  // Look from a preset (and remember it with the scene).
  const lookFrom = useCallback((name) => {
    const st = stageRef.current;
    if (!st) return;
    st.view(name);
    patch({ camera: { ...st.getCamera(), preset: name } });
  }, [patch]);

  // Build the device whenever its settings change; frame it on the first build,
  // for another device, or when it's turned / laid down.
  useEffect(() => {
    const st = stageRef.current;
    if (!st || !m || built.current?.key === deviceKey) return;
    const prev = built.current;
    const info = { key: deviceKey, type: m.device === 'custom' ? `custom:${model?.id}` : m.device, pose: `${m.landscape}:${m.lying}` };
    built.current = info;
    let alive = true;
    (async () => {
      try {
        if (m.device === 'custom') {
          if (!model) { st.setDevice({ device: 'iphone' }); return; }
          let loaded = modelCache.current.get(model.id);
          if (!loaded) {
            setLoading('Loading the 3D model…');
            loaded = await loadModel(mockupModelUrl(model), model.format);
            modelCache.current.set(model.id, loaded);
          }
          if (!alive) return;
          setMeshes(loaded.meshes);
          const screenMesh = model.screenMesh || guessScreen(loaded.meshes);
          if (!model.screenMesh && screenMesh) api.updateMockupModel(model.id, { screenMesh }).then((x) => setModels((ms) => ms.map((y) => (y.id === x.id ? x : y)))).catch(() => {});
          st.setModel(loaded.object, { screenMesh, turn: (model.screenTurn || 0) / 90, mirror: model.screenFlip, flipV: model.format !== 'usdz' });
        } else {
          st.setDevice({ device: m.device, color: m.color, landscape: m.landscape, lying: m.lying, lid: m.lid, url: m.url });
        }
        if (!framed.current) {
          framed.current = true;
          if (m.camera?.position) st.setCamera(m.camera);
          else lookFrom(m.camera?.preset || 'three-right');
        } else if (!prev || prev.type !== info.type || prev.pose !== info.pose) {
          lookFrom(m.camera?.preset || 'three-right');
        }
        refreshThumb();
      } catch (e) {
        toast(`Could not load the model: ${e.message}`, 'error');
      } finally { if (alive) setLoading(''); }
    })();
    return () => { alive = false; };
  }, [deviceKey, m, model, toast, refreshThumb, lookFrom]);

  // Content, fit, look, frame.
  const contentKey = m?.content ? `${m.content.file}` : '';
  useEffect(() => {
    const st = stageRef.current; const cur = mRef.current;
    if (!st || !cur) return;
    setLoading(cur.content ? 'Loading…' : '');
    st.setContent(cur.content ? { url: mockupFileUrl(cur, cur.content.file), kind: cur.content.kind } : null)
      .then(() => { setPlaying(true); refreshThumb(); })
      .catch((e) => toast(e.message, 'error'))
      .finally(() => setLoading(''));
  }, [contentKey, ready, toast, refreshThumb]);
  useEffect(() => { stageRef.current?.setFit(m?.fit); }, [m?.fit, ready]);
  const bgKey = m ? JSON.stringify(m.background) : '';
  useEffect(() => { if (m) stageRef.current?.setBackground(m.background); }, [bgKey, ready]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (m) stageRef.current?.setShadow(m.shadow); }, [m?.shadow, ready]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const st = stageRef.current; const cur = mRef.current;
    if (!st || !cur) return;
    st.setFrame(cur.frame);
    if (framed.current && cur.camera?.preset) lookFrom(cur.camera.preset);
  }, [m?.frame, ready]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Actions -------------------------------------------------------------------------
  const view = lookFrom;
  const setDevice = (device, modelId = null) => {
    if (device === m.device && modelId === (m.modelId || null)) return;
    patch({ device, modelId, color: '' }, true);
  };
  const upload = async (file) => {
    if (!file) return;
    changed.current = true;
    setLoading('Uploading…');
    try { setM(await api.setMockupContent(id, file)); } catch (e) { toast(`Upload failed: ${e.message}`, 'error'); setLoading(''); }
  };
  const fromApp = async (source) => {
    changed.current = true;
    setPicking(false);
    setLoading('Loading…');
    try { setM(await api.importMockupContent(id, source)); } catch (e) { toast(e.message, 'error'); setLoading(''); }
  };
  const clearContent = async () => { changed.current = true; try { setM(await api.clearMockupContent(id)); } catch (e) { toast(e.message, 'error'); } };
  const importModel = async (file) => {
    if (!file) return;
    setLoading('Importing the 3D model…');
    try {
      const mdl = await api.addMockupModel(file);
      setModels((ms) => [...ms, mdl]);
      patch({ device: 'custom', modelId: mdl.id }, true);
      toast(`“${mdl.name}” imported — pick its screen below if it doesn’t show your picture`);
    } catch (e) { toast(`Import failed: ${e.message}`, 'error'); setLoading(''); }
  };
  const patchModel = async (p) => {
    if (!model) return;
    changed.current = true;
    setModels((ms) => ms.map((x) => (x.id === model.id ? { ...x, ...p } : x)));
    try { await api.updateMockupModel(model.id, p); } catch (e) { toast(`Could not save: ${e.message}`, 'error'); }
  };
  const render = async (k) => {
    const [w, h] = exportSize(m.frame, SIZES.find((s) => s.key === k)?.long || 3840);
    return stageRef.current.toBlob(w, h);
  };
  const download = async () => {
    const blob = await render(size);
    if (!blob) { toast('Rendering failed', 'error'); return; }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${safeName(m.name)}.png`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  };
  const toggleVideo = () => {
    const v = stageRef.current?.video;
    if (!v) return;
    if (v.paused) { v.play().catch(() => {}); setPlaying(true); } else { v.pause(); setPlaying(false); stageRef.current.dirty = true; }
  };
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

  if (error) return <div className="detail"><button className="detail-back" onClick={() => navigate('/mockups')}><ArrowLeft size={16} /> Mockups</button><div className="center-msg">Couldn’t load: {error}</div></div>;
  if (!m) return <div className="spinner" />;

  const spec = DEVICES[m.device];
  const bg = m.background;
  const setBg = (p) => patch({ background: { ...bg, ...p } });

  return (
    <div className="mke">
      <div className="mke-top">
        <button className="detail-back" style={{ margin: 0 }} onClick={async () => { await Promise.all([saver.flush(), flushThumb()]); navigate('/mockups'); }}><ArrowLeft size={16} /> Mockups</button>
        <input className="mke-name" value={m.name} onChange={(e) => patch({ name: e.target.value })} aria-label="Mockup name" placeholder="Untitled mockup" />
        <div className="mke-actions">
          <button className="btn btn-sm" onClick={() => setSaving(true)}><FolderInput size={14} /> <span className="mke-long">Save to plan</span><span className="mke-short">Plan</span></button>
          <button className="btn btn-sm btn-primary" onClick={download}><Download size={14} /> PNG</button>
          <Menu align="right" title="Mockup" trigger={<button className="btn btn-sm" aria-label="Mockup options"><MoreHorizontal size={15} /></button>}
            items={[
              { label: 'Duplicate', icon: <Copy size={15} />, onClick: duplicate },
              { separator: true },
              { label: 'Delete mockup', icon: <Trash2 size={15} />, danger: true, onClick: remove },
            ]} />
        </div>
      </div>

      <div className="mke-body">
        <div className={`mke-stage ${bg.mode === 'transparent' ? 'transparent' : ''}`} style={{ '--mk-aspect': FRAMES[m.frame] || 16 / 9 }}>
          <div className="mke-holder" ref={holder} />
          {loading && <div className="mke-loading">{loading}</div>}
          {!m.content && !loading && (
            <div className="mke-empty">
              <button type="button" className="btn btn-sm" onClick={() => fileRef.current?.click()}><UploadCloud size={14} /> Upload a picture or video</button>
              <button type="button" className="btn btn-sm" onClick={() => setPicking(true)}><Library size={14} /> From the app</button>
            </div>
          )}
          {m.content?.kind === 'video' && (
            <button className="mke-play icon-btn" onClick={toggleVideo} aria-label={playing ? 'Pause video' : 'Play video'}>{playing ? <Pause size={16} /> : <Play size={16} />}</button>
          )}
          <div className="mke-views">
            {Object.entries(VIEW_LABELS).map(([k, label]) => (
              <button key={k} type="button" className={m.camera?.preset === k ? 'on' : ''} onClick={() => view(k)}>{label}</button>
            ))}
          </div>
        </div>

        <aside className="mke-panel">
          <section>
            <h3>Device</h3>
            <div className="mke-devices">
              {Object.entries(DEVICES).map(([key, d]) => {
                const Icon = DEVICE_ICON[key];
                return <button key={key} type="button" className={m.device === key ? 'on' : ''} onClick={() => setDevice(key)}><Icon size={18} /><span>{d.label}</span></button>;
              })}
              {models.map((x) => (
                <button key={x.id} type="button" className={m.device === 'custom' && m.modelId === x.id ? 'on' : ''} onClick={() => setDevice('custom', x.id)} title={x.name}><Box size={18} /><span>{x.name}</span></button>
              ))}
              <button type="button" className="mke-import" onClick={() => modelRef.current?.click()}><UploadCloud size={18} /><span>Import 3D…</span></button>
            </div>
            {spec?.finishes && (
              <div className="mke-finishes">
                {spec.finishes.map((f) => (
                  <button key={f.key} type="button" className={(m.color || spec.finishes[0].key) === f.key ? 'on' : ''} onClick={() => patch({ color: f.key })} title={f.label}>
                    <span style={{ background: `linear-gradient(135deg, ${f.frame}, ${f.back})` }} />{f.label}
                  </button>
                ))}
              </div>
            )}
            {spec?.rotates && (
              <div className="mke-toggles">
                <label><input type="checkbox" checked={m.landscape} onChange={(e) => patch({ landscape: e.target.checked })} /> Landscape</label>
                <label><input type="checkbox" checked={m.lying} onChange={(e) => patch({ lying: e.target.checked })} /> Lying flat</label>
              </div>
            )}
            {spec?.lid && (
              <label className="mke-range">Lid <input type="range" min="40" max="150" value={m.lid} onChange={(e) => patch({ lid: Number(e.target.value) })} /> <span>{m.lid}°</span></label>
            )}
            {spec?.url && (
              <input className="input mke-url" value={m.url} onChange={(e) => patch({ url: e.target.value })} placeholder="yourproduct.com" aria-label="Address in the address bar" />
            )}
            {m.device === 'custom' && model && (
              <div className="mke-model">
                <label className="mke-field">Screen part
                  <select className="input" value={model.screenMesh || ''} onChange={(e) => patchModel({ screenMesh: e.target.value })}>
                    <option value="">— none —</option>
                    {meshes.map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </label>
                <div className="mke-row">
                  <button type="button" className="btn btn-sm" onClick={() => patchModel({ screenTurn: ((model.screenTurn || 0) + 90) % 360 })}><RotateCw size={14} /> Turn picture</button>
                  <button type="button" className={`btn btn-sm ${model.screenFlip ? 'btn-on' : ''}`} onClick={() => patchModel({ screenFlip: !model.screenFlip })}><FlipHorizontal size={14} /> Mirror</button>
                </div>
              </div>
            )}
            {m.device === 'custom' && !model && <div className="hint">This model is gone (see Trash) — pick another device.</div>}
          </section>

          <section>
            <h3>Screen</h3>
            {m.content ? (
              <div className="mke-content">
                <span className="mke-content-name" title={m.content.name}>{m.content.kind === 'video' ? '▶ ' : ''}{m.content.name || 'Picture'}</span>
                <button className="icon-btn" onClick={clearContent} aria-label="Remove from the screen"><X size={14} /></button>
              </div>
            ) : <div className="hint">An image or a video — a screen recording plays right on the device.</div>}
            <div className="mke-row">
              <button className="btn btn-sm" onClick={() => fileRef.current?.click()}><UploadCloud size={14} /> Upload</button>
              <button className="btn btn-sm" onClick={() => setPicking(true)}><Library size={14} /> From the app</button>
            </div>
            <div className="segmented mke-seg" role="group" aria-label="Fit">
              <button type="button" className={m.fit === 'cover' ? 'on' : ''} onClick={() => patch({ fit: 'cover' })}>Fill screen</button>
              <button type="button" className={m.fit === 'contain' ? 'on' : ''} onClick={() => patch({ fit: 'contain' })}>Show whole</button>
            </div>
          </section>

          <section>
            <h3>Format</h3>
            <div className="segmented mke-seg" role="group" aria-label="Format">
              {Object.keys(FRAMES).map((f) => <button key={f} type="button" className={m.frame === f ? 'on' : ''} onClick={() => patch({ frame: f })}>{f}</button>)}
            </div>
            <div className="hint mke-tip"><Camera size={12} /> Drag to turn, scroll / pinch to zoom, right-drag to move.</div>
          </section>

          <section>
            <h3>Background</h3>
            <div className="segmented mke-seg" role="group" aria-label="Background">
              {[['transparent', 'None'], ['color', 'Colour'], ['gradient', 'Gradient']].map(([k, label]) => (
                <button key={k} type="button" className={bg.mode === k ? 'on' : ''} onClick={() => setBg({ mode: k })}>{label}</button>
              ))}
            </div>
            {bg.mode !== 'transparent' && (
              <div className="mke-colors">
                <label title="Colour"><input type="color" value={bg.color.toLowerCase()} onChange={(e) => setBg({ color: e.target.value.toUpperCase() })} /></label>
                {bg.mode === 'gradient' && <label title="Top colour"><input type="color" value={bg.color2.toLowerCase()} onChange={(e) => setBg({ color2: e.target.value.toUpperCase() })} /></label>}
                {brand.map((hex) => <button key={hex} type="button" className="mke-swatch" style={{ background: hex }} title={hex} onClick={() => setBg({ color: hex.toUpperCase() })} />)}
              </div>
            )}
            <label className="mke-check"><input type="checkbox" checked={m.shadow} onChange={(e) => patch({ shadow: e.target.checked })} /> Shadow on the floor</label>
          </section>

          <section>
            <h3>Export</h3>
            <div className="segmented mke-seg" role="group" aria-label="Size">
              {SIZES.map((s) => {
                const [w, h] = exportSize(m.frame, s.long);
                return <button key={s.key} type="button" className={size === s.key ? 'on' : ''} onClick={() => setSize(s.key)} title={`${w} × ${h} px`}>{s.label}</button>;
              })}
            </div>
            <div className="hint">{exportSize(m.frame, SIZES.find((s) => s.key === size).long).join(' × ')} px PNG{bg.mode === 'transparent' ? ', transparent' : ''}</div>
          </section>
        </aside>
      </div>

      <input ref={fileRef} type="file" accept="image/*,video/*" className="visually-hidden-input" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; upload(f); }} />
      <input ref={modelRef} type="file" accept=".glb,.gltf,.usdz" className="visually-hidden-input" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; importModel(f); }} />
      {picking && <MediaPicker onPick={fromApp} onClose={() => setPicking(false)} />}
      {saving && (
        <SaveToPlanModal title="Save mockup to plan" boardName="Mockups" boardMatch={MOCKUP_BOARD} submitLabel="Save mockup"
          hint="Saved as a PNG in the export size you picked."
          makeFile={async () => new File([await render(size)], `${safeName(m.name)}.png`, { type: 'image/png' })}
          onClose={() => setSaving(false)}
          onSaved={(plan) => { setSaving(false); toast(`Mockup saved to “${plan.name}”`, 'ok', { label: 'Open plan', onClick: () => navigate(`/plan/${plan.id}`) }); }} />
      )}
    </div>
  );
}
