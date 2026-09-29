import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, MoreHorizontal, Trash2, Copy, CopyPlus, ImagePlus, UploadCloud, Library, X, CalendarDays, Clock, Link2,
  ExternalLink, Hash, Sparkles, PencilRuler, BarChart3, Palette, Lightbulb, Clapperboard, ListChecks, Send, Star, ArrowRight, PenLine, Undo2,
  Layers, Plus,
} from 'lucide-react';
import { api, contentFileUrl } from '../lib/api.js';
import { useSaver, useRefreshOnReturn } from '../lib/autosave.js';
import { TAG_COLORS, tagColor } from '../lib/types.js';
import { isTouch } from '../lib/useMedia.js';
import {
  PLATFORMS, FORMATS, STATUSES, METRICS, hashtagsOf, fullText, textFor, ownText, threadParts, coverOf, charCount, dayKey,
  checklistFor, fmtSec, fmtNum,
} from '../lib/content.js';
import { useToast } from '../components/Toast.jsx';
import { useConfirm } from '../components/ConfirmDialog.jsx';
import Menu from '../components/Menu.jsx';
import AutoTextarea from '../components/AutoTextarea.jsx';
import Lightbox from '../components/Lightbox.jsx';
import MediaPicker from '../components/mockups/MediaPicker.jsx';
import PlatformIcon from '../components/content/PlatformIcon.jsx';
import PostPreview from '../components/content/PostPreview.jsx';
import { Section, Beats, Checklist } from '../components/content/ContentParts.jsx';
import ContentPlanDialog from '../components/content/ContentPlanDialog.jsx';
import SnippetPicker from '../components/content/SnippetPicker.jsx';
import { placeholderIn } from '../lib/contentIdeas.js';
import useContentSettings, { useContentProfile } from '../components/content/useContentSettings.js';

const mediaFiles = (list) => [...(list || [])].filter((f) => /^(image|video)\//.test(f.type || '') || /\.(png|jpe?g|gif|webp|avif|svg|mp4|m4v|mov|webm)$/i.test(f.name || ''));

// Each stage opens its part of the post; the others fold away (still a click away).
const STAGE_SECTION = { idea: 'idea', script: 'script', production: 'production', scheduled: 'publish', posted: 'results' };
const STAGE_NEXT = {
  idea: { to: 'script', text: 'Got the hook? Write how it runs.' },
  script: { to: 'production', text: 'Script ready — time to make it.' },
  production: { to: 'scheduled', text: 'Made and exported? Give it a day and the caption.' },
  scheduled: { to: 'posted', text: 'Out? Mark it posted — then note how it did.' },
};
const TIMED = ['reel', 'story', 'video'];
const isEmptyPost = (c) => !c.title.trim() && !c.hook.trim() && !c.caption.trim() && !c.hashtags.trim() && !c.script.trim() && !(c.notes || '').trim()
  && !(c.beats || []).some((b) => b.text.trim() || b.screen.trim()) && !Object.keys(c.captions || {}).length && !c.media.length;
const lastParagraph = (s) => String(s || '').trim().split(/\n\s*\n/).pop() || '';
// After a formula goes in: the field focused, its first [placeholder] selected to type over.
const selectPlaceholder = (selector, text, offset) => setTimeout(() => {
  const el = document.querySelector(selector);
  if (!el) return;
  el.focus();
  const ph = placeholderIn(text.slice(offset));
  if (ph) el.setSelectionRange(offset + ph[0], offset + ph[1]);
}, 40);
const firstLine = (s, max = 70) => { const t = String(s || '').trim().split('\n')[0]; return t.length > max ? `${t.slice(0, max)}…` : t; };

/**
 * One post, from the idea to the numbers: where it goes (platforms, format),
 * when, the hook — then a part for each stage (the idea, the script in beats,
 * the production checklist, caption + hashtags with its own text per
 * platform, the link and numbers), open for the stage it's in. Beside it the
 * post as it'll look on Instagram, TikTok or X, and its pictures / videos.
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
  const [manual, setManual] = useState({}); // parts opened / closed by hand (until the stage changes)
  const [capTab, setCapTab] = useState('all');
  const [pvPlatform, setPvPlatform] = useState('');
  const [profile, setProfile] = useContentProfile();
  const [cs] = useContentSettings();
  const pillars = cs.contentPillars;
  const [planOpen, setPlanOpen] = useState(false);
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
    if (c && c.id === id && isEmptyPost(c)) {
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
      } catch (e) { toast(`Could not save: ${e.message}`, 'error'); }
    }, { immediate: now });
  };

  // A new stage: its part opens, what was opened by hand closes again.
  const stage = item?.status;
  useEffect(() => { setManual({}); }, [stage, id]);

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
  const setCover = (m) => patch({ coverId: coverOf(item)?.id === m.id && item.coverId ? null : m.id }, true);
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
  const tags = hashtagsOf(item.hashtags);
  const fmt = FORMATS[item.format] || FORMATS.reel;
  const plan = plans.find((p) => p.id === item.planId);
  const c = item.color ? tagColor(item.color) : null;
  const images = item.media.filter((m) => m.kind === 'image');
  const cover = coverOf(item);
  const togglePlatform = (p) => patch({ platforms: item.platforms.includes(p) ? item.platforms.filter((x) => x !== p) : [...item.platforms, p] }, true);

  const now = STAGE_SECTION[item.status];
  const isOpen = (key) => (key in manual ? manual[key] : key === now);
  const toggle = (key) => setManual((m) => ({ ...m, [key]: !isOpen(key) }));
  const next = STAGE_NEXT[item.status];
  const nextBar = (key) => (key === now && next ? (
    <div className="ct-next">
      <span>{next.text}</span>
      <button type="button" className="btn btn-sm btn-primary" onClick={() => patch({ status: next.to }, true)}>
        {STATUSES.find((x) => x.key === next.to).one} <ArrowRight size={14} />
      </button>
    </div>
  ) : null);

  // Script
  const timed = TIMED.includes(item.format);
  const beatsOn = item.format !== 'text' && item.format !== 'thread';
  const beatSecs = item.beats.reduce((n, b) => n + (b.sec || 0), 0);
  const setBeats = (beats, typing) => patch({ beats }, !typing);
  const beatsRemoved = (before) => toast('Beat removed', 'ok', { label: 'Undo', onClick: () => patch({ beats: before }, true) });
  // Production
  const checklist = checklistFor(item.format);
  const checksDone = checklist.filter((x) => item.checks.includes(x.key)).length;
  // Caption: the main one, or its own for a platform
  const capPlatforms = Object.keys(PLATFORMS).filter((p) => item.platforms.includes(p));
  const tab = capTab !== 'all' && capPlatforms.includes(capTab) ? capTab : 'all';
  const pickCapTab = (p) => { setCapTab(p); if (p !== 'all') setPvPlatform(p); };
  const setOwn = (p, value) => patch({ captions: { ...item.captions, [p]: value } });
  const writeOwn = (p) => patch({ captions: { ...item.captions, [p]: text || item.hook || '' } }, true);
  const dropOwn = (p) => {
    const before = item.captions;
    const rest = { ...item.captions }; delete rest[p];
    patch({ captions: rest }, true);
    toast(`${PLATFORMS[p].label} uses the caption again`, 'ok', { label: 'Undo', onClick: () => patch({ captions: before }, true) });
  };
  const owns = capPlatforms.filter((p) => ownText(item, p));
  const count = (p) => {
    const t = textFor(item, p);
    const max = PLATFORMS[p].caption;
    const parts = p === 'x' && item.format === 'thread' ? threadParts(t) : null;
    const len = parts ? Math.max(0, ...parts.map(charCount)) : charCount(t);
    return { len, max, parts, cls: len > max ? 'over' : len > max * 0.9 ? 'near' : '' };
  };
  // From the library: a hook replaces (Undo), hashtags join, a call to action ends the caption.
  const pickHook = (text) => {
    const before = item.hook;
    patch({ hook: text }, true);
    if (before.trim() && before !== text) toast('Hook replaced', 'ok', { label: 'Undo', onClick: () => patch({ hook: before }, true) });
    selectPlaceholder('.ct-hook', text, 0);
  };
  const pickTags = (text) => {
    const before = item.hashtags;
    const merged = [...new Set([...hashtagsOf(before), ...hashtagsOf(text)])].join(' ');
    patch({ hashtags: merged }, true);
    if (before.trim()) toast('Hashtags added', 'ok', { label: 'Undo', onClick: () => patch({ hashtags: before }, true) });
  };
  const pickCta = (text) => {
    const base = item.caption.trimEnd();
    const next = base ? `${base}\n\n${text}` : text;
    patch({ caption: next }, true);
    selectPlaceholder('.ct-caption', next, next.length - text.length);
  };
  // Results
  const mt = item.metrics;
  const engaged = ['likes', 'comments', 'shares', 'saves'].reduce((n, k) => n + (mt[k] || 0), 0);
  const rate = mt.views ? (engaged / mt.views) * 100 : null;

  return (
    <div className={`ct-page ${drag ? 'drag' : ''}`}
      onDragOver={(e) => { if (!moving && [...e.dataTransfer.types].includes('Files')) { e.preventDefault(); setDrag(true); } }}
      onDragLeave={(e) => { if (e.currentTarget === e.target) setDrag(false); }}
      onDrop={(e) => { if (moving || ![...e.dataTransfer.types].includes('Files')) return; e.preventDefault(); setDrag(false); addFiles(e.dataTransfer.files); }}>
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
          <div className="ct-head">
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
            <div className="ct-pillars" role="group" aria-label="Pillar">
              <span className="ct-pillars-label"><Layers size={12} /> Pillar</span>
              {pillars.map((p) => (
                <button key={p.id} type="button" className={`ct-pillar ${item.pillar === p.id ? 'on' : ''}`} style={{ '--pc': tagColor(p.color).fg }}
                  aria-pressed={item.pillar === p.id} onClick={() => patch({ pillar: item.pillar === p.id ? null : p.id }, true)}>
                  <i />{p.name || 'Untitled pillar'}
                </button>
              ))}
              <button type="button" className="ct-pillar ct-pillar-edit" onClick={() => setPlanOpen(true)}>{pillars.length ? 'Edit…' : <><Plus size={12} /> Your pillars</>}</button>
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
            <div className="ct-block">
              <div className="ct-label-row">
                <span className="ct-label"><Sparkles size={13} /> Hook <em>— the first second / the first line</em></span>
                <SnippetPicker kind="hook" current={item.hook} onPick={pickHook} />
              </div>
              <AutoTextarea className="input ct-hook" value={item.hook} placeholder="Why should anyone stop scrolling?" aria-label="Hook" onChange={(e) => patch({ hook: e.target.value })} />
            </div>
          </div>

          <Section icon={Lightbulb} title="Idea" now={now === 'idea'} open={isOpen('idea')} onToggle={() => toggle('idea')}
            summary={item.notes.trim() ? firstLine(item.notes) : plan ? `Shows ${plan.name}` : 'Notes, references, the project'}>
            <label className="ct-block">
              <span className="ct-label">Notes <em>— why this, what it's like, where you saw it</em></span>
              <AutoTextarea className="input ct-notes" value={item.notes} placeholder="The idea in a few lines… (reference pictures: add them on the right)" onChange={(e) => patch({ notes: e.target.value })} />
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
            {nextBar('idea')}
          </Section>

          <Section icon={Clapperboard} title="Script" now={now === 'script'} open={isOpen('script')} onToggle={() => toggle('script')}
            summary={item.beats.length ? `${item.beats.length} ${timed ? 'beats' : 'slides'}${timed && beatSecs ? ` · ${fmtSec(beatSecs)}` : ''}` : firstLine(item.script) || (beatsOn ? 'Hook → Body → CTA' : 'The text, the posts of a thread')}>
            {beatsOn && (
              <div className="ct-block">
                <span className="ct-label">{timed ? 'Beats' : 'Slides'} <em>— {timed ? 'what happens, the text on screen, how long' : 'one idea per slide; the first one hooks'}</em></span>
                <Beats beats={item.beats} timed={timed} onChange={setBeats} onRemoved={beatsRemoved}
                  ctaPicker={(b) => <SnippetPicker kind="cta" label="" current={b.screen} onPick={(t) => setBeats(item.beats.map((x) => (x.id === b.id ? { ...x, screen: t } : x)))} />} />
              </div>
            )}
            <label className="ct-block">
              <span className="ct-label">{beatsOn ? 'Voice-over & notes' : 'Draft'} <em>— {beatsOn ? 'what you say, sound, shots' : 'write it here, then put it into the caption'}</em></span>
              <AutoTextarea className="input ct-script" value={item.script} placeholder={beatsOn ? 'Sound: …\nVO: …' : 'The text…'} onChange={(e) => patch({ script: e.target.value })} />
            </label>
            {nextBar('script')}
          </Section>

          <Section icon={ListChecks} title="Production" now={now === 'production'} open={isOpen('production')} onToggle={() => toggle('production')}
            summary={`${checksDone} / ${checklist.length} done · ${item.media.length ? `${item.media.length} file${item.media.length === 1 ? '' : 's'}` : 'no pictures / videos yet'}`}>
            <Checklist format={item.format} checks={item.checks} onChange={(checks) => patch({ checks }, true)} />
            <div className="hint">The pictures / videos go {isTouch() ? 'below the preview' : 'on the right'} — the ★ one is the cover in the grid.</div>
            {nextBar('production')}
          </Section>

          <Section icon={Send} title="Caption & hashtags" now={now === 'publish'} open={isOpen('publish')} onToggle={() => toggle('publish')}
            summary={text ? `${charCount(text).toLocaleString()} characters · ${tags.length} hashtag${tags.length === 1 ? '' : 's'}${owns.length ? ` · own text for ${owns.map((p) => PLATFORMS[p].label).join(', ')}` : ''}` : 'Not written yet'}>
            {capPlatforms.length > 0 && (
              <div className="ct-captabs" role="tablist" aria-label="Text for">
                <button type="button" role="tab" aria-selected={tab === 'all'} className={tab === 'all' ? 'on' : ''} onClick={() => pickCapTab('all')}>Caption</button>
                {capPlatforms.map((p) => (
                  <button key={p} type="button" role="tab" aria-selected={tab === p} className={tab === p ? 'on' : ''} onClick={() => pickCapTab(p)} style={{ '--pc': PLATFORMS[p].color }}>
                    <PlatformIcon platform={p} size={13} /> {PLATFORMS[p].label}{ownText(item, p) && <PenLine size={11} className="ct-own-mark" />}
                  </button>
                ))}
              </div>
            )}
            {tab === 'all' ? (
              <>
                <div className="ct-block">
                  <div className="ct-label-row">
                    <span className="ct-label">Caption {owns.length > 0 && <em>— {owns.map((p) => PLATFORMS[p].label).join(', ')} {owns.length === 1 ? 'has its' : 'have their'} own</em>}</span>
                    <SnippetPicker kind="cta" label="Call to action" current={lastParagraph(item.caption)} onPick={pickCta} />
                  </div>
                  <AutoTextarea className="input ct-caption" value={item.caption} placeholder="The text that goes with it…" aria-label="Caption" onChange={(e) => patch({ caption: e.target.value })} />
                </div>
                <div className="ct-block">
                  <div className="ct-label-row">
                    <span className="ct-label"><Hash size={13} /> Hashtags <em>{tags.length ? `— ${tags.length}` : ''}</em></span>
                    <SnippetPicker kind="hashtags" label="Sets" current={item.hashtags} onPick={pickTags} />
                  </div>
                  <input className="input ct-tags" value={item.hashtags} placeholder="#motiondesign #branding …" aria-label="Hashtags" onChange={(e) => patch({ hashtags: e.target.value })} />
                </div>
                <div className="ct-counts">
                  {capPlatforms.map((p) => {
                    const k = count(p);
                    return (
                      <button key={p} type="button" className={`ct-count ${k.cls}`} title={`${PLATFORMS[p].tip}${ownText(item, p) ? ' · its own text' : ''}`} onClick={() => pickCapTab(p)}>
                        <PlatformIcon platform={p} size={12} /> {k.len.toLocaleString()} / {k.max.toLocaleString()}{ownText(item, p) && <PenLine size={10} />}
                      </button>
                    );
                  })}
                  {capPlatforms.includes('instagram') && !ownText(item, 'instagram') && tags.length > 30 && <span className="ct-count over">Instagram allows 30 hashtags</span>}
                  {capPlatforms.includes('instagram') && !ownText(item, 'instagram') && tags.length > 5 && tags.length <= 30 && <span className="ct-count near">3–5 focused hashtags usually do better</span>}
                  {!capPlatforms.length && <span className="hint">Pick the platforms to see their limits — and to give one its own text.</span>}
                  {text && <button type="button" className="btn btn-sm btn-ghost" onClick={() => copy(text, 'Caption')}><Copy size={13} /> Copy</button>}
                </div>
              </>
            ) : ownText(item, tab) || item.captions[tab] != null ? (
              <>
                <label className="ct-block">
                  <span className="ct-label"><PlatformIcon platform={tab} size={13} /> Its own text for {PLATFORMS[tab].label} <em>— instead of caption + hashtags</em></span>
                  <AutoTextarea className="input ct-caption" value={item.captions[tab] || ''} autoFocus
                    placeholder={tab === 'x' && item.format === 'thread' ? 'First post…\n---\nSecond post…' : `The text for ${PLATFORMS[tab].label}…`}
                    onChange={(e) => setOwn(tab, e.target.value)} />
                </label>
                {(() => {
                  const k = count(tab);
                  return (
                    <div className="ct-counts">
                      {k.parts ? k.parts.map((t, i) => {
                        const n = charCount(t);
                        return <span key={i} className={`ct-count ${n > 280 ? 'over' : n > 252 ? 'near' : ''}`}>{i + 1}/{k.parts.length} · {n} / 280</span>;
                      }) : <span className={`ct-count ${k.cls}`} title={PLATFORMS[tab].tip}><PlatformIcon platform={tab} size={12} /> {k.len.toLocaleString()} / {k.max.toLocaleString()}</span>}
                      {tab === 'x' && item.format === 'thread' && <span className="hint">A line of <code>---</code> starts the next post of the thread.</span>}
                      <span className="ct-gap" />
                      <button type="button" className="btn btn-sm btn-ghost" onClick={() => copy(textFor(item, tab), `${PLATFORMS[tab].label} text`)}><Copy size={13} /> Copy</button>
                      <button type="button" className="btn btn-sm btn-ghost" onClick={() => dropOwn(tab)}><Undo2 size={13} /> Use the caption</button>
                    </div>
                  );
                })()}
              </>
            ) : (
              <div className="ct-inherit">
                <p><PlatformIcon platform={tab} size={14} /> {PLATFORMS[tab].label} gets the caption + hashtags{(() => { const k = count(tab); return k.len > k.max ? <> — <b className="ct-over-text">{k.len.toLocaleString()} characters, {k.max.toLocaleString()} fit</b></> : null; })()}.</p>
                {text && <blockquote>{text}</blockquote>}
                <div className="ct-inherit-tools">
                  <button type="button" className="btn btn-sm" onClick={() => writeOwn(tab)}><PenLine size={14} /> Write its own for {PLATFORMS[tab].label}</button>
                  {text && <button type="button" className="btn btn-sm btn-ghost" onClick={() => copy(text, 'Caption')}><Copy size={13} /> Copy</button>}
                </div>
                <div className="hint">{PLATFORMS[tab].tip}</div>
              </div>
            )}
            {nextBar('publish')}
          </Section>

          {item.status === 'posted' && (
            <Section icon={BarChart3} title="Link & numbers" now={now === 'results'} open={isOpen('results')} onToggle={() => toggle('results')} className="ct-results"
              summary={[mt.views != null && `${fmtNum(mt.views)} views`, mt.likes != null && `${fmtNum(mt.likes)} likes`, rate != null && `${rate.toFixed(1)} % engaged`].filter(Boolean).join(' · ') || 'Add the link and how it did'}>
              <label className="ct-field"><span><Link2 size={12} /> Live at</span>
                <span className="ct-link-row">
                  <input className="input" value={item.link} placeholder="https://www.instagram.com/reel/…" inputMode="url" onChange={(e) => patch({ link: e.target.value })} />
                  {/^https?:\/\//.test(item.link) && <a className="btn btn-sm btn-ghost" href={item.link} target="_blank" rel="noreferrer"><ExternalLink size={13} /> Open</a>}
                </span>
              </label>
              <div className="ct-metrics">
                {METRICS.map((m) => (
                  <label key={m.key} className="ct-field"><span>{m.label}</span>
                    <input className="input" type="number" min="0" value={mt[m.key] ?? ''} placeholder="—"
                      onChange={(e) => patch({ metrics: { ...mt, [m.key]: e.target.value === '' ? null : Number(e.target.value) } })} />
                  </label>
                ))}
              </div>
              {rate != null && (
                <div className="ct-rate">
                  <b>{rate.toFixed(1)} %</b> engaged <em>— likes, comments, shares and saves per view</em>
                  {mt.saves != null && mt.views ? <span>· {((mt.saves / mt.views) * 100).toFixed(1)} % saved</span> : null}
                  {mt.follows != null && mt.views ? <span>· 1 follow per {Math.max(1, Math.round(mt.views / Math.max(1, mt.follows))).toLocaleString()} views</span> : null}
                </div>
              )}
            </Section>
          )}
        </div>

        <aside className="ct-side">
          <PostPreview c={item} profile={profile} platform={pvPlatform} onPlatform={setPvPlatform}
            onProfile={(p) => setProfile(p).catch((e) => toast(`Could not save: ${e.message}`, 'error'))} />

          <div className="ct-media-head">
            <b>Pictures &amp; videos</b>
            {item.media.length > 0 && <span>{item.media.length}</span>}
          </div>
          <div className="ct-media">
            {item.media.map((m, i) => (
              <figure key={m.id} className={`ct-media-item ${moving === m.id ? 'moving' : ''} ${cover?.id === m.id ? 'is-cover' : ''}`} draggable
                onDragStart={(e) => { setMoving(m.id); e.dataTransfer.effectAllowed = 'move'; }}
                onDragEnd={() => setMoving(null)}
                onDragOver={(e) => { if (moving) e.preventDefault(); }}
                onDrop={(e) => { if (moving) { e.preventDefault(); e.stopPropagation(); dropOn(m.id); } }}>
                {m.kind === 'video'
                  ? <video src={`${contentFileUrl(item, m.file)}#t=0.1`} muted preload="metadata" controls />
                  : <button type="button" className="ct-media-open" onClick={() => setLightbox(images.indexOf(m))} aria-label={`Open ${m.name || 'picture'}`}><img src={contentFileUrl(item, m.file)} alt="" loading="lazy" draggable={false} /></button>}
                <span className="ct-media-n">{i + 1}</span>
                <button type="button" className={`ct-media-star ${cover?.id === m.id ? 'on' : ''}`} onClick={() => setCover(m)}
                  aria-pressed={cover?.id === m.id} aria-label={cover?.id === m.id ? 'The cover' : 'Make it the cover'} title={cover?.id === m.id ? (item.coverId ? 'The cover — click to use the first again' : 'The cover (the first one)') : 'Make it the cover'}>
                  <Star size={12} fill={cover?.id === m.id ? 'currentColor' : 'none'} />
                </button>
                <button type="button" className="note-img-x" onClick={() => removeMedia(m)} aria-label="Remove" title="Remove"><X size={13} /></button>
              </figure>
            ))}
            {busy && <div className="ct-media-item ct-media-busy"><div className="spinner" /></div>}
          </div>
          <div className="ct-media-add">
            <button type="button" className="btn btn-sm" onClick={() => fileRef.current?.click()} disabled={busy}><UploadCloud size={14} /> Upload</button>
            <button type="button" className="btn btn-sm" onClick={() => setAppPick(true)} disabled={busy}><Library size={14} /> From the app</button>
          </div>
          <div className="hint">Drop or paste them anywhere on the page; drag to reorder. The ★ one is the cover — the first video plays in the preview.</div>
        </aside>
      </div>

      <input ref={fileRef} type="file" accept="image/*,video/*" multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
      {lightbox >= 0 && <Lightbox items={images.map((m) => ({ src: contentFileUrl(item, m.file), caption: m.name }))} index={lightbox} onIndex={setLightbox} onClose={() => setLightbox(-1)} />}
      {appPick && <MediaPicker accept="any" title="Picture or video from the app" onPick={addFromApp} onClose={() => setAppPick(false)} />}
      {drag && <div className="note-drop" aria-hidden="true"><ImagePlus size={26} /> Drop pictures or videos to add them</div>}
      {planOpen && <ContentPlanDialog onClose={() => setPlanOpen(false)} />}
      {dialog}
    </div>
  );
}
