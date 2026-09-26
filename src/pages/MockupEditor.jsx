import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, UploadCloud, Library, X, Download, FolderInput, MoreHorizontal, Copy, Trash2, Play, Box, RotateCw,
  FlipHorizontal, Camera, Plus, Move, Crop, LayoutGrid, Volume2, VolumeX, Sun, DoorOpen, ImagePlus,
} from 'lucide-react';
import { api, mockupFileUrl, mockupModelUrl, mockupHdriUrl } from '../lib/api.js';
import { useSaver } from '../lib/autosave.js';
import { useToast } from '../components/Toast.jsx';
import Menu from '../components/Menu.jsx';
import SaveToPlanModal from '../components/SaveToPlanModal.jsx';
import ExportDialog from '../components/ExportDialog.jsx';
import MediaPicker from '../components/mockups/MediaPicker.jsx';
import ScreenFitter from '../components/mockups/ScreenFitter.jsx';
import Timeline from '../components/mockups/Timeline.jsx';
import {
  MockupStage, FRAMES, VIEW_LABELS, MOTIONS_LABELS, CAMERA_MOVES, LOOPING, loadModel, guessScreen, buildModel, modelJoints, guessHinge, valueAt,
} from '../lib/mockup3d/stage.js';
import { LIGHT_SETUPS, loadHdriTexture, analyseHdri, hdriPreview } from '../lib/mockup3d/lighting.js';
import { buildDevice } from '../lib/mockup3d/devices.js';
import { recordVideo, videoFormats } from '../lib/mockup3d/video.js';
import {
  DEVICES, exportSize, itemIcon, OBJECTS, OBJECT_ICON, CARD_SIZES, POSTER_SIZES, FINISHES, POSTER_FRAMES, BOX_MATERIALS, OBJECT_COLORS, defaultObject,
} from '../lib/mockup3d/catalog.js';
import { buildObject } from '../lib/mockup3d/objects.js';
import Range from '../components/Range.jsx';

const MOCKUP_BOARD = /mockup/i;
const IMAGE_SIZES = [
  { label: '1080', long: 1080 }, { label: 'Full HD', long: 1920 }, { label: '2.5K', long: 2560 }, { label: '4K', long: 3840 }, { label: '8K', long: 7680 },
];
const VIDEO_SIZES = [{ label: '720p', long: 1280 }, { label: '1080p', long: 1920 }, { label: '1440p', long: 2560 }, { label: '4K', long: 3840 }];
const BACKGROUNDS = { white: { mode: 'color', color: '#FFFFFF' }, black: { mode: 'color', color: '#000000' }, transparent: { mode: 'transparent' } };
const LEGACY_MOVES = { orbit: 'orbit', push: 'push', reveal: 'reveal' };
const SHADOW_MODES = [['contact', 'Soft'], ['sun', 'Sun'], ['both', 'Both'], ['none', 'None']];
// A hint of each light setup for its button.
const LIGHT_SWATCH = {
  studio: 'radial-gradient(circle at 30% 25%, #f2f2f2 0 18%, #3a3a40 45%, #151518)',
  product: 'linear-gradient(90deg, #fff 0 5%, #050507 12% 88%, #fff 95%)',
  daylight: 'linear-gradient(90deg, #cfe2ff 0 22%, #b8a58c 30% 100%)',
  golden: 'linear-gradient(180deg, #3c5a9a 0%, #ff9b50 55%, #3b2616 60%)',
  overcast: 'linear-gradient(180deg, #f4f6fa 0%, #d9dde3 55%, #555 60%)',
  office: 'repeating-linear-gradient(90deg, #eee 0 10%, #3d3f44 10% 25%)',
  neon: 'linear-gradient(90deg, #ff2aa0 0 8%, #0c0b1c 20% 80%, #1ecbff 92%)',
};

const safeName = (s) => String(s || 'mockup').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').toLowerCase() || 'mockup';
const newId = () => `d${Math.random().toString(36).slice(2, 8)}`;
const itemLabel = (it, models) => (it.device === 'custom' ? models.find((x) => x.id === it.modelId)?.name || '3D model'
  : it.device === 'object' ? OBJECTS[it.obj?.type]?.label || 'Object' : DEVICES[it.device]?.label || 'Device');
const r2 = (v) => Math.round(v * 100) / 100;
// Put a keyframe at t (replacing one that is already there).
const putKey = (keys, key) => [...keys.filter((k) => Math.abs(k.t - key.t) > 0.05), key].sort((a, b) => a.t - b.t);

/**
 * The 3D mockup editor: your own 3D models — one or more — each with a
 * picture or video on its screen (sized and placed on a grid), a hinge to
 * open / close, light setups, and a timeline with keyframes for the camera
 * and the hinges and the part of each screen video that plays (with sound).
 * Export an image or a video, or save into a plan. Settings save as you go.
 */
export default function MockupEditor({ initial, initialModels, initialHdris }) {
  const id = initial.id;
  const navigate = useNavigate();
  const toast = useToast();
  const saver = useSaver(600);
  const [m, setM] = useState(initial);
  const [models, setModels] = useState(initialModels || []);
  const [hdris, setHdris] = useState(initialHdris || []);
  const [selId, setSelId] = useState(initial.items[0]?.id || null);
  const [parts, setParts] = useState([]);          // parts of the selected imported model
  const [info, setInfo] = useState({});            // model id → { meshes, joints }
  const [videoLen, setVideoLen] = useState({});    // device id → length of its screen video (s)
  const [loading, setLoading] = useState('');
  const [picking, setPicking] = useState(false);
  const [fitting, setFitting] = useState(false);
  const [face, setFace] = useState('front'); // an object's printed face being edited
  const [exporting, setExporting] = useState(null); // null | { initial, formats }
  const [planFile, setPlanFile] = useState(null);
  const [quickPlan, setQuickPlan] = useState(false);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [brand, setBrand] = useState([]);
  const holder = useRef(null);
  const stageRef = useRef(null);
  const mRef = useRef(initial);
  const pending = useRef({});
  const modelCache = useRef(new Map());
  const framed = useRef(false);
  const lastShape = useRef('');
  const reframe = useRef(false);
  const fileRef = useRef(null);
  const modelRef = useRef(null);
  const timeRef = useRef(0);
  mRef.current = m;

  useEffect(() => {
    api.list('color').then((ps) => {
      const seen = new Set();
      setBrand(ps.flatMap((p) => p.colors || []).map((c) => c.hex).filter((h) => h && !seen.has(h) && seen.add(h)).slice(0, 14));
    }).catch(() => {});
  }, []);

  // ---- Saving (merged patches) and the thumbnail for the list ------------------------
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
  const patchAnim = useCallback((p) => patch({ animation: { ...mRef.current.animation, ...p } }), [patch]);
  const takeContent = (server) => {
    changed.current = true;
    const next = {
      ...mRef.current,
      items: mRef.current.items.map((it) => { const x = server.items.find((y) => y.id === it.id); return { ...it, content: x?.content ?? null, faces: x?.faces || {} }; }),
      thumb: server.thumb,
    };
    mRef.current = next;
    setM(next);
  };

  // ---- The stage ------------------------------------------------------------------------
  useEffect(() => {
    if (!holder.current) return undefined;
    const st = new MockupStage(holder.current, {
      onCamera: (camera) => patch({ camera: { ...camera, preset: '' } }),
      onSelect: (itemId) => setSelId(itemId),
      onMove: (itemId, pos) => patchItem(itemId, pos),
    });
    let raf = 0;
    st.onTime = (t) => {
      timeRef.current = t;
      if (!raf) raf = requestAnimationFrame(() => { raf = 0; setTime(timeRef.current); });
    };
    st.setFrame(mRef.current.frame);
    st.setLight(mRef.current.light);
    st.setAnimation(mRef.current.animation);
    st.time = 0;
    stageRef.current = st;
    return () => { cancelAnimationFrame(raf); flushThumb(st); st.dispose(); stageRef.current = null; framed.current = false; lastShape.current = ''; };
  }, [patch, patchItem, flushThumb]);

  const lookFrom = useCallback((name) => {
    const st = stageRef.current;
    if (!st) return;
    st.view(name);
    patch({ camera: { ...st.getCamera(), preset: name } });
  }, [patch]);

  const items = useMemo(() => m.items || [], [m.items]);
  const sel = items.find((it) => it.id === selId) || items[0] || null;
  const anim = m.animation;
  // What is built, and where it stands (not the pictures on the screens).
  const structKey = JSON.stringify([items.map((it) => [it.id, it.device, it.modelId, it.landscape, it.lying, it.size, it.x, it.z, it.rotY, it.logo, it.hidden, it.obj]),
    models.map((x) => [x.id, x.screenMesh, x.screenTurn, x.screenFlip, x.hinge])]);
  const objShape = (o) => (o ? [o.type, o.size, o.landscape, o.layout, o.placement, o.frame, o.mat, o.w, o.h, o.d].join(',') : '');
  const shapeKey = items.map((it) => `${it.id}:${it.device}:${it.modelId}:${it.landscape}:${it.lying}:${it.size}:${objShape(it.obj)}`).join('|');
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
          if (it.device === 'object') {
            st.setItem(it.id, { key: JSON.stringify(['obj', it.obj]), build: () => buildObject(it.obj), ...pos, screenOpts: {} });
            continue;
          }
          if (it.device !== 'custom') {
            st.setItem(it.id, { key: JSON.stringify(['old', it.device, it.landscape, it.lying]), build: () => buildDevice(it.device, it), ...pos, screenOpts: {} });
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
          }
          if (!alive) return;
          const screenMesh = model.screenMesh || guessScreen(loaded.meshes);
          const { joints, guess } = modelJoints(loaded.object, screenMesh);
          setInfo((x) => (x[model.id] ? x : { ...x, [model.id]: { meshes: loaded.meshes, joints } }));
          // First time: remember the guessed screen part and hinge with the model.
          const auto = {};
          if (!model.screenMesh && screenMesh) auto.screenMesh = screenMesh;
          if (model.hinge === null) auto.hinge = guess ? guessHinge(loaded.object, guess, screenMesh) : false;
          if (Object.keys(auto).length) {
            Object.assign(model, auto); // don't guess twice while the save is on its way
            api.updateMockupModel(model.id, auto).then((x) => setModels((ms) => ms.map((y) => (y.id === x.id ? x : y)))).catch(() => {});
          }
          st.setItem(it.id, {
            key: JSON.stringify(['custom', model.id, screenMesh, it.size]), build: () => buildModel(loaded.object, { screenMesh, size: it.size }), ...pos,
            screenOpts: { turn: (model.screenTurn || 0) / 90, mirror: model.screenFlip, flipV: model.format !== 'usdz' },
          });
          st.setItemParts(it.id, { hidden: it.hidden, logo: it.logo });
          st.setItemHinge(it.id, model.hinge || null);
          st.setItemTimeline(it.id, { hingeAngle: it.hingeAngle, hingeKeys: it.keys?.hinge || [], videoStart: it.videoStart, sound: it.sound, volume: it.volume });
        }
        if (!alive) return;
        st.select(selId);
        if (!framed.current) {
          framed.current = true;
          if (cur.camera?.position) st.setCamera(cur.camera);
          else lookFrom(cur.camera?.preset || 'three-right');
          // Camera moves made before the timeline: turn them into camera keyframes.
          const a = cur.animation;
          if (LEGACY_MOVES[a.preset] && !a.camera.length) patchAnim({ preset: 'none', camera: st.cameraMove(LEGACY_MOVES[a.preset], a.duration) });
          st.seek(0);
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
  }, [structKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Pictures on the screens, how they fit, the per-device timeline.
  const contentKey = JSON.stringify(items.map((it) => [it.id, it.content?.file || '']));
  useEffect(() => {
    const st = stageRef.current; const cur = mRef.current;
    if (!st || !cur) return;
    if (cur.items.some((it) => it.content)) setLoading('Loading…');
    Promise.all(cur.items.map((it) => st.setItemContent(it.id, it.content ? { url: mockupFileUrl(cur, it.content.file), kind: it.content.kind } : null)))
      .then(() => {
        const lens = {};
        for (const it of cur.items) { const v = st.items.get(it.id)?.content?.video; if (v?.duration) lens[it.id] = v.duration; }
        setVideoLen(lens);
        st.seek(timeRef.current);
        refreshThumb();
      })
      .catch((e) => toast(e.message, 'error'))
      .finally(() => setLoading(''));
  }, [contentKey, structKey, toast, refreshThumb]);
  const fitKey = JSON.stringify(items.map((it) => [it.id, it.fit, it.adjust]));
  useEffect(() => {
    const st = stageRef.current;
    if (!st) return;
    for (const it of mRef.current.items) st.setItemFit(it.id, it.fit, it.adjust);
  }, [fitKey, structKey]);
  // An object's other printed faces (a card's back, a box's sides …), each with its own picture and fit.
  const facesKey = JSON.stringify(items.map((it) => [it.id, it.faces]));
  useEffect(() => {
    const st = stageRef.current; const cur = mRef.current;
    if (!st) return;
    const jobs = [];
    for (const it of cur.items) {
      if (it.device !== 'object') continue;
      for (const [face] of OBJECTS[it.obj?.type]?.faces || []) {
        if (face === 'front') continue;
        const f = it.faces?.[face];
        jobs.push(st.setItemFace(it.id, face, f ? { url: mockupFileUrl(cur, f.file), kind: f.kind, fit: f.fit, adjust: f.adjust } : null));
      }
    }
    Promise.all(jobs).then(() => refreshThumb()).catch((e) => toast(e.message, 'error'));
  }, [facesKey, structKey, toast, refreshThumb]);
  const tlKey = JSON.stringify(items.map((it) => [it.id, it.hingeAngle, it.keys, it.videoStart, it.sound, it.volume]));
  useEffect(() => {
    const st = stageRef.current;
    if (!st) return;
    for (const it of mRef.current.items) st.setItemTimeline(it.id, { hingeAngle: it.hingeAngle, hingeKeys: it.keys?.hinge || [], videoStart: it.videoStart, sound: it.sound, volume: it.volume });
  }, [tlKey, structKey]);
  const animKey = JSON.stringify(anim);
  useEffect(() => { stageRef.current?.setAnimation(mRef.current.animation); }, [animKey]);
  useEffect(() => {
    const st = stageRef.current;
    st?.select(selId);
    setParts(st && sel?.device === 'custom' ? st.parts(sel.id) : []);
  }, [selId]); // eslint-disable-line react-hooks/exhaustive-deps
  const bgKey = JSON.stringify(m.background);
  useEffect(() => { stageRef.current?.setBackground(mRef.current.background); }, [bgKey]);
  const lightKey = JSON.stringify(m.light);
  useEffect(() => { stageRef.current?.setLight(mRef.current.light); }, [lightKey]);
  // Your HDRI: loaded when it's picked (the stage keeps it; until then the studio light stands in).
  const hdriId = m.light.setup === 'hdri' ? m.light.hdri : '';
  const hdriLoads = useRef(new Map());
  useEffect(() => {
    const st = stageRef.current;
    const h = hdris.find((x) => x.id === hdriId);
    if (!st || !h || st.hdris.has(h.id)) return;
    if (!hdriLoads.current.has(h.id)) {
      setLoading('Loading the HDRI…');
      hdriLoads.current.set(h.id, loadHdriTexture(mockupHdriUrl(h), h.format)
        .then((tex) => { st.addHdri(h.id, tex, analyseHdri(tex)); })
        .catch((e) => { hdriLoads.current.delete(h.id); toast(`Couldn’t load the HDRI: ${e.message}`, 'error'); })
        .finally(() => setLoading('')));
    }
  }, [hdriId, hdris, toast]);
  useEffect(() => {
    const st = stageRef.current; const cur = mRef.current;
    if (!st) return;
    st.setFrame(cur.frame);
    if (framed.current && cur.camera?.preset) lookFrom(cur.camera.preset);
  }, [m.frame]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Timeline -------------------------------------------------------------------------
  const seek = (t) => { stageRef.current?.seek(t); timeRef.current = t; setTime(t); };
  const play = () => { const st = stageRef.current; if (!st) return; st.play(); setPlaying(true); };
  const pause = () => { const st = stageRef.current; if (!st) return; st.stop(); setPlaying(false); };
  useEffect(() => () => stageRef.current?.stop(), []);
  const hingeOf = (it) => (it.device === 'custom' ? models.find((x) => x.id === it.modelId)?.hinge : null);
  const hingeValue = (it) => (it.keys?.hinge?.length ? valueAt(it.keys.hinge, time, anim.easing) : it.hingeAngle);
  const setHinge = (it, v) => {
    const val = Math.round(v);
    if (it.keys?.hinge?.length) patchItem(it.id, { keys: { ...it.keys, hinge: putKey(it.keys.hinge, { t: r2(time), v: val }) } });
    else patchItem(it.id, { hingeAngle: val });
  };
  const tracks = [
    { id: 'camera', kind: 'camera', label: 'Camera', keys: anim.camera.map((k) => ({ t: k.t })) },
    ...items.filter((it) => hingeOf(it)).map((it) => ({ id: `hinge:${it.id}`, kind: 'hinge', label: `${itemLabel(it, models)} · open`, keys: it.keys.hinge })),
    ...items.filter((it) => it.content?.kind === 'video').map((it) => ({
      id: `video:${it.id}`, kind: 'video', label: `${itemLabel(it, models)} · video`, start: it.videoStart, length: videoLen[it.id] || 0, sound: it.sound, volume: it.volume,
    })),
  ];
  const itemOfTrack = (trackId) => items.find((it) => it.id === trackId.split(':')[1]);
  const onAddKey = (trackId) => {
    const st = stageRef.current;
    if (trackId === 'camera') {
      if (!st) return;
      patchAnim({ camera: putKey(anim.camera, { t: r2(time), ...st.getCamera() }) });
      toast(`Camera key at ${time.toFixed(1)} s`);
    } else {
      const it = itemOfTrack(trackId);
      if (it) patchItem(it.id, { keys: { ...it.keys, hinge: putKey(it.keys.hinge, { t: r2(time), v: Math.round(hingeValue(it)) }) } });
    }
  };
  const onMoveKey = (trackId, index, t) => {
    if (trackId === 'camera') {
      patchAnim({ camera: anim.camera.map((k, i) => (i === index ? { ...k, t } : k)).sort((a, b) => a.t - b.t) });
    } else {
      const it = itemOfTrack(trackId);
      if (it) patchItem(it.id, { keys: { ...it.keys, hinge: it.keys.hinge.map((k, i) => (i === index ? { ...k, t } : k)).sort((a, b) => a.t - b.t) } });
    }
    seek(t);
  };
  const onDeleteKey = (trackId, index) => {
    if (trackId === 'camera') patchAnim({ camera: anim.camera.filter((_, i) => i !== index) });
    else {
      const it = itemOfTrack(trackId);
      if (it) patchItem(it.id, { keys: { ...it.keys, hinge: it.keys.hinge.filter((_, i) => i !== index) } });
    }
  };
  const onMotion = (preset) => {
    patchAnim({ preset });
    const st = stageRef.current;
    if (st && LOOPING.has(preset) && !anim.camera.length) {
      const cam = st.fitMotion(preset);
      if (cam) patch({ camera: { ...cam, preset: '' } });
    }
  };
  const onCameraMove = (kind) => {
    const st = stageRef.current;
    if (!st) return;
    const before = anim.camera;
    patchAnim({ camera: st.cameraMove(kind, anim.duration) });
    seek(0);
    toast(`${CAMERA_MOVES[kind]} — ${anim.duration} s`, 'ok', before.length ? { label: 'Undo', onClick: () => patchAnim({ camera: before }) } : undefined);
  };
  const onDuration = (d) => {
    const k = d / anim.duration;
    // Keys keep their place relative to the length.
    patchAnim({ duration: d, camera: anim.camera.map((x) => ({ ...x, t: r2(x.t * k) })) });
    patchItems((list) => list.map((it) => (it.keys?.hinge?.length ? { ...it, keys: { ...it.keys, hinge: it.keys.hinge.map((x) => ({ ...x, t: r2(x.t * k) })) } } : it)));
    if (time > d) seek(d);
  };

  // ---- Devices -----------------------------------------------------------------------
  const addModel = (modelId) => {
    const b = stageRef.current?.bounds;
    const x = b && items.length ? b.max.x + 18 : 0;
    const it = { id: newId(), device: 'custom', modelId, x: Math.round(x * 10) / 10, z: 0, rotY: 0, fit: 'cover', adjust: { scale: 1, x: 0, y: 0 }, size: 25 };
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
  const pickModel = (modelId) => { if (sel) patchItem(sel.id, { device: 'custom', modelId, size: sel.device === 'custom' ? sel.size : 25 }, true); };
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

  // ---- Screen content (an object: its printed faces) ---------------------------------------
  // The front is the device's content; an object's other faces go into its own slots.
  const objFaces = sel?.device === 'object' ? OBJECTS[sel.obj?.type]?.faces || [] : [];
  const curFace = objFaces.some(([k]) => k === face) ? face : 'front';
  const faceOf = (it, f = curFace) => (it?.device === 'object' && f !== 'front' ? f : null);
  const upload = async (file, f = curFace) => {
    if (!file || !sel) return;
    setLoading('Uploading…');
    const slot = faceOf(sel, f);
    try { takeContent(await (slot ? api.setMockupSlot(id, slot, file, sel.id) : api.setMockupContent(id, file, sel.id))); } catch (e) { toast(`Upload failed: ${e.message}`, 'error'); setLoading(''); }
  };
  const fromApp = async (source) => {
    setPicking(false);
    if (!sel) return;
    setLoading('Loading…');
    const slot = faceOf(sel);
    try { takeContent(await (slot ? api.importMockupSlot(id, slot, source, sel.id) : api.importMockupContent(id, source, sel.id))); } catch (e) { toast(e.message, 'error'); setLoading(''); }
  };
  const clearContent = async (f = curFace) => {
    if (!sel) return;
    const slot = faceOf(sel, f);
    try { takeContent(await (slot ? api.clearMockupSlot(id, slot, sel.id) : api.clearMockupContent(id, sel.id))); } catch (e) { toast(e.message, 'error'); }
  };
  // What's on a face, and how it fits: { content, fit, adjust }.
  const faceInfo = (it, f) => (faceOf(it, f) ? { content: it.faces?.[f] || null, fit: it.faces?.[f]?.fit || 'cover', adjust: it.faces?.[f]?.adjust }
    : { content: it?.content || null, fit: it?.fit, adjust: it?.adjust });
  const setFaceFit = (it, f, fit, adjust) => {
    if (faceOf(it, f)) patchItem(it.id, { faces: { ...it.faces, [f]: { ...it.faces[f], fit, adjust } } });
    else patchItem(it.id, { fit, adjust });
  };
  const addObject = (type) => {
    const b = stageRef.current?.bounds;
    const x = b && items.length ? b.max.x + 15 : 0;
    const it = { id: newId(), device: 'object', obj: defaultObject(type), x: Math.round(x * 10) / 10, z: 0, rotY: 0, fit: 'contain', adjust: { scale: 1, x: 0, y: 0 } };
    reframe.current = true;
    patchItems((list) => [...list, it], true);
    setSelId(it.id);
    setFace('front');
  };
  const setObj = (p) => { if (sel?.device === 'object') patchItem(sel.id, { obj: { ...sel.obj, ...p } }); };

  // ---- Imported models ------------------------------------------------------------------
  const model = sel?.device === 'custom' ? models.find((x) => x.id === sel.modelId) || null : null;
  const modelInfo = model ? info[model.id] : null;
  const importModel = async (file, useIt = true) => {
    if (!file) return;
    setLoading('Importing the 3D model…');
    try {
      const mdl = await api.addMockupModel(file);
      setModels((ms) => [...ms, mdl]);
      if (useIt && sel) patchItem(sel.id, { device: 'custom', modelId: mdl.id, size: 25 }, true);
      toast(`“${mdl.name}” imported — pick its screen part if it doesn’t show your picture`);
    } catch (e) { toast(`Import failed: ${e.message}`, 'error'); } finally { setLoading(''); }
  };
  const patchModel = async (p) => {
    if (!model) return;
    changed.current = true;
    setModels((ms) => ms.map((x) => (x.id === model.id ? { ...x, ...p } : x)));
    try { await api.updateMockupModel(model.id, p); } catch (e) { toast(`Could not save: ${e.message}`, 'error'); }
  };
  const logoParts = parts.filter((p) => p.logo);

  // ---- Your own HDRIs ------------------------------------------------------------------
  const hdriInput = useRef(null);
  const importHdri = async (file) => {
    if (!file) return;
    const format = { hdr: 'hdr', exr: 'exr', jpg: 'jpg', jpeg: 'jpg', png: 'png', webp: 'webp', avif: 'avif' }[(file.name.split('.').pop() || '').toLowerCase()];
    if (!format) { toast('Choose an .hdr or .exr file, or a panorama picture (.jpg / .png / .webp, 2:1).', 'error'); return; }
    setLoading('Reading the HDRI…');
    const local = URL.createObjectURL(file);
    try {
      // Read it here first: a broken file never gets uploaded, and the preview comes for free.
      const tex = await loadHdriTexture(local, format);
      const info = analyseHdri(tex);
      const thumb = await new Promise((r) => { hdriPreview(tex, info.intensity).toBlob(r, 'image/webp', 0.85); });
      setLoading('Uploading the HDRI…');
      let h = await api.addMockupHdri(file);
      if (thumb) h = await api.setMockupHdriThumb(h.id, thumb).catch(() => h);
      stageRef.current?.addHdri(h.id, tex, info);
      setHdris((hs) => [...hs, h]);
      setLight({ setup: 'hdri', hdri: h.id });
      toast(`“${h.name}” imported — it lights the scene now`);
    } catch (e) {
      toast(`Couldn’t use that HDRI: ${e.message}`, 'error');
    } finally { URL.revokeObjectURL(local); setLoading(''); }
  };

  // ---- Export -------------------------------------------------------------------------
  const openExport = async (initialTarget = 'image') => {
    const [w, h] = exportSize(mRef.current.frame, 1920);
    const formats = await videoFormats(w, h).catch(() => []);
    pause();
    setExporting({ initial: initialTarget, formats });
  };
  const exportTargets = (formats) => {
    const aspect = FRAMES[m.frame] || 16 / 9;
    const sizes = (list) => list.map((s) => { const [w, h] = exportSize(m.frame, s.long); return { label: s.label, w, h }; });
    const withSound = items.filter((it) => it.content?.kind === 'video' && it.sound).length;
    const keyed = anim.camera.length || items.some((it) => it.keys?.hinge?.length) || anim.preset !== 'none';
    return [
      {
        key: 'image', label: 'Image', kind: 'image', aspect, sizes: sizes(IMAGE_SIZES), defaultSize: 3,
        note: keyed ? `The frame at the playhead (${time.toFixed(1)} s).` : null,
        backgrounds: [{ key: 'scene', label: 'As in the scene' }, { key: 'transparent', label: 'Transparent' }, { key: 'white', label: 'White', swatch: '#fff' }, { key: 'black', label: 'Black', swatch: '#000' }],
        allowColor: true, formats: ['png', 'jpg', 'webp'], maxSize: stageRef.current?.maxExport() || 8192,
      },
      {
        key: 'video', label: 'Video', kind: 'video', aspect, sizes: sizes(VIDEO_SIZES), defaultSize: 1,
        backgrounds: [{ key: 'scene', label: 'As in the scene' }, { key: 'white', label: 'White', swatch: '#fff' }, { key: 'black', label: 'Black', swatch: '#000' }],
        allowColor: true, formats, fps: [24, 30, 60], duration: anim.duration, maxSize: 3840,
        note: `The timeline, ${anim.duration} s${keyed ? '' : ' (nothing animated yet — the view stays still)'}${withSound ? ` · with sound from ${withSound} screen video${withSound > 1 ? 's' : ''}` : ''}.`,
      },
    ];
  };
  const runExport = async (target, o, { onProgress, signal }) => {
    const st = stageRef.current;
    if (!st) throw new Error('The 3D view isn’t ready');
    const override = o.background === 'scene' ? null : o.background === 'color' ? { mode: 'color', color: o.color } : BACKGROUNDS[o.background];
    if (target.kind === 'video') {
      pause();
      const bg = override || (mRef.current.background.mode === 'transparent' ? BACKGROUNDS.black : null);
      const audio = mRef.current.items.filter((it) => it.content?.kind === 'video' && it.sound)
        .map((it) => ({ url: mockupFileUrl(mRef.current, it.content.file), start: it.videoStart, volume: it.volume }));
      return recordVideo(st, { width: o.width, height: o.height, fps: o.fps, duration: anim.duration, format: o.format, background: bg, audio, onProgress, signal });
    }
    return st.toBlob(o.width, o.height, o.mime, o.quality, override);
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

  const bg = m.background;
  const light = m.light;
  const setBg = (p) => patch({ background: { ...bg, ...p } });
  const setLight = (p) => patch({ light: { ...light, ...p } });
  const addItems = [
    ...models.map((x) => ({ label: x.name, icon: <Box size={15} />, onClick: () => addModel(x.id) })),
    ...(models.length ? [{ separator: true }] : []),
    ...Object.entries(OBJECTS).map(([k, o]) => { const I = OBJECT_ICON[k]; return { label: o.label, icon: <I size={15} />, onClick: () => addObject(k) }; }),
    { separator: true },
    { label: 'Import a 3D model…', icon: <UploadCloud size={15} />, onClick: () => { modelRef.current.dataset.add = '1'; modelRef.current.click(); } },
  ];
  const hinge = sel ? hingeOf(sel) : null;
  const vlen = sel ? videoLen[sel.id] : 0;

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
        <div className="mke-main">
          <div className={`mke-stage ${bg.mode === 'transparent' ? 'transparent' : ''}`} style={{ '--mk-aspect': FRAMES[m.frame] || 16 / 9 }}>
            <div className="mke-holder" ref={holder} />
            {loading && <div className="mke-loading">{loading}</div>}
            {sel && !sel.content && !loading && !playing && (
              <div className="mke-empty">
                <button type="button" className="btn btn-sm" onClick={() => { setFace('front'); fileRef.current?.click(); }}><UploadCloud size={14} /> {sel.device === 'object' ? 'Upload your design' : 'Upload a picture or video'}</button>
                <button type="button" className="btn btn-sm" onClick={() => setPicking(true)}><Library size={14} /> From the app</button>
              </div>
            )}
            <div className="mke-views">
              {Object.entries(VIEW_LABELS).map(([k, label]) => (
                <button key={k} type="button" className={m.camera?.preset === k ? 'on' : ''} onClick={() => lookFrom(k)}>{label}</button>
              ))}
            </div>
          </div>
          <Timeline
            duration={anim.duration} time={time} playing={playing} tracks={tracks}
            motion={LOOPING.has(anim.preset) ? anim.preset : 'none'} motions={MOTIONS_LABELS} easing={anim.easing} cameraMoves={CAMERA_MOVES}
            onSeek={seek} onPlay={play} onPause={pause} onDuration={onDuration} onMotion={onMotion} onEasing={(e) => patchAnim({ easing: e })} onCameraMove={onCameraMove}
            onAddKey={onAddKey} onMoveKey={onMoveKey} onDeleteKey={onDeleteKey}
            onVideoStart={(trackId, s) => { const it = itemOfTrack(trackId); if (it) { patchItem(it.id, { videoStart: s }); stageRef.current?.setItemTimeline(it.id, { videoStart: s }); stageRef.current?.syncVideos(time, playing); } }}
            onSound={(trackId, on) => { const it = itemOfTrack(trackId); if (it) { patchItem(it.id, { sound: on }); stageRef.current?.setItemTimeline(it.id, { sound: on }); } }}
            onVolume={(trackId, v) => { const it = itemOfTrack(trackId); if (it) patchItem(it.id, { volume: v }); }}
          />
        </div>

        <aside className="mke-panel">
          <section>
            <h3>Scene <span className="mke-count">{items.length} {items.length === 1 ? 'device' : 'devices'}</span></h3>
            <div className="mke-items">
              {items.map((it) => {
                const I = itemIcon(it);
                return (
                  <button key={it.id} type="button" className={`mke-item ${sel?.id === it.id ? 'on' : ''}`} onClick={() => setSelId(it.id)}>
                    <I size={15} /><span>{itemLabel(it, models)}</span>{it.content && <i className="mke-item-dot" title="Has a picture" />}
                  </button>
                );
              })}
              <Menu title="Add" trigger={<button type="button" className="mke-item mke-add" aria-label="Add a device or object"><Plus size={15} /><span>Add</span></button>} items={addItems} />
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
              <h3>{sel.device === 'object' ? itemLabel(sel, models) : items.length > 1 ? `Device · ${itemLabel(sel, models)}` : 'Device'}</h3>
              {sel.device === 'object' && <ObjectSettings o={sel.obj} set={setObj} brand={brand} />}
              {sel.device !== 'custom' && sel.device !== 'object' && (
                <div className="mke-legacy">
                  The built-in devices were removed — this one stays as a plain screen until you pick one of your 3D models.
                  {!models.length && <> Import one first.</>}
                </div>
              )}
              {sel.device !== 'object' && <div className="mke-models">
                {models.map((x) => (
                  <button key={x.id} type="button" className={sel.device === 'custom' && sel.modelId === x.id ? 'on' : ''} onClick={() => pickModel(x.id)} title={x.name}><Box size={16} /><span>{x.name}</span></button>
                ))}
                <button type="button" className="mke-import" onClick={() => { delete modelRef.current.dataset.add; modelRef.current.click(); }}><UploadCloud size={16} /><span>Import 3D…</span></button>
              </div>}
              {sel.device === 'custom' && model && (
                <div className="mke-model">
                  {modelInfo?.joints?.length > 0 && (
                    <div className="mke-hinge">
                      <label className="mke-field"><span><DoorOpen size={13} /> Opens / closes with</span>
                        <select className="input" value={model.hinge?.node || ''} onChange={(e) => {
                          const node = e.target.value;
                          const obj = modelCache.current.get(model.id)?.object;
                          patchModel({ hinge: node ? (obj ? guessHinge(obj, node, model.screenMesh) : { node, axis: 'x', invert: false }) : false });
                        }}>
                          <option value="">— nothing —</option>
                          {modelInfo.joints.map((n) => <option key={n} value={n}>{n}</option>)}
                        </select>
                      </label>
                      {hinge && (
                        <>
                          <label className="mke-range">Open <Range min="-150" max="150" value={Math.round(hingeValue(sel))} onChange={(e) => setHinge(sel, Number(e.target.value))} /> <span>{Math.round(hingeValue(sel))}°</span></label>
                          <div className="mke-row mke-axis">
                            <span className="hint">Axis</span>
                            <div className="segmented segmented-sm">
                              {['x', 'y', 'z'].map((a) => <button key={a} type="button" className={hinge.axis === a ? 'on' : ''} onClick={() => patchModel({ hinge: { ...hinge, axis: a } })}>{a.toUpperCase()}</button>)}
                            </div>
                            <button type="button" className={`btn btn-sm ${hinge.invert ? 'btn-on' : ''}`} onClick={() => patchModel({ hinge: { ...hinge, invert: !hinge.invert } })}><FlipHorizontal size={13} /> Flip</button>
                          </div>
                          {sel.keys.hinge.length > 0 && <div className="hint">Keyframed — the slider sets a key at the playhead.</div>}
                        </>
                      )}
                    </div>
                  )}
                  <label className="mke-field">Screen part
                    <select className="input" value={model.screenMesh || ''} onChange={(e) => patchModel({ screenMesh: e.target.value })}>
                      <option value="">— none —</option>
                      {(modelInfo?.meshes || []).map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </label>
                  <div className="mke-row">
                    <button type="button" className="btn btn-sm" onClick={() => patchModel({ screenTurn: ((model.screenTurn || 0) + 90) % 360 })}><RotateCw size={14} /> Turn picture</button>
                    <button type="button" className={`btn btn-sm ${model.screenFlip ? 'btn-on' : ''}`} onClick={() => patchModel({ screenFlip: !model.screenFlip })}><FlipHorizontal size={14} /> Mirror</button>
                  </div>
                  <label className="mke-range">Size <Range min="2" max="200" value={sel.size} onChange={(e) => patchItem(sel.id, { size: Number(e.target.value) })} /> <span>{sel.size} cm</span></label>
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
              {sel.device === 'custom' && !model && <div className="hint">This model is gone (see Trash) — pick another one.</div>}
              {items.length > 1 && (
                <label className="mke-range">Turn <Range min="-180" max="180" value={sel.rotY} onChange={(e) => patchItem(sel.id, { rotY: Number(e.target.value) })} /> <span>{sel.rotY}°</span></label>
              )}
            </section>
          )}

          {sel?.device === 'object' && (
            <section>
              <h3>Print</h3>
              <div className="m2e-slots">
                {objFaces.map(([k, label]) => {
                  const c = faceInfo(sel, k).content;
                  return (
                    <div key={k} className={`m2e-slot ${curFace === k ? 'on' : ''}`} onClick={() => setFace(k)}>
                      <span className="m2e-thumb">{c ? (c.kind === 'video' ? <video src={mockupFileUrl(m, c.file)} muted /> : <img src={mockupFileUrl(m, c.file)} alt="" />) : <ImagePlus size={14} />}</span>
                      <span className="m2e-slot-name">{label}</span>
                      {c && <button type="button" className="icon-btn" onClick={(e) => { e.stopPropagation(); clearContent(k); }} aria-label={`Remove from ${label}`}><X size={13} /></button>}
                    </div>
                  );
                })}
              </div>
              <div className="m2e-slot-actions">
                {objFaces.length > 1 && <div className="hint">{objFaces.find(([k]) => k === curFace)?.[1]}</div>}
                <div className="mke-row">
                  <button className="btn btn-sm" onClick={() => fileRef.current?.click()}><UploadCloud size={14} /> Upload</button>
                  <button className="btn btn-sm" onClick={() => setPicking(true)}><Library size={14} /> From the app</button>
                </div>
                {faceInfo(sel, curFace).content && (
                  <>
                    <button type="button" className="btn btn-sm mke-fit-btn" onClick={() => setFitting(true)}><Crop size={14} /> Position &amp; size…</button>
                    <div className="segmented mke-seg" role="group" aria-label="Fit">
                      <button type="button" className={faceInfo(sel, curFace).fit === 'cover' ? 'on' : ''} onClick={() => setFaceFit(sel, curFace, 'cover', { scale: 1, x: 0, y: 0 })}>Fill</button>
                      <button type="button" className={faceInfo(sel, curFace).fit === 'contain' ? 'on' : ''} onClick={() => setFaceFit(sel, curFace, 'contain', { scale: 1, x: 0, y: 0 })}>Show whole</button>
                    </div>
                  </>
                )}
                <div className="hint">A PNG with transparency prints on the {sel.obj?.type === 'mug' ? 'mug' : 'paper'} colour — a logo alone looks printed.</div>
              </div>
            </section>
          )}

          {sel && sel.device !== 'object' && (
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
                </>
              )}
              {sel.content?.kind === 'video' && (
                <div className="mke-video">
                  <label className="mke-range">Starts at
                    <Range min="0" max={Math.max(0.1, vlen || 0)} step="0.1" value={Math.min(sel.videoStart, vlen || sel.videoStart)} onChange={(e) => { const s = Number(e.target.value); patchItem(sel.id, { videoStart: s }); stageRef.current?.setItemTimeline(sel.id, { videoStart: s }); stageRef.current?.syncVideos(time, playing); }} />
                    <span>{sel.videoStart.toFixed(1)} s</span>
                  </label>
                  <div className="mke-row">
                    <button type="button" className={`btn btn-sm ${sel.sound ? 'btn-on' : ''}`} onClick={() => { patchItem(sel.id, { sound: !sel.sound }); stageRef.current?.setItemTimeline(sel.id, { sound: !sel.sound }); }}>
                      {sel.sound ? <Volume2 size={14} /> : <VolumeX size={14} />} Sound {sel.sound ? 'on' : 'off'}
                    </button>
                    {sel.sound && <Range className="mke-vol" min="0" max="1" step="0.05" value={sel.volume} onChange={(e) => patchItem(sel.id, { volume: Number(e.target.value) })} aria-label="Volume" />}
                  </div>
                  <div className="hint">The part from {sel.videoStart.toFixed(1)} s plays on the screen during the timeline{sel.sound ? ' — with its sound, also in the exported video' : ''}.</div>
                </div>
              )}
            </section>
          )}

          <section>
            <h3><Sun size={12} style={{ verticalAlign: '-1px' }} /> Light</h3>
            <div className="mke-lights">
              {Object.entries(LIGHT_SETUPS).map(([k, s]) => (
                <button key={k} type="button" className={light.setup === k ? 'on' : ''} onClick={() => setLight({ setup: k })} title={s.note}>
                  <i style={{ background: LIGHT_SWATCH[k] }} /><span>{s.label}</span>
                </button>
              ))}
              {hdris.map((h) => (
                <button key={h.id} type="button" className={light.setup === 'hdri' && light.hdri === h.id ? 'on' : ''} onClick={() => setLight({ setup: 'hdri', hdri: h.id })} title={`${h.name} — your HDRI`}>
                  <i style={h.thumb ? { backgroundImage: `url(${mockupHdriUrl(h, h.thumb)})`, backgroundSize: 'cover', backgroundPosition: 'center' } : { background: '#444' }} /><span>{h.name}</span>
                </button>
              ))}
              <button type="button" className="mke-light-add" onClick={() => hdriInput.current?.click()} title="Your own .hdr / .exr, or a 2:1 panorama picture">
                <i><ImagePlus size={14} /></i><span>Import HDRI…</span>
              </button>
            </div>
            <input ref={hdriInput} type="file" accept=".hdr,.exr,.jpg,.jpeg,.png,.webp,.avif" className="visually-hidden-input" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; importHdri(f); }} />
            <label className="mke-range">Turn light <Range min="-180" max="180" value={light.rotation} onChange={(e) => setLight({ rotation: Number(e.target.value) })} /> <span>{light.rotation}°</span></label>
            <label className="mke-range">Brightness <Range min="0.3" max="2.5" step="0.05" value={light.exposure} onChange={(e) => setLight({ exposure: Number(e.target.value) })} /> <span>{Math.round(light.exposure * 100)}%</span></label>
            <div className="mke-subhead">Shadow</div>
            <div className="segmented mke-seg" role="group" aria-label="Shadow">
              {SHADOW_MODES.map(([k, label]) => <button key={k} type="button" className={light.shadow === k ? 'on' : ''} onClick={() => setLight({ shadow: k })}>{label}</button>)}
            </div>
            {light.shadow !== 'none' && (
              <label className="mke-range">Strength <Range min="0" max="1" step="0.05" value={light.strength} onChange={(e) => setLight({ strength: Number(e.target.value) })} /> <span>{Math.round(light.strength * 100)}%</span></label>
            )}
          </section>

          <section>
            <h3>Background &amp; format</h3>
            <div className="segmented mke-seg" role="group" aria-label="Background">
              {[['transparent', 'None'], ['color', 'Colour'], ['gradient', 'Gradient'], ['environment', 'Room']].map(([k, label]) => (
                <button key={k} type="button" className={bg.mode === k ? 'on' : ''} onClick={() => setBg({ mode: k })} title={k === 'environment' ? 'The light setup’s room / sky (or your HDRI) behind the scene' : undefined}>{label}</button>
              ))}
            </div>
            {bg.mode === 'environment' && (
              <label className="mke-range">Room blur <Range min="0" max="1" step="0.05" value={light.blur ?? 0.35} onChange={(e) => setLight({ blur: Number(e.target.value) })} /> <span>{Math.round((light.blur ?? 0.35) * 100)}%</span></label>
            )}
            {(bg.mode === 'color' || bg.mode === 'gradient') && (
              <div className="mke-colors">
                <label title="Colour"><input type="color" value={bg.color.toLowerCase()} onChange={(e) => setBg({ color: e.target.value.toUpperCase() })} /></label>
                {bg.mode === 'gradient' && <label title="Top colour"><input type="color" value={bg.color2.toLowerCase()} onChange={(e) => setBg({ color2: e.target.value.toUpperCase() })} /></label>}
                {brand.map((hex) => <button key={hex} type="button" className="mke-swatch" style={{ background: hex }} title={hex} onClick={() => setBg({ color: hex.toUpperCase() })} />)}
              </div>
            )}
            <div className="segmented mke-seg mke-frames" role="group" aria-label="Format">
              {Object.keys(FRAMES).map((f) => <button key={f} type="button" className={m.frame === f ? 'on' : ''} onClick={() => patch({ frame: f })}>{f}</button>)}
            </div>
            <div className="hint mke-tip"><Camera size={12} /> Drag to turn, scroll / pinch to zoom, right-drag to move.</div>
          </section>
        </aside>
      </div>

      <input ref={fileRef} type="file" accept="image/*,video/*" className="visually-hidden-input" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; upload(f); }} />
      <input ref={modelRef} type="file" accept=".glb,.gltf,.usdz" className="visually-hidden-input" onChange={async (e) => {
        const f = e.target.files?.[0]; const add = !!e.target.dataset.add; e.target.value = '';
        if (!f) return;
        if (add) {
          setLoading('Importing the 3D model…');
          try { const mdl = await api.addMockupModel(f); setModels((ms) => [...ms, mdl]); addModel(mdl.id); } catch (err) { toast(`Import failed: ${err.message}`, 'error'); } finally { setLoading(''); }
        } else importModel(f);
      }} />
      {picking && <MediaPicker title={sel?.device === 'object' ? 'Print on it' : undefined} onPick={fromApp} onClose={() => setPicking(false)} />}
      {fitting && sel && faceInfo(sel, curFace).content && (() => {
        const fi = faceInfo(sel, curFace);
        return (
          <ScreenFitter title={sel.device === 'object' ? `Position & size · ${objFaces.find(([k]) => k === curFace)?.[1] || 'Print'}` : undefined}
            info={stageRef.current?.screenInfo(sel.id, curFace)}
            src={mockupFileUrl(m, fi.content.file)} kind={fi.content.kind}
            fit={fi.fit} adjust={fi.adjust}
            onChange={({ fit, adjust }) => setFaceFit(sel, curFace, fit, adjust)}
            onClose={() => setFitting(false)} />
        );
      })()}
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

const SWATCHES = (set, key, current, brand) => (
  <div className="mke-colors">
    <label title="Colour"><input type="color" value={(current || '#ffffff').toLowerCase()} onChange={(e) => set({ [key]: e.target.value.toUpperCase() })} /></label>
    {[...OBJECT_COLORS, ...brand.filter((h) => !OBJECT_COLORS.includes(h.toUpperCase()))].slice(0, 14).map((hex) => (
      <button key={hex} type="button" className={`mke-swatch ${current?.toUpperCase() === hex.toUpperCase() ? 'on' : ''}`} style={{ background: hex }} title={hex} onClick={() => set({ [key]: hex.toUpperCase() })} />
    ))}
  </div>
);
const Seg = ({ label, value, options, onChange }) => (
  <div className="mke-optrow">
    {label && <span className="mke-optlabel">{label}</span>}
    <div className="segmented segmented-sm mke-seg" role="group" aria-label={label}>
      {options.map(([k, l]) => <button key={k} type="button" className={value === k ? 'on' : ''} onClick={() => onChange(k)}>{l}</button>)}
    </div>
  </div>
);

/** The settings of a branding object: size, paper, finish, frame, box size, mug colours. */
function ObjectSettings({ o, set, brand }) {
  if (!o) return null;
  const finish = <Seg label="Finish" value={o.finish} options={Object.entries(FINISHES).map(([k, f]) => [k, f.label])} onChange={(v) => set({ finish: v })} />;
  if (o.type === 'card') {
    return (
      <div className="mke-obj">
        <Seg label="Size" value={o.size} options={Object.entries(CARD_SIZES).map(([k, c]) => [k, c.label])} onChange={(v) => set({ size: v })} />
        <Seg label="Shows" value={o.layout} options={[['single', 'One card'], ['pair', 'Front + back'], ['stack', 'Stack']]} onChange={(v) => set({ layout: v })} />
        <Seg label="Format" value={o.landscape ? 'l' : 'p'} options={[['l', 'Landscape'], ['p', 'Portrait']]} onChange={(v) => set({ landscape: v === 'l' })} />
        <Seg label="Corners" value={o.radius > 0 ? 'r' : 's'} options={[['s', 'Square'], ['r', 'Rounded']]} onChange={(v) => set({ radius: v === 'r' ? 3 : 0 })} />
        {finish}
        <div className="mke-subhead">Card colour</div>
        {SWATCHES(set, 'color', o.color, brand)}
      </div>
    );
  }
  if (o.type === 'poster') {
    return (
      <div className="mke-obj">
        <label className="mke-field">Size
          <select className="input" value={o.size} onChange={(e) => set({ size: e.target.value })}>
            {Object.entries(POSTER_SIZES).map(([k, x]) => <option key={k} value={k}>{x.label} · {x.w} × {x.h} cm</option>)}
          </select>
        </label>
        <Seg label="Format" value={o.landscape ? 'l' : 'p'} options={[['p', 'Portrait'], ['l', 'Landscape']]} onChange={(v) => set({ landscape: v === 'l' })} />
        <Seg label="Frame" value={o.frame} options={Object.entries(POSTER_FRAMES).map(([k, f]) => [k, k === 'none' ? 'None' : f.label])} onChange={(v) => set({ frame: v })} />
        {o.frame !== 'none' && <label className="mke-check"><input type="checkbox" checked={o.mat} onChange={(e) => set({ mat: e.target.checked })} /> Passe-partout</label>}
        <Seg label="Hangs" value={o.placement} options={[['wall', 'On the wall'], ['lean', 'Leaning'], ['free', 'Standing']]} onChange={(v) => set({ placement: v })} />
        {o.placement !== 'free' && (<><div className="mke-subhead">Wall</div>{SWATCHES(set, 'color2', o.color2, brand)}</>)}
        <div className="mke-subhead">Paper</div>
        {SWATCHES(set, 'color', o.color, brand)}
      </div>
    );
  }
  if (o.type === 'box') {
    const dim = (k, label) => (
      <label className="mke-field m2e-num">{label}
        <input className="input" type="number" min="1" max="200" step="0.5" value={o[k]} onChange={(e) => set({ [k]: Math.max(0.5, Math.min(200, Number(e.target.value) || 1)) })} />
      </label>
    );
    return (
      <div className="mke-obj">
        <div className="mke-dims">{dim('w', 'Width cm')}{dim('h', 'Height cm')}{dim('d', 'Depth cm')}</div>
        <Seg label="Board" value={o.material} options={Object.entries(BOX_MATERIALS).map(([k, x]) => [k, x.label])} onChange={(v) => set({ material: v })} />
        {finish}
      </div>
    );
  }
  return ( // mug
    <div className="mke-obj">
      <Seg label="Print" value={o.wrap} options={[['front', 'Front'], ['full', 'All round']]} onChange={(v) => set({ wrap: v })} />
      {finish}
      <div className="mke-subhead">Mug</div>
      {SWATCHES(set, 'color', o.color, brand)}
      <div className="mke-subhead">Inside</div>
      {SWATCHES(set, 'color2', o.color2, brand)}
    </div>
  );
}
