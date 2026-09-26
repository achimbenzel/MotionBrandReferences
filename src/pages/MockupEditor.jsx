import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, UploadCloud, Library, X, Download, FolderInput, MoreHorizontal, Copy, Trash2, Play, Pause, Box, RotateCw,
  FlipHorizontal, Camera, Plus, Move, Crop, LayoutGrid, Square,
} from 'lucide-react';
import { api, mockupFileUrl, mockupModelUrl } from '../lib/api.js';
import { useSaver } from '../lib/autosave.js';
import { useToast } from '../components/Toast.jsx';
import Menu from '../components/Menu.jsx';
import SaveToPlanModal from '../components/SaveToPlanModal.jsx';
import ExportDialog from '../components/ExportDialog.jsx';
import MediaPicker from '../components/mockups/MediaPicker.jsx';
import ScreenFitter from '../components/mockups/ScreenFitter.jsx';
import { MockupStage, FRAMES, VIEW_LABELS, ANIMATIONS, LOOPING, loadModel, guessScreen, buildModel } from '../lib/mockup3d/stage.js';
import { buildDevice } from '../lib/mockup3d/devices.js';
import { recordVideo, videoFormats } from '../lib/mockup3d/video.js';
import { DEVICES, DEVICE_ICON, exportSize } from '../lib/mockup3d/catalog.js';

// Roughly how wide a device stands (cm) — to place a new one next to the others.
const WIDTH = { iphone: 7.2, android: 7.3, ipad: 17.9, macbook: 31.3, imac: 54.7, watch: 4, tv: 144.6, browser: 32 };
const MOCKUP_BOARD = /mockup/i;
const IMAGE_SIZES = [
  { label: '1080', long: 1080 }, { label: 'Full HD', long: 1920 }, { label: '2.5K', long: 2560 }, { label: '4K', long: 3840 }, { label: '8K', long: 7680 },
];
const VIDEO_SIZES = [{ label: '720p', long: 1280 }, { label: '1080p', long: 1920 }, { label: '1440p', long: 2560 }, { label: '4K', long: 3840 }];
const BACKGROUNDS = { white: { mode: 'color', color: '#FFFFFF' }, black: { mode: 'color', color: '#000000' }, transparent: { mode: 'transparent' } };

const safeName = (s) => String(s || 'mockup').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').toLowerCase() || 'mockup';
const newId = () => `d${Math.random().toString(36).slice(2, 8)}`;
const itemLabel = (it, models) => (it.device === 'custom' ? models.find((x) => x.id === it.modelId)?.name || '3D model' : DEVICES[it.device]?.label || 'Device');

/**
 * The mockup editor: one or more 3D devices (or imported models), each with a
 * picture or video on its screen that you can size and place on a grid; turn
 * the view with the mouse / a finger, pick a view, finish, background, format
 * and an animation, then export an image or a video, or save into a plan.
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
  const [selId, setSelId] = useState(null);
  const [parts, setParts] = useState([]);          // parts of the selected imported model
  const [meshes, setMeshes] = useState({});        // model id → mesh names
  const [loading, setLoading] = useState('');
  const [picking, setPicking] = useState(false);
  const [fitting, setFitting] = useState(false);
  const [exporting, setExporting] = useState(null); // null | { initial, formats }
  const [planFile, setPlanFile] = useState(null);   // a rendered file on its way into a plan
  const [quickPlan, setQuickPlan] = useState(false);
  const [paused, setPaused] = useState(false);
  const [preview, setPreview] = useState(false);    // animation preview running
  const [brand, setBrand] = useState([]);
  const holder = useRef(null);
  const stageRef = useRef(null);
  const mRef = useRef(null);
  const pending = useRef({});
  const modelCache = useRef(new Map());
  const framed = useRef(false);
  const lastShape = useRef('');
  const reframe = useRef(false);
  const fileRef = useRef(null);
  const modelRef = useRef(null);
  mRef.current = m;

  useEffect(() => {
    let on = true;
    Promise.all([api.getMockup(id), api.listMockups()]).then(([mock, list]) => {
      if (!on) return;
      setM(mock); setModels(list.models || []); setSelId(mock.items[0]?.id || null);
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
  // never while a picture is still loading.
  const thumbTimer = useRef(0);
  const changed = useRef(false);
  const makeThumb = useCallback(async (st = stageRef.current) => {
    clearTimeout(thumbTimer.current); thumbTimer.current = 0;
    const cur = mRef.current;
    if (!st || !cur || st.loadingContent || st.animating) return;
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
    mRef.current = { ...mRef.current, ...p };
    setM((prev) => ({ ...prev, ...p }));
    pending.current = { ...pending.current, ...p };
    saver.schedule('mockup', () => {
      const body = pending.current; pending.current = {};
      if (!Object.keys(body).length) return null;
      return api.updateMockup(id, body).catch((e) => toast(`Could not save: ${e.message}`, 'error'));
    }, { immediate });
    refreshThumb();
  }, [id, saver, toast, refreshThumb]);
  const patchItems = useCallback((fn, immediate) => patch({ items: fn(mRef.current.items) }, immediate), [patch]);
  const patchItem = useCallback((itemId, p, immediate) => patchItems((list) => list.map((it) => (it.id === itemId ? { ...it, ...p } : it)), immediate), [patchItems]);
  // After an upload: take the server's screen content, keep everything else as it is here.
  const takeContent = (server) => {
    changed.current = true;
    const next = { ...mRef.current, items: mRef.current.items.map((it) => ({ ...it, content: server.items.find((x) => x.id === it.id)?.content ?? null })), thumb: server.thumb };
    mRef.current = next;
    setM(next);
  };

  // ---- The stage ------------------------------------------------------------------------
  const ready = !!m;
  useEffect(() => {
    if (!ready || !holder.current) return undefined;
    const st = new MockupStage(holder.current, {
      onCamera: (camera) => patch({ camera: { ...camera, preset: '' } }),
      onSelect: (itemId) => setSelId(itemId),
      onMove: (itemId, pos) => patchItem(itemId, pos),
    });
    st.setFrame(mRef.current.frame);
    st.setAnimation(mRef.current.animation);
    stageRef.current = st;
    return () => { flushThumb(st); st.dispose(); stageRef.current = null; framed.current = false; lastShape.current = ''; };
  }, [ready, patch, patchItem, flushThumb]);

  const lookFrom = useCallback((name) => {
    const st = stageRef.current;
    if (!st) return;
    st.stop(); setPreview(false);
    st.view(name);
    patch({ camera: { ...st.getCamera(), preset: name } });
  }, [patch]);

  const items = useMemo(() => m?.items || [], [m?.items]);
  const sel = items.find((it) => it.id === selId) || items[0] || null;
  // What is built, and where it stands (not the pictures on the screens).
  const structKey = JSON.stringify([items.map((it) => [it.id, it.device, it.modelId, it.color, it.landscape, it.lying, it.lid, it.url, it.size, it.x, it.z, it.rotY, it.logo, it.hidden]),
    models.map((x) => [x.id, x.screenMesh, x.screenTurn, x.screenFlip])]);
  const shapeKey = items.map((it) => `${it.id}:${it.device}:${it.modelId}:${it.landscape}:${it.lying}:${it.size}`).join('|');
  useEffect(() => {
    const st = stageRef.current;
    const cur = mRef.current;
    if (!st || !cur) return undefined;
    let alive = true;
    (async () => {
      try {
        st.keep(cur.items.map((it) => it.id));
        for (const it of cur.items) {
          const pos = { x: it.x, z: it.z, rotY: it.rotY };
          if (it.device !== 'custom') {
            st.setItem(it.id, { key: JSON.stringify([it.device, it.color, it.landscape, it.lying, it.lid, it.url]), build: () => buildDevice(it.device, it), ...pos, screenOpts: {} });
            continue;
          }
          const model = models.find((x) => x.id === it.modelId);
          if (!model) {
            st.setItem(it.id, { key: 'missing', build: () => buildDevice('iphone', {}), ...pos, screenOpts: {} });
            continue;
          }
          let loaded = modelCache.current.get(model.id);
          if (!loaded) {
            setLoading('Loading the 3D model…');
            loaded = await loadModel(mockupModelUrl(model), model.format);
            modelCache.current.set(model.id, loaded);
            if (alive) setMeshes((ms) => ({ ...ms, [model.id]: loaded.meshes }));
          }
          if (!alive) return;
          const screenMesh = model.screenMesh || guessScreen(loaded.meshes);
          if (!model.screenMesh && screenMesh) {
            api.updateMockupModel(model.id, { screenMesh }).then((x) => setModels((ms) => ms.map((y) => (y.id === x.id ? x : y)))).catch(() => {});
          }
          st.setItem(it.id, {
            key: JSON.stringify(['custom', model.id, screenMesh, it.size]), build: () => buildModel(loaded.object, { screenMesh, size: it.size }), ...pos,
            screenOpts: { turn: (model.screenTurn || 0) / 90, mirror: model.screenFlip, flipV: model.format !== 'usdz' },
          });
          st.setItemParts(it.id, { hidden: it.hidden, logo: it.logo });
        }
        if (!alive) return;
        st.select(selId);
        if (!framed.current) {
          framed.current = true;
          if (cur.camera?.position) st.setCamera(cur.camera);
          else lookFrom(cur.camera?.preset || 'three-right');
        } else if (reframe.current || shapeKey !== lastShape.current) {
          lookFrom(cur.camera?.preset || 'three-right');
        }
        reframe.current = false;
        lastShape.current = shapeKey;
        setParts(sel?.device === 'custom' ? st.parts(sel.id) : []);
        refreshThumb();
      } catch (e) {
        toast(`Could not load the model: ${e.message}`, 'error');
      } finally { if (alive) setLoading(''); }
    })();
    return () => { alive = false; };
  }, [structKey, ready]); // eslint-disable-line react-hooks/exhaustive-deps

  // Pictures on the screens, and how they fit.
  const contentKey = JSON.stringify(items.map((it) => [it.id, it.content?.file || '']));
  useEffect(() => {
    const st = stageRef.current; const cur = mRef.current;
    if (!st || !cur) return;
    if (cur.items.some((it) => it.content)) setLoading('Loading…');
    Promise.all(cur.items.map((it) => st.setItemContent(it.id, it.content ? { url: mockupFileUrl(cur, it.content.file), kind: it.content.kind } : null)))
      .then(() => { setPaused(false); refreshThumb(); })
      .catch((e) => toast(e.message, 'error'))
      .finally(() => setLoading(''));
  }, [contentKey, structKey, ready, toast, refreshThumb]);
  const fitKey = JSON.stringify(items.map((it) => [it.id, it.fit, it.adjust]));
  useEffect(() => {
    const st = stageRef.current;
    if (!st) return;
    for (const it of mRef.current.items) st.setItemFit(it.id, it.fit, it.adjust);
  }, [fitKey, structKey, ready]);
  useEffect(() => {
    const st = stageRef.current;
    st?.select(selId);
    setParts(st && sel?.device === 'custom' ? st.parts(sel.id) : []);
  }, [selId, ready]); // eslint-disable-line react-hooks/exhaustive-deps
  const bgKey = m ? JSON.stringify(m.background) : '';
  useEffect(() => { if (m) stageRef.current?.setBackground(m.background); }, [bgKey, ready]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (m) stageRef.current?.setShadow(m.shadow); }, [m?.shadow, ready]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const st = stageRef.current; const cur = mRef.current;
    if (!st || !cur) return;
    st.setFrame(cur.frame);
    if (framed.current && cur.camera?.preset) lookFrom(cur.camera.preset);
  }, [m?.frame, ready]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Devices -----------------------------------------------------------------------
  const addDevice = (device, modelId = null) => {
    const b = stageRef.current?.bounds;
    const w = device === 'custom' ? 20 : WIDTH[device] || 20;
    const x = b ? b.max.x + Math.max(3, w * 0.25) + w / 2 : 0;
    const it = { id: newId(), device, modelId, color: '', x: Math.round(x * 10) / 10, z: 0, rotY: 0, fit: 'cover', adjust: { scale: 1, x: 0, y: 0 } };
    reframe.current = true;
    patchItems((list) => [...list, it], true);
    setSelId(it.id);
  };
  const duplicateDevice = () => {
    if (!sel) return;
    const size = stageRef.current?.itemSize(sel.id);
    const copy = { ...sel, id: newId(), contentFrom: sel.content ? sel.id : undefined, x: Math.round((sel.x + (size?.w || 10) * 1.15) * 10) / 10 };
    reframe.current = true;
    patchItems((list) => [...list, copy], true);
    setSelId(copy.id);
  };
  const removeDevice = () => {
    if (!sel || items.length < 2) return;
    const gone = sel;
    const at = items.indexOf(gone);
    reframe.current = true;
    patchItems((list) => list.filter((it) => it.id !== gone.id), true);
    setSelId(items[at === 0 ? 1 : at - 1]?.id || null);
    toast(`${itemLabel(gone, models)} removed`, 'ok', {
      label: 'Undo',
      onClick: () => { reframe.current = true; patchItems((list) => [...list.slice(0, at), gone, ...list.slice(at)], true); setSelId(gone.id); },
    });
  };
  const setDevice = (device, modelId = null) => {
    if (!sel || (device === sel.device && modelId === (sel.modelId || null))) return;
    patchItem(sel.id, { device, modelId, color: '' }, true);
  };
  // Put the devices next to / in front of each other.
  const arrange = (mode) => {
    const st = stageRef.current;
    if (!st) return;
    const list = mRef.current.items;
    const sizes = list.map((it) => st.itemSize(it.id) || { w: 10, d: 10, h: 10 });
    const gap = Math.max(3, Math.max(...sizes.map((s) => s.w)) * 0.06);
    const r1 = (v) => Math.round(v * 10) / 10;
    let next;
    if (mode === 'side') {
      const total = sizes.reduce((n, s) => n + s.w, 0) + gap * (list.length - 1);
      let x = -total / 2;
      next = list.map((it, i) => { const cx = x + sizes[i].w / 2; x += sizes[i].w + gap; return { ...it, x: r1(cx), z: 0, rotY: 0 }; });
    } else if (mode === 'hero') {
      const main = sizes.reduce((best, s, i) => (s.w * s.h > sizes[best].w * sizes[best].h ? i : best), 0);
      let x = sizes[main].w * 0.18;
      next = list.map((it, i) => {
        if (i === main) return { ...it, x: 0, z: 0, rotY: 0 };
        const cx = x + sizes[i].w / 2; x += sizes[i].w + gap * 0.6;
        return { ...it, x: r1(cx), z: r1(sizes[main].d / 2 + gap + sizes[i].d / 2), rotY: -10 };
      });
    } else {
      let x = 0; let z = 0;
      next = list.map((it, i) => {
        const out = { ...it, x: r1(x), z: r1(z), rotY: -14 };
        x += sizes[i].w * 0.42; z += Math.max(sizes[i].d, 4) + gap * 0.5;
        return out;
      });
    }
    reframe.current = true;
    patch({ items: next }, true);
  };

  // ---- Screen content -----------------------------------------------------------------
  const upload = async (file) => {
    if (!file || !sel) return;
    setLoading('Uploading…');
    try { takeContent(await api.setMockupContent(id, file, sel.id)); } catch (e) { toast(`Upload failed: ${e.message}`, 'error'); setLoading(''); }
  };
  const fromApp = async (source) => {
    setPicking(false);
    if (!sel) return;
    setLoading('Loading…');
    try { takeContent(await api.importMockupContent(id, source, sel.id)); } catch (e) { toast(e.message, 'error'); setLoading(''); }
  };
  const clearContent = async () => {
    if (!sel) return;
    try { takeContent(await api.clearMockupContent(id, sel.id)); } catch (e) { toast(e.message, 'error'); }
  };

  // ---- Imported models ------------------------------------------------------------------
  const model = sel?.device === 'custom' ? models.find((x) => x.id === sel.modelId) || null : null;
  const importModel = async (file) => {
    if (!file) return;
    setLoading('Importing the 3D model…');
    try {
      const mdl = await api.addMockupModel(file);
      setModels((ms) => [...ms, mdl]);
      if (sel) patchItem(sel.id, { device: 'custom', modelId: mdl.id, size: 25 }, true);
      toast(`“${mdl.name}” imported — pick its screen part if it doesn’t show your picture`);
    } catch (e) { toast(`Import failed: ${e.message}`, 'error'); setLoading(''); }
  };
  const patchModel = async (p) => {
    if (!model) return;
    changed.current = true;
    setModels((ms) => ms.map((x) => (x.id === model.id ? { ...x, ...p } : x)));
    try { await api.updateMockupModel(model.id, p); } catch (e) { toast(`Could not save: ${e.message}`, 'error'); }
  };
  const logoParts = parts.filter((p) => p.logo);

  // ---- Animation, playback ------------------------------------------------------------
  const anim = m?.animation || { preset: 'none', duration: 6, easing: 'ease' };
  const togglePreview = () => {
    const st = stageRef.current;
    if (!st) return;
    if (st.animating) { st.stop(); setPreview(false); } else { st.setAnimation(mRef.current.animation); st.play(); setPreview(true); }
  };
  const setAnim = (p) => {
    const next = { ...anim, ...p };
    patch({ animation: next });
    const st = stageRef.current;
    if (!st) return;
    st.setAnimation(next);
    if (next.preset === 'none') { st.stop(); setPreview(false); } else if (!st.animating) { st.play(); setPreview(true); }
  };
  const toggleVideo = () => {
    stageRef.current?.setPaused(!paused);
    setPaused(!paused);
  };
  const hasVideo = items.some((it) => it.content?.kind === 'video');

  // ---- Export -------------------------------------------------------------------------
  const openExport = async (initial = 'image') => {
    const [w, h] = exportSize(mRef.current.frame, 1920);
    const formats = await videoFormats(w, h).catch(() => []);
    setExporting({ initial, formats });
  };
  const exportTargets = (formats) => {
    const aspect = FRAMES[m.frame] || 16 / 9;
    const sizes = (list) => list.map((s) => { const [w, h] = exportSize(m.frame, s.long); return { label: s.label, w, h }; });
    return [
      {
        key: 'image', label: 'Image', kind: 'image', aspect, sizes: sizes(IMAGE_SIZES), defaultSize: 3,
        backgrounds: [{ key: 'scene', label: 'As in the scene' }, { key: 'transparent', label: 'Transparent' }, { key: 'white', label: 'White', swatch: '#fff' }, { key: 'black', label: 'Black', swatch: '#000' }],
        allowColor: true, formats: ['png', 'jpg', 'webp'], maxSize: stageRef.current?.maxExport() || 8192,
        options: [{ key: 'shadow', label: 'Floor shadow', type: 'select', default: 'scene', choices: [{ key: 'scene', label: 'As in the scene' }, { key: 'on', label: 'On' }, { key: 'off', label: 'Off' }] }],
      },
      {
        key: 'video', label: 'Video', kind: 'video', aspect, sizes: sizes(VIDEO_SIZES), defaultSize: 1,
        backgrounds: [{ key: 'scene', label: 'As in the scene' }, { key: 'white', label: 'White', swatch: '#fff' }, { key: 'black', label: 'Black', swatch: '#000' }],
        allowColor: true, formats, fps: [24, 30, 60], duration: anim.duration, maxSize: 3840,
        note: anim.preset === 'none'
          ? `No animation picked — the camera stays still for ${anim.duration} s while screen videos play. Choose one under Animation.`
          : `${ANIMATIONS[anim.preset]}, ${anim.duration} s${LOOPING.has(anim.preset) ? ', loops seamlessly' : ''} — from the view you set.`,
      },
    ];
  };
  const runExport = async (target, o, { onProgress, signal }) => {
    const st = stageRef.current;
    if (!st) throw new Error('The 3D view isn’t ready');
    const override = o.background === 'scene' ? null : o.background === 'color' ? { mode: 'color', color: o.color } : BACKGROUNDS[o.background];
    if (target.kind === 'video') {
      setPreview(false);
      const bg = override || (mRef.current.background.mode === 'transparent' ? BACKGROUNDS.black : null);
      return recordVideo(st, { width: o.width, height: o.height, fps: o.fps, duration: anim.duration, format: o.format, background: bg, onProgress, signal });
    }
    const shadow = mRef.current.shadow;
    if (o.shadow !== 'scene') st.setShadow(o.shadow === 'on');
    try { return await st.toBlob(o.width, o.height, o.mime, o.quality, override); } finally { st.setShadow(shadow); }
  };
  const quickPng = async () => {
    const [w, h] = exportSize(mRef.current.frame, 3840);
    return new File([await stageRef.current.toBlob(w, h)], `${safeName(mRef.current.name)}.png`, { type: 'image/png' });
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

  const spec = sel ? DEVICES[sel.device] : null;
  const bg = m.background;
  const setBg = (p) => patch({ background: { ...bg, ...p } });
  const addItems = [
    ...Object.entries(DEVICES).map(([key, d]) => { const I = DEVICE_ICON[key]; return { label: d.label, icon: <I size={15} />, onClick: () => addDevice(key) }; }),
    ...(models.length ? [{ separator: true }] : []),
    ...models.map((x) => ({ label: x.name, icon: <Box size={15} />, onClick: () => addDevice('custom', x.id) })),
  ];

  return (
    <div className="mke">
      <div className="mke-top">
        <button className="detail-back" style={{ margin: 0 }} onClick={async () => { await Promise.all([saver.flush(), flushThumb()]); navigate('/mockups'); }}><ArrowLeft size={16} /> Mockups</button>
        <input className="mke-name" value={m.name} onChange={(e) => patch({ name: e.target.value })} aria-label="Mockup name" placeholder="Untitled mockup" />
        <div className="mke-actions">
          <button className="btn btn-sm" onClick={() => setQuickPlan(true)}><FolderInput size={14} /> <span className="mke-long">Save to plan</span><span className="mke-short">Plan</span></button>
          <button className="btn btn-sm btn-primary" onClick={() => openExport('image')}><Download size={14} /> Export</button>
          <Menu align="right" title="Mockup" trigger={<button className="btn btn-sm" aria-label="Mockup options"><MoreHorizontal size={15} /></button>}
            items={[
              { label: 'Export video…', icon: <Play size={15} />, onClick: () => openExport('video') },
              { label: 'Duplicate mockup', icon: <Copy size={15} />, onClick: duplicate },
              { separator: true },
              { label: 'Delete mockup', icon: <Trash2 size={15} />, danger: true, onClick: remove },
            ]} />
        </div>
      </div>

      <div className="mke-body">
        <div className={`mke-stage ${bg.mode === 'transparent' ? 'transparent' : ''}`} style={{ '--mk-aspect': FRAMES[m.frame] || 16 / 9 }}>
          <div className="mke-holder" ref={holder} />
          {loading && <div className="mke-loading">{loading}</div>}
          {sel && !sel.content && !loading && !preview && (
            <div className="mke-empty">
              <button type="button" className="btn btn-sm" onClick={() => fileRef.current?.click()}><UploadCloud size={14} /> Upload a picture or video</button>
              <button type="button" className="btn btn-sm" onClick={() => setPicking(true)}><Library size={14} /> From the app</button>
            </div>
          )}
          {hasVideo && (
            <button className="mke-play icon-btn" onClick={toggleVideo} aria-label={paused ? 'Play screen videos' : 'Pause screen videos'}>{paused ? <Play size={16} /> : <Pause size={16} />}</button>
          )}
          <div className="mke-views">
            {anim.preset !== 'none' && (
              <button type="button" className={`mke-anim-btn ${preview ? 'on' : ''}`} onClick={togglePreview} aria-label={preview ? 'Stop the animation' : 'Play the animation'}>
                {preview ? <Square size={11} fill="currentColor" /> : <Play size={11} fill="currentColor" />} {preview ? 'Stop' : 'Play'}
              </button>
            )}
            {Object.entries(VIEW_LABELS).map(([k, label]) => (
              <button key={k} type="button" className={m.camera?.preset === k ? 'on' : ''} onClick={() => lookFrom(k)}>{label}</button>
            ))}
          </div>
        </div>

        <aside className="mke-panel">
          <section>
            <h3>Scene <span className="mke-count">{items.length} {items.length === 1 ? 'device' : 'devices'}</span></h3>
            <div className="mke-items">
              {items.map((it) => {
                const I = DEVICE_ICON[it.device] || Box;
                return (
                  <button key={it.id} type="button" className={`mke-item ${sel?.id === it.id ? 'on' : ''}`} onClick={() => setSelId(it.id)}>
                    <I size={15} /><span>{itemLabel(it, models)}</span>{it.content && <i className="mke-item-dot" title="Has a picture" />}
                  </button>
                );
              })}
              <Menu title="Add a device" trigger={<button type="button" className="mke-item mke-add" aria-label="Add a device"><Plus size={15} /><span>Add</span></button>} items={addItems} />
            </div>
            {items.length > 1 ? (
              <>
                <div className="mke-row mke-arrange">
                  <Menu title="Arrange" trigger={<button type="button" className="btn btn-sm"><LayoutGrid size={14} /> Arrange</button>}
                    items={[
                      { label: 'Side by side', onClick: () => arrange('side') },
                      { label: 'Big one behind, others in front', onClick: () => arrange('hero') },
                      { label: 'Cascade', onClick: () => arrange('cascade') },
                    ]} />
                  <button type="button" className="btn btn-sm" onClick={duplicateDevice}><Copy size={14} /> Duplicate</button>
                  <button type="button" className="btn btn-sm" onClick={removeDevice}><Trash2 size={14} /> Remove</button>
                </div>
                <div className="hint mke-tip"><Move size={12} /> Click a device to select it, drag it to move it on the floor.</div>
              </>
            ) : <div className="hint">Add more devices — e.g. a phone in front of a MacBook.</div>}
          </section>

          {sel && (
            <section>
              <h3>{items.length > 1 ? `Device · ${itemLabel(sel, models)}` : 'Device'}</h3>
              <div className="mke-devices">
                {Object.entries(DEVICES).map(([key, d]) => {
                  const Icon = DEVICE_ICON[key];
                  return <button key={key} type="button" className={sel.device === key ? 'on' : ''} onClick={() => setDevice(key)}><Icon size={18} /><span>{d.label}</span></button>;
                })}
                {models.map((x) => (
                  <button key={x.id} type="button" className={sel.device === 'custom' && sel.modelId === x.id ? 'on' : ''} onClick={() => setDevice('custom', x.id)} title={x.name}><Box size={18} /><span>{x.name}</span></button>
                ))}
                <button type="button" className="mke-import" onClick={() => modelRef.current?.click()}><UploadCloud size={18} /><span>Import 3D…</span></button>
              </div>
              {spec?.finishes && (
                <div className="mke-finishes">
                  {spec.finishes.map((f) => (
                    <button key={f.key} type="button" className={(sel.color || spec.finishes[0].key) === f.key ? 'on' : ''} onClick={() => patchItem(sel.id, { color: f.key })} title={f.label}>
                      <span style={{ background: `linear-gradient(135deg, ${f.frame}, ${f.back})` }} />{f.label}
                    </button>
                  ))}
                </div>
              )}
              {spec?.rotates && (
                <div className="mke-toggles">
                  <label><input type="checkbox" checked={sel.landscape} onChange={(e) => patchItem(sel.id, { landscape: e.target.checked })} /> Landscape</label>
                  <label><input type="checkbox" checked={sel.lying} onChange={(e) => patchItem(sel.id, { lying: e.target.checked })} /> Lying flat</label>
                </div>
              )}
              {spec?.lid && (
                <label className="mke-range">Lid <input type="range" min="40" max="150" value={sel.lid} onChange={(e) => patchItem(sel.id, { lid: Number(e.target.value) })} /> <span>{sel.lid}°</span></label>
              )}
              {spec?.url && (
                <input className="input mke-url" value={sel.url} onChange={(e) => patchItem(sel.id, { url: e.target.value })} placeholder="yourproduct.com" aria-label="Address in the address bar" />
              )}
              {sel.device === 'custom' && model && (
                <div className="mke-model">
                  <label className="mke-field">Screen part
                    <select className="input" value={model.screenMesh || ''} onChange={(e) => patchModel({ screenMesh: e.target.value })}>
                      <option value="">— none —</option>
                      {(meshes[model.id] || []).map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </label>
                  <div className="mke-row">
                    <button type="button" className="btn btn-sm" onClick={() => patchModel({ screenTurn: ((model.screenTurn || 0) + 90) % 360 })}><RotateCw size={14} /> Turn picture</button>
                    <button type="button" className={`btn btn-sm ${model.screenFlip ? 'btn-on' : ''}`} onClick={() => patchModel({ screenFlip: !model.screenFlip })}><FlipHorizontal size={14} /> Mirror</button>
                  </div>
                  <label className="mke-range">Size <input type="range" min="2" max="200" value={sel.size} onChange={(e) => patchItem(sel.id, { size: Number(e.target.value) })} /> <span>{sel.size} cm</span></label>
                  <label className="mke-check" title={logoParts.length ? logoParts.map((p) => p.name).join(', ') : 'No part of this model is named like a logo — hide it under Parts'}>
                    <input type="checkbox" checked={sel.logo && logoParts.length > 0} disabled={!logoParts.length} onChange={(e) => patchItem(sel.id, { logo: e.target.checked })} /> Show logo {logoParts.length ? '' : '(no logo part found)'}
                  </label>
                  {parts.length > 1 && (
                    <details className="mke-parts">
                      <summary>Parts ({parts.length}) — show / hide</summary>
                      {parts.map((p) => (
                        <label key={p.name} className="mke-check">
                          <input type="checkbox" checked={!sel.hidden.includes(p.name)} onChange={(e) => patchItem(sel.id, { hidden: e.target.checked ? sel.hidden.filter((n) => n !== p.name) : [...sel.hidden, p.name] })} />
                          <span>{p.name}</span>{p.logo && <em>logo</em>}
                        </label>
                      ))}
                    </details>
                  )}
                </div>
              )}
              {sel.device === 'custom' && !model && <div className="hint">This model is gone (see Trash) — pick another device.</div>}
              {items.length > 1 && (
                <label className="mke-range">Turn <input type="range" min="-180" max="180" value={sel.rotY} onChange={(e) => patchItem(sel.id, { rotY: Number(e.target.value) })} /> <span>{sel.rotY}°</span></label>
              )}
            </section>
          )}

          {sel && (
            <section>
              <h3>Screen</h3>
              {sel.content ? (
                <div className="mke-content">
                  <span className="mke-content-name" title={sel.content.name}>{sel.content.kind === 'video' ? '▶ ' : ''}{sel.content.name || 'Picture'}</span>
                  <button className="icon-btn" onClick={clearContent} aria-label="Remove from the screen"><X size={14} /></button>
                </div>
              ) : <div className="hint">An image or a video — a screen recording plays right on the device.</div>}
              <div className="mke-row">
                <button className="btn btn-sm" onClick={() => fileRef.current?.click()}><UploadCloud size={14} /> Upload</button>
                <button className="btn btn-sm" onClick={() => setPicking(true)}><Library size={14} /> From the app</button>
              </div>
              {sel.content && (
                <>
                  <button type="button" className="btn btn-sm mke-fit-btn" onClick={() => setFitting(true)}><Crop size={14} /> Position &amp; size…</button>
                  <div className="segmented mke-seg" role="group" aria-label="Fit">
                    <button type="button" className={sel.fit === 'cover' ? 'on' : ''} onClick={() => patchItem(sel.id, { fit: 'cover', adjust: { scale: 1, x: 0, y: 0 } })}>Fill screen</button>
                    <button type="button" className={sel.fit === 'contain' ? 'on' : ''} onClick={() => patchItem(sel.id, { fit: 'contain', adjust: { scale: 1, x: 0, y: 0 } })}>Show whole</button>
                  </div>
                  {(sel.adjust.scale !== 1 || sel.adjust.x !== 0 || sel.adjust.y !== 0) && (
                    <div className="hint">Your size / position: {Math.round(sel.adjust.scale * 100)}% · x {Math.round(sel.adjust.x * 100)}% · y {Math.round(sel.adjust.y * 100)}%</div>
                  )}
                </>
              )}
            </section>
          )}

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
            <h3>Animation</h3>
            <div className="mke-anims">
              {Object.entries(ANIMATIONS).map(([k, label]) => (
                <button key={k} type="button" className={anim.preset === k ? 'on' : ''} onClick={() => setAnim({ preset: k })}>{label}</button>
              ))}
            </div>
            {anim.preset !== 'none' && (
              <>
                <label className="mke-range">Length <input type="range" min="1" max="30" step="0.5" value={anim.duration} onChange={(e) => setAnim({ duration: Number(e.target.value) })} /> <span>{anim.duration} s</span></label>
                {!LOOPING.has(anim.preset) && (
                  <div className="segmented mke-seg" role="group" aria-label="Easing">
                    <button type="button" className={anim.easing === 'ease' ? 'on' : ''} onClick={() => setAnim({ easing: 'ease' })}>Smooth</button>
                    <button type="button" className={anim.easing === 'linear' ? 'on' : ''} onClick={() => setAnim({ easing: 'linear' })}>Even</button>
                  </div>
                )}
                <div className="mke-row">
                  <button type="button" className="btn btn-sm" onClick={togglePreview}>{preview ? <><Square size={13} /> Stop</> : <><Play size={13} /> Preview</>}</button>
                  <button type="button" className="btn btn-sm" onClick={() => openExport('video')}><Download size={13} /> Video…</button>
                </div>
                <div className="hint">It starts from the view you set.{LOOPING.has(anim.preset) ? ' Loops seamlessly.' : ''}</div>
              </>
            )}
          </section>
        </aside>
      </div>

      <input ref={fileRef} type="file" accept="image/*,video/*" className="visually-hidden-input" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; upload(f); }} />
      <input ref={modelRef} type="file" accept=".glb,.gltf,.usdz" className="visually-hidden-input" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; importModel(f); }} />
      {picking && <MediaPicker onPick={fromApp} onClose={() => setPicking(false)} />}
      {fitting && sel?.content && (
        <ScreenFitter
          info={stageRef.current?.screenInfo(sel.id)}
          src={mockupFileUrl(m, sel.content.file)} kind={sel.content.kind}
          fit={sel.fit} adjust={sel.adjust}
          onChange={({ fit, adjust }) => patchItem(sel.id, { fit, adjust })}
          onClose={() => setFitting(false)} />
      )}
      {exporting && (
        <ExportDialog title="Export mockup" storeKey="mkExport" initial={exporting.initial} name={safeName(m.name)}
          targets={exportTargets(exporting.formats)} onExport={runExport}
          onSaveToPlan={(file) => { setExporting(null); setPlanFile(file); }}
          onClose={() => setExporting(null)} />
      )}
      {(planFile || quickPlan) && (
        <SaveToPlanModal title="Save mockup to plan" boardName="Mockups" boardMatch={MOCKUP_BOARD} submitLabel="Save mockup"
          hint={planFile ? `Saved as ${planFile.name}.` : 'Saved as a 4K PNG — for another size or format use Export → Save to plan.'}
          makeFile={async () => planFile || quickPng()}
          onClose={() => { setPlanFile(null); setQuickPlan(false); }}
          onSaved={(plan) => { setPlanFile(null); setQuickPlan(false); toast(`Mockup saved to “${plan.name}”`, 'ok', { label: 'Open plan', onClick: () => navigate(`/plan/${plan.id}`) }); }} />
      )}
    </div>
  );
}
