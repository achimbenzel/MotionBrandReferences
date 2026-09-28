import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, MoreHorizontal, Trash2, Copy, CopyPlus, ImagePlus, UploadCloud, Library, X, CalendarDays, Clock, Link2,
  ExternalLink, Hash, Sparkles, PencilRuler, BarChart3, Palette,
} from 'lucide-react';
import { api, contentFileUrl } from '../lib/api.js';
import { useSaver, useRefreshOnReturn } from '../lib/autosave.js';
import { TAG_COLORS, tagColor } from '../lib/types.js';
import { isTouch } from '../lib/useMedia.js';
import {
  PLATFORMS, FORMATS, STATUSES, METRICS, hashtagsOf, fullText, charCount, dayKey,
} from '../lib/content.js';
import { useToast } from '../components/Toast.jsx';
import { useConfirm } from '../components/ConfirmDialog.jsx';
import Menu from '../components/Menu.jsx';
import AutoTextarea from '../components/AutoTextarea.jsx';
import Lightbox from '../components/Lightbox.jsx';
import MediaPicker from '../components/mockups/MediaPicker.jsx';
import PlatformIcon from '../components/content/PlatformIcon.jsx';

const mediaFiles = (list) => [...(list || [])].filter((f) => /^(image|video)\//.test(f.type || '') || /\.(png|jpe?g|gif|webp|avif|svg|mp4|m4v|mov|webm)$/i.test(f.name || ''));

/**
 * One post: where it goes (platforms, format), when, the hook, caption and
 * hashtags (counted against each platform's limit), a script, the pictures /
 * videos, the project it shows — and, once it's out, the link and its numbers.
 * Everything saves as you type.
 */
export default function ContentDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const [dialog, ask] = useConfirm();
  const saver = useSaver(500);
  const [item, setItem] = useState(null);
  const [plans, setPlans] = useState([]);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const [moving, setMoving] = useState(null);
  const [lightbox, setLightbox] = useState(-1);
  const [appPick, setAppPick] = useState(false);
  const pending = useRef({});
  const fileRef = useRef(null);
  const fresh = !!location.state?.fresh;

  useEffect(() => {
    let alive = true;
    setItem(null); setError(null);
    api.getContent(id).then((c) => { if (alive) setItem(c); }).catch((e) => { if (alive) setError(e.message); });
    api.listPlans().then((p) => { if (alive) setPlans(p); }).catch(() => {});
    return () => { alive = false; };
  }, [id]);
  useRefreshOnReturn(() => api.getContent(id), setItem, saver);
  // Left without writing anything: the empty post goes (no Trash needed).
  const itemRef = useRef(null);
  itemRef.current = item;
  useEffect(() => () => {
    const c = itemRef.current;
    if (c && c.id === id && !c.title.trim() && !c.hook.trim() && !c.caption.trim() && !c.hashtags.trim() && !c.script.trim() && !c.media.length) {
      api.removeContentIfEmpty(id).then((r) => { if (r?.removed) window.dispatchEvent(new CustomEvent('content:changed')); }).catch(() => {});
    }
  }, [id]);

  // Text fields together shortly after typing; switches (status, platforms …) right away.
  const patch = (fields, now = false) => {
    setItem((c) => ({ ...c, ...fields, updatedAt: Date.now() }));
    Object.assign(pending.current, fields);
    const cid = id;
    saver.schedule('fields', async () => {
      const body = pending.current; pending.current = {};
      try {
        const saved = await api.updateContent(cid, body);
        if ('status' in body) setItem((c) => (c && c.id === saved.id ? { ...c, status: saved.status, date: saved.date, postedAt: saved.postedAt } : c));
        if (body.status === 'posted') celebrate();
      } catch (e) { toast(`Could not save: ${e.message}`, 'error'); }
    }, { immediate: now });
  };

  // Out now: a post can be the one that unlocks an achievement ("50 posts").
  const celebrate = async () => {
    try {
      const { achievements, unlocked } = await api.getAchievements();
      const got = achievements.filter((a) => unlocked.includes(a.id));
      if (got.length) toast(`🏆 Achievement unlocked: ${got.map((a) => a.title).join(', ')}`, 'ok', { label: 'Show', onClick: () => navigate('/achievements') });
    } catch { /* not worth an error */ }
  };
  const addFiles = async (files) => {
    const list = mediaFiles(files);
    if (!list.length) return;
    setBusy(true);
    try { const { item: c } = await api.addContentMedia(id, list); setItem((x) => ({ ...x, media: c.media })); }
    catch (e) { toast(`Upload failed: ${e.message}`, 'error'); } finally { setBusy(false); }
  };
  const addFromApp = async (source) => {
    setAppPick(false); setBusy(true);
    try { const { item: c } = await api.addContentMedia(id, { source }); setItem((x) => ({ ...x, media: c.media })); }
    catch (e) { toast(`Could not add it: ${e.message}`, 'error'); } finally { setBusy(false); }
  };
  // A pasted picture lands in the media (text pastes stay text).
  useEffect(() => {
    const onPaste = (e) => {
      const files = mediaFiles([...(e.clipboardData?.files || [])]);
      if (!files.length) return;
      e.preventDefault();
      addFiles(files);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  });
  const removeMedia = async (m) => {
    try {
      const { item: c, trashId } = await api.removeContentMedia(id, m.id);
      setItem((x) => ({ ...x, media: c.media }));
      toast(`${m.kind === 'video' ? 'Video' : 'Picture'} removed`, 'ok', { label: 'Undo', onClick: async () => { await api.restoreTrash(trashId); setItem(await api.getContent(id)); } });
    } catch (e) { toast(e.message, 'error'); }
  };
  const dropOn = async (targetId) => {
    if (!moving || moving === targetId) return;
    const ids = item.media.map((m) => m.id).filter((x) => x !== moving);
    ids.splice(ids.indexOf(targetId), 0, moving);
    const byId = Object.fromEntries(item.media.map((m) => [m.id, m]));
    setItem((x) => ({ ...x, media: ids.map((i) => byId[i]) }));
    setMoving(null);
    try { await api.updateContent(id, { order: ids }); } catch (e) { toast(`Could not save the order: ${e.message}`, 'error'); }
  };
  const copy = async (text, what) => {
    try { await navigator.clipboard.writeText(text); toast(`${what} copied`); } catch { toast('Copy failed', 'error'); }
  };
  const duplicate = async () => {
    try { await saver.flush(); const c = await api.duplicateContent(id); toast('Copy made — plan it again'); navigate(`/content/${c.id}`); }
    catch (e) { toast(`Could not copy: ${e.message}`, 'error'); }
  };
  const remove = () => ask({
    title: 'Delete this post?',
    message: `“${item.title || 'Untitled post'}” goes to the Trash with its pictures and videos — you can restore it from there.`,
    confirmLabel: 'Delete', danger: true,
    onConfirm: async () => {
      try {
        await saver.flush();
        const { trashId } = await api.removeContent(id);
        toast('Post moved to Trash', 'ok', { label: 'Undo', onClick: async () => { await api.restoreTrash(trashId); navigate(`/content/${id}`); } });
        navigate('/content');
      } catch (e) { toast(`Could not delete: ${e.message}`, 'error'); }
    },
  });

  if (error) return <div className="center-msg">Couldn’t load: {error} <button className="btn btn-sm" onClick={() => navigate('/content')}>Back to content</button></div>;
  if (!item) return <div className="spinner" />;

  const text = fullText(item);
  const len = charCount(text);
  const tags = hashtagsOf(item.hashtags);
  const fmt = FORMATS[item.format] || FORMATS.reel;
  const plan = plans.find((p) => p.id === item.planId);
  const c = item.color ? tagColor(item.color) : null;
  const images = item.media.filter((m) => m.kind === 'image');
  const cover = item.media[0];
  const togglePlatform = (p) => patch({ platforms: item.platforms.includes(p) ? item.platforms.filter((x) => x !== p) : [...item.platforms, p] }, true);

  return (
    <div className={`ct-page ${drag ? 'drag' : ''}`}
      onDragOver={(e) => { if (!moving && [...e.dataTransfer.types].includes('Files')) { e.preventDefault(); setDrag(true); } }}
      onDragLeave={(e) => { if (e.currentTarget === e.target) setDrag(false); }}
      onDrop={(e) => { if (moving) return; e.preventDefault(); setDrag(false); addFiles(e.dataTransfer.files); }}>
      <div className="note-top">
        <button type="button" className="detail-back" onClick={() => navigate('/content')}><ArrowLeft size={16} /> Content</button>
        <div className="note-tools">
          <Menu align="right" title="Colour" trigger={<button type="button" className="icon-btn" aria-label="Colour" title="Colour" style={c ? { color: c.fg } : undefined}><Palette size={16} /></button>}
            items={[
              ...TAG_COLORS.map((t) => ({ label: t.key[0].toUpperCase() + t.key.slice(1), checked: item.color === t.key, icon: <span className="status-dot" style={{ background: t.fg }} />, onClick: () => patch({ color: t.key }, true) })),
              { separator: true },
              { label: 'No colour', icon: <X size={14} />, onClick: () => patch({ color: null }, true) },
            ]} />
          <Menu align="right" trigger={<button type="button" className="icon-btn" aria-label="More"><MoreHorizontal size={16} /></button>}
            items={[
              { label: 'Copy caption + hashtags', icon: <Copy size={15} />, onClick: () => copy(text, 'Caption'), disabled: !text },
              { label: 'Duplicate (plan it again)', icon: <CopyPlus size={15} />, onClick: duplicate },
              { separator: true },
              { label: 'Delete post', icon: <Trash2 size={15} />, danger: true, onClick: remove },
            ]} />
        </div>
      </div>

      <div className="ct-status segmented" role="group" aria-label="Stage">
        {STATUSES.map((s) => (
          <button key={s.key} type="button" className={item.status === s.key ? 'on' : ''} onClick={() => patch({ status: s.key }, true)} style={{ '--st': s.color }}>
            <span className="status-dot" style={{ background: s.color }} />{s.one}
          </button>
        ))}
      </div>

      <div className="ct-layout">
        <div className="ct-main">
          <input className="ct-title" value={item.title} placeholder="What's the post about?" autoFocus={fresh && !isTouch()} aria-label="Title"
            onChange={(e) => patch({ title: e.target.value })} />

          <div className="ct-row">
            <div className="ct-platforms" role="group" aria-label="Platforms">
              {Object.entries(PLATFORMS).map(([k, p]) => (
                <button key={k} type="button" className={`ct-plat ${item.platforms.includes(k) ? 'on' : ''}`} onClick={() => togglePlatform(k)}
                  aria-pressed={item.platforms.includes(k)} title={p.label} style={{ '--pc': p.color }}>
                  <PlatformIcon platform={k} size={15} /> <span>{p.label}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="ct-row ct-when">
            <label className="ct-field"><span>Format</span>
              <select className="input" value={item.format} onChange={(e) => patch({ format: e.target.value }, true)}>
                {Object.entries(FORMATS).map(([k, f]) => <option key={k} value={k}>{f.label}</option>)}
              </select>
            </label>
            <label className="ct-field"><span><CalendarDays size={12} /> Goes out</span>
              <input className="input" type="date" value={item.date} onChange={(e) => patch({ date: e.target.value }, true)} />
            </label>
            <label className="ct-field ct-time"><span><Clock size={12} /> At</span>
              <input className="input" type="time" value={item.time} onChange={(e) => patch({ time: e.target.value }, true)} />
            </label>
            {!item.date && <button type="button" className="btn btn-sm btn-ghost ct-today" onClick={() => patch({ date: dayKey() }, true)}>Today</button>}
          </div>
          <div className="hint ct-fmt-hint">{fmt.hint}</div>

          <label className="ct-block">
            <span className="ct-label"><Sparkles size={13} /> Hook <em>— the first second / the first line</em></span>
            <AutoTextarea className="input ct-hook" value={item.hook} placeholder="Why should anyone stop scrolling?" onChange={(e) => patch({ hook: e.target.value })} />
          </label>

          <label className="ct-block">
            <span className="ct-label">Caption</span>
            <AutoTextarea className="input ct-caption" value={item.caption} placeholder="The text that goes with it…" onChange={(e) => patch({ caption: e.target.value })} />
          </label>
          <label className="ct-block">
            <span className="ct-label"><Hash size={13} /> Hashtags <em>{tags.length ? `— ${tags.length}` : ''}</em></span>
            <input className="input" value={item.hashtags} placeholder="#motiondesign #branding …" onChange={(e) => patch({ hashtags: e.target.value })} />
          </label>
          <div className="ct-counts">
            {item.platforms.map((p) => {
              const max = PLATFORMS[p].caption;
              return <span key={p} className={`ct-count ${len > max ? 'over' : len > max * 0.9 ? 'near' : ''}`} title={PLATFORMS[p].tip}><PlatformIcon platform={p} size={12} /> {len.toLocaleString()} / {max.toLocaleString()}</span>;
            })}
            {item.platforms.includes('instagram') && tags.length > 30 && <span className="ct-count over">Instagram allows 30 hashtags</span>}
            {item.platforms.includes('instagram') && tags.length > 5 && tags.length <= 30 && <span className="ct-count near">3–5 focused hashtags usually do better</span>}
            {!item.platforms.length && <span className="hint">Pick the platforms to see their limits.</span>}
            {text && <button type="button" className="btn btn-sm btn-ghost" onClick={() => copy(text, 'Caption')}><Copy size={13} /> Copy</button>}
          </div>

          <label className="ct-block">
            <span className="ct-label">Script &amp; notes <em>— shots, voice-over, on-screen text, sound</em></span>
            <AutoTextarea className="input ct-script" value={item.script} placeholder={'0–1 s  Hook: …\n1–5 s  …\nSound: …'} onChange={(e) => patch({ script: e.target.value })} />
          </label>

          <div className="ct-row ct-links">
            <label className="ct-field ct-grow"><span><PencilRuler size={12} /> Shows the project</span>
              <select className="input" value={item.planId || ''} onChange={(e) => patch({ planId: e.target.value || null }, true)}>
                <option value="">None</option>
                {plans.map((p) => <option key={p.id} value={p.id}>{p.name}{p.client ? ` · ${p.client}` : ''}</option>)}
              </select>
            </label>
            {plan && <button type="button" className="btn btn-sm btn-ghost" onClick={() => navigate(`/plan/${plan.id}`)}><ExternalLink size={13} /> Open</button>}
          </div>

          {item.status === 'posted' && (
            <div className="ct-posted">
              <label className="ct-field ct-grow"><span><Link2 size={12} /> Live at</span>
                <input className="input" value={item.link} placeholder="https://www.instagram.com/p/…" inputMode="url" onChange={(e) => patch({ link: e.target.value })} />
              </label>
              <div className="ct-label"><BarChart3 size={13} /> How it did</div>
              <div className="ct-metrics">
                {METRICS.map((m) => (
                  <label key={m.key} className="ct-field"><span>{m.label}</span>
                    <input className="input" type="number" min="0" value={item.metrics[m.key] ?? ''} placeholder="—"
                      onChange={(e) => patch({ metrics: { ...item.metrics, [m.key]: e.target.value === '' ? null : Number(e.target.value) } })} />
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        <aside className="ct-side">
          <div className={`ct-preview ${fmt.aspect === '9 / 16' ? 'tall' : ''}`} style={{ '--ar': fmt.aspect }}>
            {cover ? (cover.kind === 'video'
              ? <video src={contentFileUrl(item, cover.file)} muted loop playsInline autoPlay={!isTouch()} controls={isTouch()} />
              : <img src={contentFileUrl(item, cover.file)} alt="" />)
              : <div className="ct-preview-empty">{item.hook || item.title || 'Your post'}</div>}
            {item.format === 'carousel' && item.media.length > 1 && <span className="ct-preview-count">1 / {item.media.length}</span>}
          </div>
          {(item.caption || tags.length > 0) && (
            <p className="ct-preview-text"><b>you</b> {item.caption.slice(0, 125)}{item.caption.length > 125 ? '… more' : ''} <span>{tags.slice(0, 8).join(' ')}</span></p>
          )}

          <div className="ct-media">
            {item.media.map((m, i) => (
              <figure key={m.id} className={`ct-media-item ${moving === m.id ? 'moving' : ''}`} draggable
                onDragStart={(e) => { setMoving(m.id); e.dataTransfer.effectAllowed = 'move'; }}
                onDragEnd={() => setMoving(null)}
                onDragOver={(e) => { if (moving) e.preventDefault(); }}
                onDrop={(e) => { if (moving) { e.preventDefault(); e.stopPropagation(); dropOn(m.id); } }}>
                {m.kind === 'video'
                  ? <video src={`${contentFileUrl(item, m.file)}#t=0.1`} muted preload="metadata" controls />
                  : <button type="button" className="ct-media-open" onClick={() => setLightbox(images.indexOf(m))} aria-label={`Open ${m.name || 'picture'}`}><img src={contentFileUrl(item, m.file)} alt="" loading="lazy" draggable={false} /></button>}
                <span className="ct-media-n">{i + 1}</span>
                <button type="button" className="note-img-x" onClick={() => removeMedia(m)} aria-label="Remove" title="Remove"><X size={13} /></button>
              </figure>
            ))}
            {busy && <div className="ct-media-item ct-media-busy"><div className="spinner" /></div>}
          </div>
          <div className="ct-media-add">
            <button type="button" className="btn btn-sm" onClick={() => fileRef.current?.click()} disabled={busy}><UploadCloud size={14} /> Upload</button>
            <button type="button" className="btn btn-sm" onClick={() => setAppPick(true)} disabled={busy}><Library size={14} /> From the app</button>
          </div>
          <div className="hint">Pictures and videos — drop or paste them anywhere on the page; drag to reorder (the first is the cover).</div>
        </aside>
      </div>

      <input ref={fileRef} type="file" accept="image/*,video/*" multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
      {lightbox >= 0 && <Lightbox items={images.map((m) => ({ src: contentFileUrl(item, m.file), caption: m.name }))} index={lightbox} onIndex={setLightbox} onClose={() => setLightbox(-1)} />}
      {appPick && <MediaPicker accept="any" title="Picture or video from the app" onPick={addFromApp} onClose={() => setAppPick(false)} />}
      {drag && <div className="note-drop" aria-hidden="true"><ImagePlus size={26} /> Drop pictures or videos to add them</div>}
      {dialog}
    </div>
  );
}
