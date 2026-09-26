import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft, Play, Printer, MoreHorizontal, UploadCloud, Library, Plus, Music, X, LayoutGrid, List, SquareChartGantt,
  ImagePlus, Image as ImageIcon, CornerDownRight, Copy as CopyIcon, ArrowUp, ArrowDown, Trash2, Clapperboard, PencilRuler,
  PenLine, Scissors, Film, GripVertical, Pencil, Activity, Magnet,
} from 'lucide-react';
import { api, planFileUrl } from '../lib/api.js';
import { useSaver, useRefreshOnReturn, whenSaved } from '../lib/autosave.js';
import { briefingTarget } from '../lib/timing.js';
import {
  ASPECTS, ratioOf, newShot, timing, progress, SHOT_STATUS, statusColor, sectionRuns, segmentColor, sectionLabel, storyboardPath,
  shotsOf, suggestCut, pickVariant, withFrame,
} from '../lib/storyboard.js';
import { detectBeat, nearestBeat } from '../lib/beat.js';
import { useSortable, moveItem } from '../lib/useSortable.js';
import { fmtClock } from '../lib/timing.js';
import { useToast } from '../components/Toast.jsx';
import Menu from '../components/Menu.jsx';
import Animatic from '../components/plan/Animatic.jsx';
import { TargetMeter } from '../components/plan/Timing.jsx';
import ShotCard from '../components/storyboard/ShotCard.jsx';
import ShotList from '../components/storyboard/ShotList.jsx';
import ShotTimeline from '../components/storyboard/ShotTimeline.jsx';
import FramePicker from '../components/storyboard/FramePicker.jsx';
import PrintSheet from '../components/storyboard/PrintSheet.jsx';
import DrawPad from '../components/storyboard/DrawPad.jsx';
import ExportDialog from '../components/ExportDialog.jsx';
import GalleryNameModal from '../components/GalleryNameModal.jsx';

const VIEWS = [
  { key: 'grid', label: 'Grid', icon: LayoutGrid },
  { key: 'list', label: 'List', icon: List },
  { key: 'timeline', label: 'Timeline', icon: SquareChartGantt },
];
const readView = () => { try { return localStorage.getItem('sbView') || 'grid'; } catch { return 'grid'; } };
const rid = () => Math.random().toString(36).slice(2, 8);
const readCut = (blockId) => { try { return localStorage.getItem(`sbCut:${blockId}`) || ''; } catch { return ''; } };
const CUT_LENGTHS = [6, 10, 15, 20, 30];
const VIDEO_SIZES = [{ label: '720p', long: 1280 }, { label: '1080p', long: 1920 }, { label: '4K', long: 3840 }];

/**
 * The storyboard editor — a page of its own (the plan shows a preview). Three
 * views of the same shots: a grid of panels, a list with every field, and a
 * timeline. Frames come from uploads, drops, the clipboard, the plan's
 * moodboards or frames saved on Motion references.
 */
export default function StoryboardEditor() {
  const { planId, blockId } = useParams();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const saver = useSaver();
  const [plan, setPlan] = useState(null);
  const [error, setError] = useState(null);
  const [view, setView] = useState(readView);
  const [selId, setSelId] = useState(null);
  const [flash, setFlash] = useState(null);
  const [busy, setBusy] = useState(false);
  const [picker, setPicker] = useState(null);   // { replace: shotId | null }
  const [animatic, setAnimatic] = useState(null); // { index, autoplay }
  const [printing, setPrinting] = useState(false);
  const [dragOver, setDragOver] = useState(null);
  const [cutId, setCutIdState] = useState(() => readCut(blockId)); // the cutdown shown ('' = the master)
  const [drawing, setDrawing] = useState(null);  // { shotId, over } — the drawing pad
  const [exporting, setExporting] = useState(null); // { formats } — the video export dialog
  const [renamingCut, setRenamingCut] = useState(null);
  const [beatBusy, setBeatBusy] = useState(false);
  const gridRef = useRef(null);
  const listRef = useRef(null);
  const tlRef = useRef(null);
  const planRef = useRef(null);
  const pending = useRef({});
  const uploadRef = useRef(null);
  const replaceRef = useRef(null);
  const audioRef = useRef(null);
  planRef.current = plan;

  useEffect(() => {
    let alive = true;
    saver.flush();
    setPlan(null); setError(null);
    whenSaved().then(() => api.getPlan(planId)).then((p) => { if (alive) setPlan(p); }).catch((e) => { if (alive) setError(e.message); });
    return () => { alive = false; };
  }, [planId, blockId, saver]);
  useRefreshOnReturn(() => api.getPlan(planId), setPlan, saver);
  useEffect(() => { try { localStorage.setItem('sbView', view); } catch { /* ignore */ } }, [view]);

  const block = plan?.blocks?.find((b) => b.id === blockId && b.type === 'storyboard') || null;
  const shots = block?.shots || [];
  const fileUrl = useCallback((rel) => planFileUrl(planRef.current, rel), []);

  // Opened on a shot (?shot=…): scroll there and highlight it briefly.
  const wanted = params.get('shot');
  useEffect(() => {
    if (!wanted || !block) return;
    setSelId(wanted);
    setFlash(wanted);
    requestAnimationFrame(() => document.getElementById(`shot-${wanted}`)?.scrollIntoView({ block: 'center' }));
    const t = setTimeout(() => setFlash(null), 1600);
    setParams({}, { replace: true });
    return () => clearTimeout(t);
  }, [wanted, block, setParams]);

  // ---- Saving: patches merge per storyboard and go out shortly after typing stops.
  const latest = () => planRef.current?.blocks?.find((b) => b.id === blockId) || block;
  const edit = (p, immediate = false) => {
    setPlan((prev) => ({ ...prev, blocks: prev.blocks.map((b) => (b.id === blockId ? { ...b, ...p } : b)) }));
    pending.current = { ...pending.current, ...p };
    saver.schedule('block', () => {
      const patch = pending.current; pending.current = {};
      if (!Object.keys(patch).length) return null;
      return api.updateBlock(planId, blockId, patch).catch((e) => toast(`Could not save: ${e.message}`, 'error'));
    }, { immediate });
  };
  const setShots = (next, immediate = false) => edit({ shots: next }, immediate);
  const patchShot = (sid, p, immediate = false) => setShots((latest()?.shots || []).map((s) => (s.id === sid ? { ...s, ...p } : s)), immediate);
  const insertAt = (i, shot) => { const next = [...(latest()?.shots || [])]; next.splice(i, 0, shot); setShots(next, true); };
  const move = (i, d) => {
    const next = [...(latest()?.shots || [])]; const j = i + d;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    setShots(next, true);
  };
  const remove = (s, i) => {
    setShots((latest()?.shots || []).filter((x) => x.id !== s.id), true);
    toast(`Shot ${i + 1} removed`, 'ok', { label: 'Undo', onClick: () => insertAt(Math.min(i, (latest()?.shots || []).length), s) });
  };

  // ---- Frames: uploads, the library, the clipboard, drops.
  const addFiles = async (fileList, shotId = null) => {
    const imgs = [...(fileList || [])].filter((f) => f.type?.startsWith('image/'));
    if (!imgs.length) return;
    setBusy(true);
    try {
      const up = await api.uploadBlockFiles(planId, blockId, shotId ? imgs.slice(0, 1) : imgs);
      const cur = latest()?.shots || [];
      if (shotId) setShots(cur.map((s) => (s.id === shotId ? withFrame(s, up[0].file) : s)), true);
      else setShots([...cur, ...up.map((u) => newShot({ image: u.file }))], true);
      if (!shotId) toast(`Added ${up.length} shot${up.length === 1 ? '' : 's'}`);
    } catch (e) { toast(`Upload failed: ${e.message}`, 'error'); }
    finally { setBusy(false); }
  };
  const fromLibrary = async (items) => {
    const replace = picker?.replace || null;
    setPicker(null);
    setBusy(true);
    try {
      const files = await api.importStoryboardFrames(planId, blockId, items);
      if (!files.length) { toast('Those pictures are no longer there', 'error'); return; }
      const cur = latest()?.shots || [];
      const ref = (f) => (f.label ? `Reference: ${f.label}` : '');
      if (replace) setShots(cur.map((s) => (s.id === replace ? { ...withFrame(s, files[0].file), notes: s.notes || ref(files[0]) } : s)), true);
      else {
        setShots([...cur, ...files.map((f) => newShot({ image: f.file, notes: ref(f) }))], true);
        toast(`Added ${files.length} shot${files.length === 1 ? '' : 's'}`);
      }
    } catch (e) { toast(`Could not add: ${e.message}`, 'error'); }
    finally { setBusy(false); }
  };
  const setTrack = async (file) => {
    if (!file) return;
    setBusy(true);
    try {
      const [u] = await api.uploadBlockFiles(planId, blockId, [file]);
      edit({ audio: { file: u.file, name: u.name, size: u.size } }, true);
    } catch (e) { toast(`Upload failed: ${e.message}`, 'error'); }
    finally { setBusy(false); }
  };
  const uploadFor = (sid) => { replaceRef.current = sid; uploadRef.current?.click(); };
  const addShot = () => { const s = newShot(); setShots([...(latest()?.shots || []), s], true); setSelId(s.id); };

  // ---- Variants, drawings, recorded voice-overs.
  const takeAlt = (sid, altId) => setShots((latest()?.shots || []).map((s) => (s.id === sid ? pickVariant(s, altId) : s)), true);
  const saveDrawing = async (blob) => {
    const sid = drawing?.shotId;
    const [u] = await api.uploadBlockFiles(planId, blockId, [new File([blob], 'drawing.png', { type: 'image/png' })]);
    const cur = latest()?.shots || [];
    if (sid && cur.some((s) => s.id === sid)) setShots(cur.map((s) => (s.id === sid ? withFrame(s, u.file) : s)), true);
    else { const s = newShot({ image: u.file }); setShots([...cur, s], true); setSelId(s.id); }
    setDrawing(null);
    toast(drawing?.over ? 'Drawing saved — the frame you drew over is kept as a variant' : 'Drawing saved as the frame');
  };
  const saveVoice = async (sid, file, seconds) => {
    try {
      const [u] = await api.uploadBlockFiles(planId, blockId, [file]);
      patchShot(sid, { voice: { file: u.file, duration: seconds, volume: 1 } }, true);
    } catch (e) { toast(`Could not save the recording: ${e.message}`, 'error'); }
  };

  // ---- Cutdowns: shorter versions — shots left out, shorter durations; the rest is shared.
  const setCutId = (v) => { setCutIdState(v); try { localStorage.setItem(`sbCut:${blockId}`, v); } catch { /* ignore */ } };
  const cutsNow = () => latest()?.cutdowns || [];
  const setCuts = (list) => edit({ cutdowns: list }, true);
  const patchCut = (id, p) => setCuts(cutsNow().map((c) => (c.id === id ? { ...c, ...p } : c)));
  const newCut = (seconds) => {
    const c = suggestCut(latest()?.shots || [], seconds);
    setCuts([...cutsNow(), c]);
    setCutId(c.id);
    toast(`${c.name}: every shot shortened evenly — leave shots out to give the others more time`);
  };
  const removeCut = (c) => {
    setCuts(cutsNow().filter((x) => x.id !== c.id));
    setCutId('');
    toast(`“${c.name}” deleted`, 'ok', { label: 'Undo', onClick: () => { setCuts([...cutsNow(), c]); setCutId(c.id); } });
  };
  // A shot's duration — in the cut shown, or the master's.
  const setDuration = (sid, v, now = false) => {
    const c = cutsNow().find((x) => x.id === cutId);
    if (!c) { patchShot(sid, { duration: v }, now); return; }
    edit({ cutdowns: cutsNow().map((x) => (x.id === c.id ? { ...x, durations: { ...x.durations, [sid]: v } } : x)) }, now);
  };
  const toggleInCut = (sid) => {
    const c = cutsNow().find((x) => x.id === cutId);
    if (!c) return;
    patchCut(c.id, { skip: c.skip.includes(sid) ? c.skip.filter((x) => x !== sid) : [...c.skip, sid] });
  };

  // ---- The music's beat: found in the track, cuts snap to it.
  const findBeat = async () => {
    if (!latest()?.audio) return;
    setBeatBusy(true);
    try {
      const b = await detectBeat(fileUrl(latest().audio.file));
      edit({ beat: { bpm: b.bpm, offset: b.offset, snap: true, auto: true } }, true);
      toast(`${b.bpm} BPM${b.confidence < 0.25 ? ' — not very sure; set the tempo yourself if it’s off' : ''}`);
    } catch (e) { toast(`Couldn’t find the beat: ${e.message}`, 'error'); }
    finally { setBeatBusy(false); }
  };
  const setBeat = (p) => { const b = latest()?.beat; edit({ beat: b ? { ...b, ...p, auto: false } : null }, true); };
  // Every cut onto the nearest beat (at least a beat long) — in the cut shown.
  const cutsOnBeat = () => {
    const b = latest()?.beat;
    if (!b?.bpm) return;
    const step = 60 / b.bpm;
    const c = cutsNow().find((x) => x.id === cutId);
    const list = shotsOf(latest()?.shots || [], c);
    let at = 0;
    const durs = {};
    for (const s of list) {
      let end = nearestBeat(b, at + (Number(s.duration) || 0));
      if (end < at + step * 0.5) end = nearestBeat(b, at + step);
      durs[s.id] = Math.max(0.1, Math.round((end - at) * 100) / 100);
      at = end;
    }
    if (c) edit({ cutdowns: cutsNow().map((x) => (x.id === c.id ? { ...x, durations: { ...x.durations, ...durs } } : x)) }, true);
    else setShots((latest()?.shots || []).map((s) => (durs[s.id] != null ? { ...s, duration: durs[s.id] } : s)), true);
    toast('Every cut is on a beat now');
  };


  // Moving a shot: indexes of `list` (all shots, or the cut's) → the master order.
  const reorderIds = (list) => (from, to) => {
    const all = latest()?.shots || [];
    const f = all.findIndex((x) => x.id === list[from]); const t = all.findIndex((x) => x.id === list[to]);
    if (f !== -1 && t !== -1 && f !== t) setShots(moveItem(all, f, t), true);
  };

  // ---- The animatic as a video file.
  const openVideo = async () => {
    const r = ratioOf(latest()?.aspect);
    const [w, h] = r >= 1 ? [1920, Math.round(1920 / r)] : [Math.round(1920 * r), 1920];
    const { videoFormats } = await import('../lib/mockup3d/video.js');
    setExporting({ formats: await videoFormats(w, h).catch(() => []) });
  };
  const runVideo = async (_t, o, { onProgress, signal }) => {
    const { renderAnimatic } = await import('../lib/animaticVideo.js');
    const b = latest();
    const c = (b?.cutdowns || []).find((x) => x.id === cutId);
    return renderAnimatic({
      shots: shotsOf(b?.shots || [], c), fileUrl, width: o.width, height: o.height, fps: o.fps, format: o.format,
      audioUrl: b?.audio ? fileUrl(b.audio.file) : null, captions: o.captions === 'on', supers: o.supers !== 'off',
      numbers: o.numbers === 'on', music: o.music ?? 1, onProgress, signal,
    });
  };

  useEffect(() => {
    const onPaste = (e) => {
      if (picker || printing || animatic) return;
      const files = [...(e.clipboardData?.files || [])].filter((f) => f.type.startsWith('image/'));
      if (!files.length) return;
      e.preventDefault();
      addFiles(files);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }); // re-bound each render: sees the current dialogs
  const dropProps = (key, onFiles) => ({
    onDragOver: (e) => { if ([...(e.dataTransfer?.types || [])].includes('Files')) { e.preventDefault(); e.stopPropagation(); setDragOver(key); } },
    onDragLeave: (e) => { if (e.target === e.currentTarget) setDragOver(null); },
    onDrop: (e) => { e.preventDefault(); e.stopPropagation(); setDragOver(null); onFiles(e.dataTransfer.files); },
  });

  // ---- The storyboard itself.
  const duplicate = async (aspect) => {
    try {
      await saver.flush();
      const { plan: np, block: nb } = await api.createStoryboard(planId, { from: blockId, aspect });
      setPlan(np);
      toast(`Copied as “${nb.title}”`);
      navigate(storyboardPath(planId, nb.id));
    } catch (e) { toast(`Could not copy: ${e.message}`, 'error'); }
  };
  const removeStoryboard = async () => {
    try {
      await saver.flush();
      const res = await api.removeBlock(planId, blockId);
      navigate(`/plan/${planId}`);
      toast(`“${block.title || 'Storyboard'}” moved to Trash`, 'ok', { label: 'Undo', onClick: async () => {
        try { await api.restoreTrash(res.trashId); navigate(storyboardPath(planId, blockId)); } catch (e) { toast(`Undo failed: ${e.message}`, 'error'); }
      } });
    } catch (e) { toast(`Could not delete: ${e.message}`, 'error'); }
  };
  const back = async () => { await saver.flush(); navigate(`/plan/${planId}`); };

  const cuts = block?.cutdowns || [];
  const cut = cuts.find((c) => c.id === cutId) || null;
  const playShots = shotsOf(shots, cut);
  const allIds = shots.map((x) => x.id);
  const playIds = playShots.map((x) => x.id);
  const sortAll = useSortable({ ids: allIds, container: view === 'list' ? listRef : gridRef, onMove: reorderIds(allIds) });
  const sortTl = useSortable({ ids: playIds, container: tlRef, onMove: reorderIds(playIds), axis: 'x', threshold: 6 });

  if (error) return <div className="detail"><button className="detail-back" onClick={() => navigate('/storyboards')}><ArrowLeft size={16} /> Storyboards</button><div className="center-msg">Couldn’t load: {error}</div></div>;
  if (!plan) return <div className="spinner" />;
  if (!block) {
    return (
      <div className="detail">
        <button className="detail-back" onClick={() => navigate(`/plan/${planId}`)}><ArrowLeft size={16} /> {plan.name}</button>
        <div className="empty"><Clapperboard size={30} /><h3>This storyboard is gone</h3><p>It may have been deleted — look in the Trash.</p></div>
      </div>
    );
  }

  const ratio = ratioOf(block.aspect);
  const { starts, total } = timing(playShots); // the cut shown (or the master)
  const startOf = new Map(playShots.map((x, k) => [x.id, starts[k]]));
  const briefing = briefingTarget(plan);
  const target = cut ? cut.target : block.target ?? briefing;
  const prog = progress(shots);
  const span = Math.max(total, target || 0) || 1;
  const masterTotal = timing(shots).total;
  const beat = block.beat;
  // What a card needs beyond the shot: its duration here, the cut, variants, drawing, voice, the drag handle.
  const sbOf = (x) => {
    const st = sortAll.itemState(x.id);
    return {
      duration: cut ? (cut.durations[x.id] ?? x.duration) : x.duration,
      onDuration: (v, now) => setDuration(x.id, v, now),
      cut: cut ? { name: cut.name, inCut: !cut.skip.includes(x.id), onToggle: () => toggleInCut(x.id) } : null,
      onVariant: (altId) => takeAlt(x.id, altId),
      onDraw: (over) => setDrawing({ shotId: x.id, over }),
      onVoice: (file, secs) => saveVoice(x.id, file, secs),
      onVoiceRemove: () => patchShot(x.id, { voice: null }, true),
      voiceUrl: x.voice ? fileUrl(x.voice.file) : null,
      handle: <span className="sb-grip" {...sortAll.grab(x.id)} title="Drag to move this shot" aria-label="Drag to move this shot"><GripVertical size={14} /></span>,
      sortClass: st.className, sortStyle: st.style,
    };
  };
  const selected = shots.find((s) => s.id === selId) || null;
  const selIndex = selected ? shots.indexOf(selected) : -1;

  const shotMenu = (s, i) => [
    { label: s.image ? 'Replace frame — upload…' : 'Upload frame…', icon: <ImagePlus size={15} />, onClick: () => uploadFor(s.id) },
    { label: s.image ? 'Replace frame — from library…' : 'Frame from library…', icon: <Library size={15} />, onClick: () => setPicker({ replace: s.id }) },
    { label: s.image ? 'Draw a new frame…' : 'Draw the frame…', icon: <PenLine size={15} />, onClick: () => setDrawing({ shotId: s.id, over: false }) },
    ...(s.image ? [{ label: 'Sketch over this frame…', icon: <Pencil size={15} />, onClick: () => setDrawing({ shotId: s.id, over: true }) }] : []),
    ...(s.image ? [{ label: 'Remove frame (kept as a variant)', icon: <ImageIcon size={15} />, onClick: () => patchShot(s.id, { image: null, alts: [{ id: rid(), image: s.image, label: '' }, ...(s.alts || [])] }, true) }] : []),
    ...((s.alts || []).length ? [{ label: `Delete the ${s.alts.length} other version${s.alts.length === 1 ? '' : 's'}`, icon: <Trash2 size={15} />, onClick: () => {
      const alts = s.alts;
      patchShot(s.id, { alts: [] }, true);
      toast('Variants deleted', 'ok', { label: 'Undo', onClick: () => patchShot(s.id, { alts }, true) });
    } }] : []),
    ...(playIds.includes(s.id) ? [{ label: 'Play from here', icon: <Play size={15} />, onClick: () => setAnimatic({ index: playIds.indexOf(s.id), autoplay: true }) }] : []),
    { separator: true },
    { label: 'Insert shot after', icon: <CornerDownRight size={15} />, onClick: () => insertAt(i + 1, newShot({ section: s.section })) },
    { label: 'Duplicate', icon: <CopyIcon size={15} />, onClick: () => insertAt(i + 1, { ...s, id: rid() }) },
    ...(i > 0 ? [{ label: 'Move earlier', icon: <ArrowUp size={15} />, onClick: () => move(i, -1) }] : []),
    ...(i < shots.length - 1 ? [{ label: 'Move later', icon: <ArrowDown size={15} />, onClick: () => move(i, 1) }] : []),
    { separator: true },
    { label: 'Delete shot', icon: <Trash2 size={15} />, danger: true, onClick: () => remove(s, i) },
  ];
  const card = (s, i, extra = {}) => (
    <ShotCard key={s.id} shot={s} index={i} start={startOf.get(s.id) ?? null} ratio={ratio} fileUrl={fileUrl} highlight={flash === s.id || dragOver === s.id} sb={sbOf(s)}
      last={i === shots.length - 1} onPatch={(p, now) => patchShot(s.id, p, now)} menuItems={shotMenu(s, i)}
      onOpen={() => setAnimatic({ index: Math.max(0, playIds.indexOf(s.id)), autoplay: false })} onUpload={() => uploadFor(s.id)} onLibrary={() => setPicker({ replace: s.id })}
      dropProps={dropProps(s.id, (files) => addFiles(files, s.id))} {...extra} />
  );

  return (
    <div className={`sbe ${dragOver === 'page' ? 'dragover' : ''}`} {...dropProps('page', (files) => addFiles(files))}>
      <div className="sbe-top">
        <button className="detail-back" style={{ margin: 0 }} onClick={back}><ArrowLeft size={16} /> {plan.name}</button>
        <div className="sbe-actions">
          <button className="btn btn-sm" onClick={() => setPrinting(true)} disabled={!shots.length} aria-label="PDF"><Printer size={14} /><span className="sbe-long"> PDF</span></button>
          <button className="btn btn-sm" onClick={openVideo} disabled={!playShots.length} aria-label="Video" title="The animatic as an MP4 / WebM — with the music and recorded voice-overs"><Film size={14} /><span className="sbe-long"> Video</span></button>
          <button className="btn btn-sm btn-primary" onClick={() => setAnimatic({ index: 0, autoplay: true })} disabled={!playShots.length}><Play size={14} /> Animatic</button>
          <Menu align="right" title="Storyboard"
            trigger={<button className="btn btn-sm" aria-label="Storyboard options"><MoreHorizontal size={15} /></button>}
            items={[
              ...ASPECTS.map((a) => ({ label: `Copy as ${a} version`, icon: <CopyIcon size={15} />, onClick: () => duplicate(a) })),
              { separator: true },
              { label: 'Draw a new shot…', icon: <PenLine size={15} />, onClick: () => setDrawing({ shotId: null, over: false }) },
              { label: 'Open the plan', icon: <PencilRuler size={15} />, onClick: back },
              { label: 'Delete storyboard', icon: <Trash2 size={15} />, danger: true, onClick: removeStoryboard },
            ]} />
        </div>
      </div>

      <input className="sbe-title" value={block.title} placeholder="Storyboard" aria-label="Storyboard name"
        onChange={(e) => edit({ title: e.target.value })} />
      <div className="sbe-sub">{[plan.client, `${shots.length} shot${shots.length === 1 ? '' : 's'}`].filter(Boolean).join(' · ')}</div>

      <div className="timing-row sbe-settings">
        <div className="seg-toggle sb-aspect" role="group" aria-label="Format">
          {ASPECTS.map((a) => (
            <button key={a} className={block.aspect === a ? 'on' : ''} onClick={() => edit({ aspect: a }, true)} title={`Format ${a}`}>{a}</button>
          ))}
        </div>
        <TargetMeter total={total} own={cut ? cut.target : block.target} briefing={cut ? null : briefing} onTarget={(v) => (cut ? patchCut(cut.id, { target: v }) : edit({ target: v }))} />
        {block.audio ? (
          <>
            <span className="sb-track" title={block.audio.name}>
              <Music size={14} /><span className="sb-track-name">{block.audio.name || 'Track'}</span>
              <button className="icon-btn" aria-label="Remove track" onClick={() => edit({ audio: null, beat: null }, true)}><X size={13} /></button>
            </span>
            {beat ? (
              <span className="sb-beat">
                <Activity size={14} />
                <input className="sb-bpm" type="number" min="30" max="300" step="0.1" value={beat.bpm} aria-label="Tempo in BPM"
                  onChange={(e) => { const v = Number(e.target.value); if (v >= 30 && v <= 300) setBeat({ bpm: v }); }} /> BPM
                <button type="button" className={`icon-btn ${beat.snap ? 'on' : ''}`} onClick={() => setBeat({ snap: !beat.snap })} title={beat.snap ? 'Cuts snap to the beat (on)' : 'Cuts snap to the beat (off)'} aria-pressed={beat.snap}><Magnet size={14} /></button>
                <button type="button" className="btn btn-sm btn-ghost" onClick={cutsOnBeat} title="Move every cut to the nearest beat">Cuts on the beat</button>
                <button type="button" className="icon-btn" onClick={() => edit({ beat: null }, true)} aria-label="Remove the beat"><X size={13} /></button>
              </span>
            ) : (
              <button type="button" className="btn btn-sm btn-ghost" onClick={findBeat} disabled={beatBusy} title="Read the tempo of the track, to put cuts on the beat">
                <Activity size={14} /> {beatBusy ? 'Listening…' : 'Find the beat'}
              </button>
            )}
          </>
        ) : (
          <button className="btn btn-sm btn-ghost" onClick={() => audioRef.current?.click()} disabled={busy} title="Music or voice-over for the animatic and the timeline">
            <Music size={14} /> Add track
          </button>
        )}
      </div>

      {shots.length > 0 && (
        <div className="sbe-cuts" role="group" aria-label="Version">
          <button type="button" className={`sbe-cut ${!cut ? 'on' : ''}`} onClick={() => setCutId('')}>
            Master <span>{fmtClock(masterTotal)}</span>
          </button>
          {cuts.map((c) => {
            const len = timing(shotsOf(shots, c)).total;
            return (
              <span key={c.id} className={`sbe-cut ${cut?.id === c.id ? 'on' : ''} ${c.target && len > c.target + 0.5 ? 'over' : ''}`}>
                <button type="button" onClick={() => setCutId(c.id)}><Scissors size={12} /> {c.name} <span>{fmtClock(len)}</span></button>
                {cut?.id === c.id && (
                  <Menu align="left" title={c.name} trigger={<button type="button" className="sbe-cut-more" aria-label={`${c.name} options`}><MoreHorizontal size={13} /></button>}
                    items={[
                      { label: 'Rename', icon: <Pencil size={15} />, onClick: () => setRenamingCut(c) },
                      { label: 'Duplicate', icon: <CopyIcon size={15} />, onClick: () => { const d = { ...c, id: rid(), name: `${c.name} copy` }; setCuts([...cutsNow(), d]); setCutId(d.id); } },
                      { separator: true },
                      { label: 'Delete cutdown', icon: <Trash2 size={15} />, danger: true, onClick: () => removeCut(c) },
                    ]} />
                )}
              </span>
            );
          })}
          <Menu align="left" title="New cutdown"
            trigger={<button type="button" className="sbe-cut sbe-cut-add"><Plus size={13} /> Cutdown</button>}
            items={[
              ...CUT_LENGTHS.filter((n) => n < masterTotal).map((n) => ({ label: `${n} s version`, icon: <Scissors size={15} />, onClick: () => newCut(n) })),
              { label: 'Half as long', icon: <Scissors size={15} />, onClick: () => newCut(Math.max(1, Math.round(masterTotal / 2))) },
            ]} />
          {cut && <span className="hint sbe-cut-hint">Shots and texts are shared with the master — this version only leaves shots out and shortens them.</span>}
        </div>
      )}

      {shots.length > 0 && (
        <div className="sbe-progress">
          <div className="sbe-progress-bar" aria-hidden="true">
            {SHOT_STATUS.map((st) => (prog.counts[st.key] ? <span key={st.key} style={{ flexGrow: prog.counts[st.key], background: statusColor(st.key).fg }} /> : null))}
            <span style={{ flexGrow: prog.total - Object.values(prog.counts).reduce((a, b) => a + b, 0), background: 'var(--surface-3)' }} />
          </div>
          <span className="sbe-progress-text">
            <b>{prog.done}/{prog.total}</b> approved
            {SHOT_STATUS.filter((st) => st.key !== 'approved' && prog.counts[st.key]).map((st) => <span key={st.key}> · {prog.counts[st.key]} {st.label.toLowerCase()}</span>)}
          </span>
        </div>
      )}

      {shots.length > 0 && (
        <div className="sbe-strip" title="The storyboard's structure — click a shot to go to it">
          <div className="sb-strip">
            {playShots.map((s, i) => (
              <button key={s.id} className={`sb-strip-shot ${selId === s.id ? 'on' : ''}`} style={{ width: `${((Number(s.duration) || 0) / span) * 100}%` }}
                onClick={() => { setSelId(s.id); document.getElementById(`shot-${s.id}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }); }}
                aria-label={`Shot ${i + 1}`}>
                <span>{i + 1}</span>
              </button>
            ))}
            {target ? <span className={`sb-strip-target ${total > target + 0.5 ? 'over' : ''}`} style={{ left: `${(target / span) * 100}%` }} /> : null}
          </div>
          <div className="sbe-sections" aria-hidden="true">
            {sectionRuns(playShots).filter((r) => r.section).map((r) => (
              <span key={r.from} style={{ left: `${(r.start / span) * 100}%`, width: `calc(${(r.length / span) * 100}% - 2px)`, color: segmentColor(r.section).fg }}>
                {sectionLabel(r.section)}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="sbe-bar">
        <div className="segmented sbe-views" role="tablist" aria-label="View">
          {VIEWS.map((v) => (
            <button key={v.key} type="button" className={view === v.key ? 'on' : ''} onClick={() => setView(v.key)} role="tab" aria-selected={view === v.key}>
              <v.icon size={14} /> <span>{v.label}</span>
            </button>
          ))}
        </div>
        <div className="sbe-add">
          <button className="btn btn-sm" onClick={() => { replaceRef.current = null; uploadRef.current?.click(); }} disabled={busy}><UploadCloud size={14} /> {busy ? 'Uploading…' : <>Upload<span className="sbe-long"> frames</span></>}</button>
          <button className="btn btn-sm" onClick={() => setPicker({ replace: null })} disabled={busy}><Library size={14} /> <span className="sbe-long">From library</span><span className="sbe-short">Library</span></button>
          <button className="btn btn-sm" onClick={addShot} disabled={busy}><Plus size={14} /> Shot</button>
        </div>
      </div>

      {!shots.length && (
        <div className="empty sbe-empty">
          <Clapperboard size={30} />
          <h3>No shots yet</h3>
          <p>Upload frames (one shot each), take them from the plan’s moodboards or your Motion references, paste an image, or start with empty shots.</p>
        </div>
      )}

      {shots.length > 0 && view === 'grid' && (
        <div className="sb-grid sbe-grid" ref={gridRef} style={{ '--sb-min': ratio < 1 ? '190px' : '260px' }}>
          {shots.map((s, i) => card(s, i))}
          <button className="shot shot-new" onClick={addShot} disabled={busy}>
            <Plus size={22} /><span>Add shot</span><span className="shot-new-hint">or drop images anywhere — one shot each</span>
          </button>
        </div>
      )}

      {shots.length > 0 && view === 'list' && (
        <ShotList listRef={listRef} sbOf={sbOf} startOf={startOf} shots={shots} ratio={ratio} fileUrl={fileUrl} highlightId={flash || dragOver}
          onPatch={patchShot} menuItems={shotMenu} onOpen={(i) => setAnimatic({ index: Math.max(0, playIds.indexOf(shots[i].id)), autoplay: false })} onUpload={uploadFor}
          dropProps={(sid) => dropProps(sid, (files) => addFiles(files, sid))} />
      )}

      {shots.length > 0 && view === 'timeline' && (
        <>
          <ShotTimeline shots={playShots} starts={starts} total={total} target={target} fileUrl={fileUrl}
            audioUrl={block.audio ? fileUrl(block.audio.file) : null} selectedId={selected?.id} beat={beat}
            onSelect={setSelId} onDuration={(sid, v, now) => setDuration(sid, v, now)}
            onOpen={(i) => setAnimatic({ index: i, autoplay: true })} sortRef={tlRef} sort={sortTl} />
          {selected
            ? <div className="sbe-selected">{card(selected, selIndex, { wide: true })}</div>
            : <div className="hint sbe-pick-hint">Click a shot on the timeline to edit it here.</div>}
        </>
      )}

      <input ref={uploadRef} type="file" accept="image/*" multiple className="visually-hidden-input"
        onChange={(e) => { addFiles(e.target.files, replaceRef.current); replaceRef.current = null; e.target.value = ''; }} />
      <input ref={audioRef} type="file" accept="audio/*" className="visually-hidden-input"
        onChange={(e) => { setTrack(e.target.files?.[0]); e.target.value = ''; }} />

      {picker && <FramePicker plan={plan} single={!!picker.replace} onPick={fromLibrary} onClose={() => setPicker(null)} />}
      {printing && <PrintSheet plan={plan} block={block} fileUrl={fileUrl} onClose={() => setPrinting(false)} />}
      {drawing && (() => {
        const ds = shots.find((x) => x.id === drawing.shotId);
        return (
          <DrawPad ratio={ratio} background={drawing.over && ds?.image ? fileUrl(ds.image) : null}
            title={ds ? `${drawing.over ? 'Sketch over' : 'Draw'} shot ${shots.indexOf(ds) + 1}` : 'Draw a new shot'}
            onSave={(blob) => saveDrawing(blob).catch((e) => toast(`Could not save: ${e.message}`, 'error'))} onClose={() => setDrawing(null)} />
        );
      })()}
      {exporting && (
        <ExportDialog title="Export the animatic" storeKey="sbVideo" name={`${plan.name} ${block.title}${cut ? ` ${cut.name}` : ''}`}
          targets={[{
            key: 'video', label: 'Video', kind: 'video', aspect: ratio,
            sizes: VIDEO_SIZES.map((x) => (ratio >= 1 ? { label: x.label, w: x.long, h: Math.round(x.long / ratio) } : { label: x.label, w: Math.round(x.long * ratio), h: x.long })),
            defaultSize: 1, formats: exporting.formats, fps: [24, 25, 30], maxSize: 3840, duration: total,
            options: [
              { key: 'supers', label: 'On-screen text', default: 'on', choices: [{ key: 'on', label: 'Shown' }, { key: 'off', label: 'Off' }] },
              { key: 'captions', label: 'Voice-over as captions', default: 'off', choices: [{ key: 'off', label: 'Off' }, { key: 'on', label: 'Shown' }] },
              { key: 'numbers', label: 'Shot numbers', default: 'off', choices: [{ key: 'off', label: 'Off' }, { key: 'on', label: 'Shown' }] },
              ...(block.audio ? [{ key: 'music', label: 'Music', type: 'range', min: 0, max: 1, step: 0.05, default: 1, format: (v) => `${Math.round(v * 100)}%` }] : []),
            ],
            note: `${cut ? cut.name : 'The master'} · ${fmtClock(total)} · ${playShots.length} shots${block.audio ? ' · with the music' : ''}${playShots.some((x) => x.voice) ? ' · with the recorded voice-overs' : ''}. Dissolves and fades are shown where the storyboard says so.`,
          }]}
          onExport={runVideo} onClose={() => setExporting(null)} />
      )}
      {renamingCut && (
        <GalleryNameModal title="Rename cutdown" initialName={renamingCut.name} submitLabel="Save" placeholder="e.g. 15 s social cut"
          onSubmit={async (name) => { patchCut(renamingCut.id, { name }); setRenamingCut(null); }} onClose={() => setRenamingCut(null)} />
      )}
      {animatic && (
        <Animatic shots={playShots} ratio={ratio} audioUrl={block.audio ? fileUrl(block.audio.file) : null} fileUrl={fileUrl}
          startIndex={Math.max(0, Math.min(playShots.length - 1, animatic.index))} autoplay={animatic.autoplay} title={`${plan.name} — ${block.title}${cut ? ` · ${cut.name}` : ''}`}
          onClose={() => setAnimatic(null)} />
      )}
    </div>
  );
}
