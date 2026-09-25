import { useEffect, useRef, useState } from 'react';
import {
  UploadCloud, Check, X, MoreHorizontal, Copy, Trash2, Download, BadgeCheck, Columns2, MessageSquarePlus, History,
} from 'lucide-react';
import Menu from '../Menu.jsx';
import AutoTextarea from '../AutoTextarea.jsx';
import { fmtClock } from '../../lib/timing.js';
import { resolveDuration } from '../../lib/media.js';

const rid = () => Math.random().toString(36).slice(2, 8);
const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
const fmtBytes = (n) => {
  if (!n) return '';
  const u = ['B', 'KB', 'MB', 'GB']; let v = n; let i = 0;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i += 1; }
  return `${v.toFixed(v < 10 && i > 0 ? 1 : 0)} ${u[i]}`;
};
const fmtDate = (ms) => (ms ? new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : '');

/**
 * Review block: upload each render as a version (v1, v2 …), watch it and write
 * feedback pinned to the moment — tick comments off as they're fixed, approve
 * a version, compare two side by side (in sync), and check what was still open
 * in the version before. Uploads only store the file; the page saves the list.
 */
export default function ReviewBlock({ plan, block: b, menu, icon: Icon, editBlock, planRef, toast, upload, fileUrl }) {
  const versions = b.versions || [];
  const [activeId, setActiveId] = useState(versions[versions.length - 1]?.id || null);
  const active = versions.find((v) => v.id === activeId) || versions[versions.length - 1] || null;
  const activeIndex = active ? versions.indexOf(active) : -1;
  const [compareId, setCompareId] = useState(null);
  const compare = versions.find((v) => v.id === compareId && v.id !== active?.id) || null;
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [draft, setDraft] = useState('');
  const [draftT, setDraftT] = useState(null); // the moment frozen when you start typing
  const [openOnly, setOpenOnly] = useState(false);
  const [showPrev, setShowPrev] = useState(true);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const videoRef = useRef(null);
  const otherRef = useRef(null);
  const fileRef = useRef(null);
  const barRef = useRef(null);
  const scrubbing = useRef(false);

  const latest = () => (planRef.current?.blocks || []).find((x) => x.id === b.id)?.versions || versions;
  const setVersions = (next, immediate = false) => editBlock(b.id, { versions: next }, immediate);
  const patchVersion = (vid, p, immediate = false) => setVersions(latest().map((v) => (v.id === vid ? { ...v, ...p } : v)), immediate);
  const patchComments = (vid, fn, immediate = false) => setVersions(latest().map((v) => (v.id === vid ? { ...v, comments: fn(v.comments || []) } : v)), immediate);

  useEffect(() => { setCurrent(0); setDuration(0); setDraft(''); setDraftT(null); }, [active?.id]);

  const addVersion = async (file) => {
    if (!file) return;
    if (!file.type?.startsWith('video/')) { toast('Choose a video file (a render of this version).', 'error'); return; }
    setBusy(true);
    try {
      const [u] = await upload([file]);
      const cur = latest();
      const v = { id: rid(), file: u.file, name: u.name, size: u.size, label: `v${cur.length + 1}`, approved: false, createdAt: Date.now(), comments: [] };
      setVersions([...cur, v], true);
      setActiveId(v.id);
      setCompareId(null);
      setShowPrev(true);
    } catch (e) { toast(`Upload failed: ${e.message}`, 'error'); }
    finally { setBusy(false); }
  };
  const removeVersion = (v) => {
    const i = latest().findIndex((x) => x.id === v.id);
    setVersions(latest().filter((x) => x.id !== v.id), true);
    if (compareId === v.id) setCompareId(null);
    toast(`${v.label || 'Version'} removed`, 'ok', { label: 'Undo', onClick: () => {
      const next = [...latest()]; next.splice(Math.min(i, next.length), 0, v); setVersions(next, true); setActiveId(v.id);
    } });
  };

  // ---- player ---------------------------------------------------------------
  const seek = (t) => { const v = videoRef.current; if (v) { v.currentTime = t; setCurrent(t); } };
  const scrubTo = (clientX) => {
    const r = barRef.current?.getBoundingClientRect();
    if (r && duration) seek(clamp((clientX - r.left) / r.width, 0, 1) * duration);
  };
  // Compare: the second video follows the first (play, pause, seek, speed).
  useEffect(() => {
    const a = videoRef.current; const o = otherRef.current;
    if (!a || !o) return undefined;
    const sync = () => { if (Math.abs(o.currentTime - a.currentTime) > 0.12) o.currentTime = a.currentTime; };
    const onPlay = () => { sync(); o.play().catch(() => {}); };
    const onPause = () => { o.pause(); sync(); };
    const onRate = () => { o.playbackRate = a.playbackRate; };
    a.addEventListener('play', onPlay); a.addEventListener('pause', onPause);
    a.addEventListener('seeked', sync); a.addEventListener('ratechange', onRate);
    const iv = setInterval(() => { if (!a.paused) sync(); }, 500);
    sync();
    return () => {
      a.removeEventListener('play', onPlay); a.removeEventListener('pause', onPause);
      a.removeEventListener('seeked', sync); a.removeEventListener('ratechange', onRate);
      clearInterval(iv);
    };
  }, [active?.id, compare?.id]);

  // ---- comments -------------------------------------------------------------
  const comments = [...(active?.comments || [])].sort((a, c) => a.t - c.t);
  const openCount = comments.filter((c) => !c.done).length;
  const shown = openOnly ? comments.filter((c) => !c.done) : comments;
  const at = draftT ?? current;
  const addComment = () => {
    const text = draft.trim();
    if (!text || !active) return;
    const t = Number((draftT ?? videoRef.current?.currentTime ?? 0).toFixed(2));
    patchComments(active.id, (cs) => [...cs, { id: rid(), t, text, done: false, createdAt: Date.now() }], true);
    setDraft(''); setDraftT(null);
  };
  const removeComment = (c) => {
    patchComments(active.id, (cs) => cs.filter((x) => x.id !== c.id), true);
    toast('Comment removed', 'ok', { label: 'Undo', onClick: () => patchComments(active.id, (cs) => [...cs, c], true) });
  };
  const copyFeedback = async () => {
    const lines = comments.map((c) => `${c.done ? '[x]' : '[ ]'} ${fmtClock(c.t)}  ${c.text}`);
    try {
      await navigator.clipboard.writeText(`${plan.name} — ${b.title} ${active.label} (${openCount} open)\n\n${lines.join('\n')}`);
      toast('Feedback copied');
    } catch { toast('Copy failed', 'error'); }
  };

  // Still open in the version before this one: check each in the new render.
  const prev = activeIndex > 0 ? versions[activeIndex - 1] : null;
  const prevOpen = prev ? [...(prev.comments || [])].filter((c) => !c.done).sort((a, c) => a.t - c.t) : [];
  const resolvePrev = (c) => patchComments(prev.id, (cs) => cs.map((x) => (x.id === c.id ? { ...x, done: true } : x)), true);
  const carryOver = (c) => {
    setVersions(latest().map((v) => {
      if (v.id === prev.id) return { ...v, comments: (v.comments || []).map((x) => (x.id === c.id ? { ...x, done: true } : x)) };
      if (v.id === active.id) return { ...v, comments: [...(v.comments || []), { ...c, id: rid(), done: false, createdAt: Date.now() }] };
      return v;
    }), true);
  };

  const dropProps = {
    onDragOver: (e) => { if ([...(e.dataTransfer?.types || [])].includes('Files')) { e.preventDefault(); setDragOver(true); } },
    onDragLeave: (e) => { if (e.target === e.currentTarget) setDragOver(false); },
    onDrop: (e) => { e.preventDefault(); setDragOver(false); addVersion(e.dataTransfer.files?.[0]); },
  };

  return (
    <div className={`section block review ${dragOver ? 'dragover' : ''}`} id={`block-${b.id}`} {...dropProps}>
      <div className="section-head">
        <h2><Icon size={16} /> {b.title} {versions.length > 0 && <span className="count">{versions.length} version{versions.length === 1 ? '' : 's'}</span>}</h2>
        <div className="moodboard-actions">
          <button className="btn btn-sm" onClick={() => fileRef.current?.click()} disabled={busy}>
            <UploadCloud size={14} /> {busy ? 'Uploading…' : versions.length ? 'New version' : 'Upload version'}
          </button>
          {menu}
        </div>
      </div>
      <input ref={fileRef} type="file" accept="video/*" className="visually-hidden-input"
        onChange={(e) => { addVersion(e.target.files?.[0]); e.target.value = ''; }} />

      {!active ? (
        <div className="dropzone" onClick={() => fileRef.current?.click()}>
          <UploadCloud size={20} />
          <div>Upload a render (v1) — then pause anywhere and write feedback pinned to that moment.</div>
        </div>
      ) : (
        <>
          <div className="rv-versions" role="tablist" aria-label="Versions">
            {versions.map((v) => {
              const open = (v.comments || []).filter((c) => !c.done).length;
              return (
                <button key={v.id} role="tab" aria-selected={v.id === active.id} className={`rv-ver ${v.id === active.id ? 'on' : ''}`}
                  onClick={() => { setActiveId(v.id); if (compareId === v.id) setCompareId(null); }} title={`${v.name} · ${fmtDate(v.createdAt)}`}>
                  {v.label || 'v?'}
                  {v.approved ? <BadgeCheck size={14} className="rv-ok" /> : open > 0 && <span className="rv-open">{open}</span>}
                </button>
              );
            })}
          </div>

          <div className="rv-toolbar">
            <input className="input rv-label" value={active.label} aria-label="Version name" onChange={(e) => patchVersion(active.id, { label: e.target.value })} />
            <span className="rv-file" title={active.name}>{[active.name, fmtBytes(active.size), fmtDate(active.createdAt)].filter(Boolean).join(' · ')}</span>
            <button className={`btn btn-sm ${active.approved ? 'btn-on' : ''}`} onClick={() => patchVersion(active.id, { approved: !active.approved }, true)} aria-pressed={active.approved}>
              <BadgeCheck size={14} /> {active.approved ? 'Approved' : 'Approve'}
            </button>
            {versions.length > 1 && (
              <label className="rv-compare" title="Play another version beside this one, in sync">
                <Columns2 size={14} />
                <select className="input" value={compare?.id || ''} onChange={(e) => setCompareId(e.target.value || null)} aria-label="Compare with">
                  <option value="">Compare…</option>
                  {versions.filter((v) => v.id !== active.id).map((v) => <option key={v.id} value={v.id}>with {v.label || 'version'}</option>)}
                </select>
              </label>
            )}
            <Menu align="right" title={active.label}
              trigger={<button className="icon-btn" aria-label="Version options"><MoreHorizontal size={16} /></button>}
              items={[
                { label: 'Copy feedback', icon: <Copy size={15} />, onClick: copyFeedback },
                { label: 'Download file', icon: <Download size={15} />, onClick: () => { const a = document.createElement('a'); a.href = fileUrl(active.file); a.download = active.name || ''; a.click(); } },
                { separator: true },
                { label: 'Delete version', icon: <Trash2 size={15} />, danger: true, onClick: () => removeVersion(active) },
              ]} />
          </div>

          <div className={`rv-stage ${compare ? 'rv-split' : ''}`}>
            <div className="rv-player">
              {compare && <span className="rv-tag">{active.label}</span>}
              <video key={active.id} ref={videoRef} src={fileUrl(active.file)} controls preload="metadata" playsInline
                onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)}
                onLoadedMetadata={(e) => { resolveDuration(e.currentTarget).then(setDuration); }} />
            </div>
            {compare && (
              <div className="rv-player">
                <span className="rv-tag">{compare.label}</span>
                <video key={compare.id} ref={otherRef} src={fileUrl(compare.file)} muted playsInline preload="metadata" />
              </div>
            )}
          </div>

          <div className="rv-bar" ref={barRef}
            onPointerDown={(e) => { scrubbing.current = true; e.currentTarget.setPointerCapture?.(e.pointerId); scrubTo(e.clientX); }}
            onPointerMove={(e) => { if (scrubbing.current) scrubTo(e.clientX); }}
            onPointerUp={() => { scrubbing.current = false; }} onPointerCancel={() => { scrubbing.current = false; }}
            title="Comments on the timeline — click to jump">
            {duration > 0 && comments.map((c) => (
              <span key={c.id} className={`rv-tick ${c.done ? 'done' : ''}`} style={{ left: `${clamp(c.t / duration, 0, 1) * 100}%` }} />
            ))}
            {duration > 0 && <span className="rv-head" style={{ left: `${clamp(current / duration, 0, 1) * 100}%` }} />}
          </div>

          <form className="rv-compose" onSubmit={(e) => { e.preventDefault(); addComment(); }}>
            <button type="button" className="rv-time" onClick={() => seek(at)} title="Jump here">{fmtClock(at)}</button>
            <input className="input" value={draft} placeholder={`Feedback at ${fmtClock(at)}…`} aria-label="New comment"
              onFocus={() => { const v = videoRef.current; if (v && !v.paused) v.pause(); setDraftT(v ? v.currentTime : current); }}
              onBlur={() => { if (!draft.trim()) setDraftT(null); }}
              onChange={(e) => setDraft(e.target.value)} />
            <button className="btn btn-primary btn-sm" disabled={!draft.trim()}><MessageSquarePlus size={14} /> Add</button>
          </form>

          {comments.length > 0 && (
            <div className="rv-listhead">
              <span><b>{openCount}</b> open · {comments.length - openCount} done</span>
              <button className={`chip ${openOnly ? 'on' : ''}`} onClick={() => setOpenOnly((v) => !v)}>Open only</button>
            </div>
          )}
          <div className="rv-list">
            {shown.map((c) => {
              const now = Math.abs(c.t - current) < 0.6;
              return (
                <div key={c.id} className={`rv-comment ${c.done ? 'done' : ''} ${now ? 'now' : ''}`}>
                  <button className={`ms-check ${c.done ? 'on' : ''}`} aria-label={c.done ? 'Mark open' : 'Mark done'}
                    onClick={() => patchComments(active.id, (cs) => cs.map((x) => (x.id === c.id ? { ...x, done: !x.done } : x)), true)}>{c.done && <Check size={13} />}</button>
                  <button className="rv-time" onClick={() => seek(c.t)} title="Jump here">{fmtClock(c.t)}</button>
                  <AutoTextarea className="rv-text" value={c.text} aria-label="Comment"
                    onChange={(e) => patchComments(active.id, (cs) => cs.map((x) => (x.id === c.id ? { ...x, text: e.target.value } : x)))} />
                  <button className="icon-btn rv-del" onClick={() => removeComment(c)} title="Remove comment"><X size={14} /></button>
                </div>
              );
            })}
          </div>

          {prev && prevOpen.length > 0 && (
            <div className="rv-prev">
              <button className="rv-prev-head" onClick={() => setShowPrev((v) => !v)} aria-expanded={showPrev}>
                <History size={14} /> Still open in {prev.label || 'the version before'} <span className="count">{prevOpen.length}</span>
              </button>
              {showPrev && prevOpen.map((c) => (
                <div key={c.id} className="rv-comment rv-prev-row">
                  <button className="rv-time" onClick={() => seek(c.t)} title="Check this moment in the new version">{fmtClock(c.t)}</button>
                  <span className="rv-prev-text">{c.text}</span>
                  <span className="rv-prev-actions">
                    <button className="btn btn-sm" onClick={() => resolvePrev(c)} title={`Tick it off in ${prev.label}`}><Check size={13} /> Fixed</button>
                    <button className="btn btn-sm btn-ghost" onClick={() => carryOver(c)} title={`Move it to ${active.label}`}>Still open</button>
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
