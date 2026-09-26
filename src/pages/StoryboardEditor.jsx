import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft, Play, Printer, MoreHorizontal, UploadCloud, Library, Plus, Music, X, LayoutGrid, List, SquareChartGantt,
  ImagePlus, Image as ImageIcon, CornerDownRight, Copy as CopyIcon, ArrowUp, ArrowDown, Trash2, Clapperboard, PencilRuler,
} from 'lucide-react';
import { api, planFileUrl } from '../lib/api.js';
import { useSaver, useRefreshOnReturn, whenSaved } from '../lib/autosave.js';
import { briefingTarget } from '../lib/timing.js';
import { ASPECTS, ratioOf, newShot, timing, progress, SHOT_STATUS, statusColor, sectionRuns, segmentColor, sectionLabel, storyboardPath } from '../lib/storyboard.js';
import { useToast } from '../components/Toast.jsx';
import Menu from '../components/Menu.jsx';
import Animatic from '../components/plan/Animatic.jsx';
import { TargetMeter } from '../components/plan/Timing.jsx';
import ShotCard from '../components/storyboard/ShotCard.jsx';
import ShotList from '../components/storyboard/ShotList.jsx';
import ShotTimeline from '../components/storyboard/ShotTimeline.jsx';
import FramePicker from '../components/storyboard/FramePicker.jsx';
import PrintSheet from '../components/storyboard/PrintSheet.jsx';

const VIEWS = [
  { key: 'grid', label: 'Grid', icon: LayoutGrid },
  { key: 'list', label: 'List', icon: List },
  { key: 'timeline', label: 'Timeline', icon: SquareChartGantt },
];
const readView = () => { try { return localStorage.getItem('sbView') || 'grid'; } catch { return 'grid'; } };
const rid = () => Math.random().toString(36).slice(2, 8);

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
      if (shotId) setShots(cur.map((s) => (s.id === shotId ? { ...s, image: up[0].file } : s)), true);
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
      if (replace) setShots(cur.map((s) => (s.id === replace ? { ...s, image: files[0].file, notes: s.notes || ref(files[0]) } : s)), true);
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
  const { starts, total } = timing(shots);
  const briefing = briefingTarget(plan);
  const target = block.target ?? briefing;
  const prog = progress(shots);
  const span = Math.max(total, target || 0) || 1;
  const selected = shots.find((s) => s.id === selId) || null;
  const selIndex = selected ? shots.indexOf(selected) : -1;

  const shotMenu = (s, i) => [
    { label: s.image ? 'Replace frame — upload…' : 'Upload frame…', icon: <ImagePlus size={15} />, onClick: () => uploadFor(s.id) },
    { label: s.image ? 'Replace frame — from library…' : 'Frame from library…', icon: <Library size={15} />, onClick: () => setPicker({ replace: s.id }) },
    ...(s.image ? [{ label: 'Remove frame', icon: <ImageIcon size={15} />, onClick: () => patchShot(s.id, { image: null }, true) }] : []),
    { label: 'Play from here', icon: <Play size={15} />, onClick: () => setAnimatic({ index: i, autoplay: true }) },
    { separator: true },
    { label: 'Insert shot after', icon: <CornerDownRight size={15} />, onClick: () => insertAt(i + 1, newShot({ section: s.section })) },
    { label: 'Duplicate', icon: <CopyIcon size={15} />, onClick: () => insertAt(i + 1, { ...s, id: rid() }) },
    ...(i > 0 ? [{ label: 'Move earlier', icon: <ArrowUp size={15} />, onClick: () => move(i, -1) }] : []),
    ...(i < shots.length - 1 ? [{ label: 'Move later', icon: <ArrowDown size={15} />, onClick: () => move(i, 1) }] : []),
    { separator: true },
    { label: 'Delete shot', icon: <Trash2 size={15} />, danger: true, onClick: () => remove(s, i) },
  ];
  const card = (s, i, extra = {}) => (
    <ShotCard key={s.id} shot={s} index={i} start={starts[i]} ratio={ratio} fileUrl={fileUrl} highlight={flash === s.id || dragOver === s.id}
      last={i === shots.length - 1} onPatch={(p, now) => patchShot(s.id, p, now)} menuItems={shotMenu(s, i)}
      onOpen={() => setAnimatic({ index: i, autoplay: false })} onUpload={() => uploadFor(s.id)} onLibrary={() => setPicker({ replace: s.id })}
      dropProps={dropProps(s.id, (files) => addFiles(files, s.id))} {...extra} />
  );

  return (
    <div className={`sbe ${dragOver === 'page' ? 'dragover' : ''}`} {...dropProps('page', (files) => addFiles(files))}>
      <div className="sbe-top">
        <button className="detail-back" style={{ margin: 0 }} onClick={back}><ArrowLeft size={16} /> {plan.name}</button>
        <div className="sbe-actions">
          <button className="btn btn-sm" onClick={() => setPrinting(true)} disabled={!shots.length}><Printer size={14} /> PDF</button>
          <button className="btn btn-sm btn-primary" onClick={() => setAnimatic({ index: 0, autoplay: true })} disabled={!shots.length}><Play size={14} /> Animatic</button>
          <Menu align="right" title="Storyboard"
            trigger={<button className="btn btn-sm" aria-label="Storyboard options"><MoreHorizontal size={15} /></button>}
            items={[
              ...ASPECTS.map((a) => ({ label: `Copy as ${a} version`, icon: <CopyIcon size={15} />, onClick: () => duplicate(a) })),
              { separator: true },
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
        <TargetMeter total={total} own={block.target} briefing={briefing} onTarget={(v) => edit({ target: v })} />
        {block.audio ? (
          <span className="sb-track" title={block.audio.name}>
            <Music size={14} /><span className="sb-track-name">{block.audio.name || 'Track'}</span>
            <button className="icon-btn" aria-label="Remove track" onClick={() => edit({ audio: null }, true)}><X size={13} /></button>
          </span>
        ) : (
          <button className="btn btn-sm btn-ghost" onClick={() => audioRef.current?.click()} disabled={busy} title="Music or voice-over for the animatic and the timeline">
            <Music size={14} /> Add track
          </button>
        )}
      </div>

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
            {shots.map((s, i) => (
              <button key={s.id} className={`sb-strip-shot ${selId === s.id ? 'on' : ''}`} style={{ width: `${((Number(s.duration) || 0) / span) * 100}%` }}
                onClick={() => { setSelId(s.id); document.getElementById(`shot-${s.id}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }); }}
                aria-label={`Shot ${i + 1}`}>
                <span>{i + 1}</span>
              </button>
            ))}
            {target ? <span className={`sb-strip-target ${total > target + 0.5 ? 'over' : ''}`} style={{ left: `${(target / span) * 100}%` }} /> : null}
          </div>
          <div className="sbe-sections" aria-hidden="true">
            {sectionRuns(shots).filter((r) => r.section).map((r) => (
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
        <div className="sb-grid sbe-grid" style={{ '--sb-min': ratio < 1 ? '190px' : '260px' }}>
          {shots.map((s, i) => card(s, i))}
          <button className="shot shot-new" onClick={addShot} disabled={busy}>
            <Plus size={22} /><span>Add shot</span><span className="shot-new-hint">or drop images anywhere — one shot each</span>
          </button>
        </div>
      )}

      {shots.length > 0 && view === 'list' && (
        <ShotList shots={shots} starts={starts} ratio={ratio} fileUrl={fileUrl} highlightId={flash || dragOver}
          onPatch={patchShot} menuItems={shotMenu} onOpen={(i) => setAnimatic({ index: i, autoplay: false })} onUpload={uploadFor}
          dropProps={(sid) => dropProps(sid, (files) => addFiles(files, sid))} />
      )}

      {shots.length > 0 && view === 'timeline' && (
        <>
          <ShotTimeline shots={shots} starts={starts} total={total} target={target} fileUrl={fileUrl}
            audioUrl={block.audio ? fileUrl(block.audio.file) : null} selectedId={selected?.id}
            onSelect={setSelId} onDuration={(sid, v, now) => patchShot(sid, { duration: v }, now)}
            onOpen={(i) => setAnimatic({ index: i, autoplay: true })} />
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
      {animatic && (
        <Animatic shots={shots} ratio={ratio} audioUrl={block.audio ? fileUrl(block.audio.file) : null} fileUrl={fileUrl}
          startIndex={animatic.index} autoplay={animatic.autoplay} title={`${plan.name} — ${block.title}`}
          onClose={() => setAnimatic(null)} />
      )}
    </div>
  );
}
