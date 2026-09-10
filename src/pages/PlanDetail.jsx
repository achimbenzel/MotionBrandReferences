import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Trash2, Pencil, MoreHorizontal, CalendarRange, Images, StickyNote,
  ListChecks, Paperclip, UploadCloud, X, Plus, Check, ChevronDown, ChevronRight,
  Image as ImageIcon, Camera, ArrowUp, ArrowDown, File as FileIcon, ExternalLink,
  Link2, Library, FolderOpen, Palette as PaletteIcon, Heading as HeadingIcon,
  Minus, Table as TableIcon, Wand2, Copy,
} from 'lucide-react';
import { api, planFileUrl, fileUrl } from '../lib/api.js';
import { PLAN_GRADIENTS, gradientCss, normalizeUrl, hostOf } from '../lib/types.js';
import { rgbToHex, hexToRgb } from '../lib/color.js';
import { extractPalette } from '../lib/imaging.js';
import { useToast } from '../components/Toast.jsx';
import Menu from '../components/Menu.jsx';
import Lightbox from '../components/Lightbox.jsx';
import GalleryNameModal from '../components/GalleryNameModal.jsx';
import RefPicker from '../components/RefPicker.jsx';
import FileAddModal from '../components/FileAddModal.jsx';
import ProjectCard from '../components/ProjectCard.jsx';

const rid = () => Math.random().toString(36).slice(2, 8);

const PLAN_EMOJIS = ['🎨', '✏️', '🖌️', '🧠', '💡', '🚀', '🔥', '⭐', '🌈', '🎯',
  '📦', '🏷️', '🖼️', '📐', '🧩', '🎬', '📸', '🎵', '🏗️', '🛠️',
  '💎', '🌱', '☕', '📊', '🗂️', '🔮', '🦄', '🍎', '🌍', '🏀'];
function firstEmoji(str) {
  const t = String(str || '').trim();
  if (!t) return '';
  try { const seg = new Intl.Segmenter(undefined, { granularity: 'grapheme' }); return [...seg.segment(t)][0].segment; }
  catch { return [...t][0]; }
}

const BLOCK_META = {
  moodboard: { label: 'Moodboard', icon: Images },
  text: { label: 'Text', icon: StickyNote },
  todos: { label: 'To-dos', icon: ListChecks },
  files: { label: 'Files', icon: Paperclip },
  links: { label: 'Links', icon: Link2 },
  refs: { label: 'References', icon: Library },
  palette: { label: 'Palette', icon: PaletteIcon },
  heading: { label: 'Heading', icon: HeadingIcon },
  divider: { label: 'Divider', icon: Minus },
  table: { label: 'Table', icon: TableIcon },
};
const fmtSum = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(2));
const toNum = (v) => Number(String(v ?? '').trim().replace(',', '.'));
const fmtBytes = (n) => {
  if (n == null) return '';
  const u = ['B', 'KB', 'MB', 'GB']; let v = n; let i = 0;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i += 1; }
  return `${v.toFixed(v < 10 && i > 0 ? 1 : 0)} ${u[i]}`;
};

export default function PlanDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [plan, setPlan] = useState(null);
  const [error, setError] = useState(null);
  const [milestones, setMilestones] = useState([]);
  const [lightbox, setLightbox] = useState(null); // { items, index }
  const [renaming, setRenaming] = useState(false);
  const [renameBlock, setRenameBlock] = useState(null); // block being renamed
  const [addOpen, setAddOpen] = useState(false);
  const [refPickerBlock, setRefPickerBlock] = useState(null); // block id currently picking references
  const [fileModalBlock, setFileModalBlock] = useState(null); // block id for the add-file modal
  const [refCache, setRefCache] = useState({}); // `${refKind}:${refId}` -> { project?|gallery?+members?|gone? }
  const [bannerPicker, setBannerPicker] = useState(false);
  const [avatarPicker, setAvatarPicker] = useState(false);
  const [emojiInput, setEmojiInput] = useState('');
  const [dragBlock, setDragBlock] = useState(null);
  const skipMs = useRef(true);
  const planRef = useRef(null);
  const bannerRef = useRef(null);
  const avatarRef = useRef(null);
  const filesRef = useRef(null);
  const paletteRef = useRef(null);
  const refReq = useRef(new Set()); // referenced ids already fetched, so we load each once
  const pending = useRef(null);       // { blockId } for the files/cover inputs
  const lastMoodboard = useRef(null); // block id for paste target
  const timers = useRef({});
  const pendingPatch = useRef({});    // per-block accumulated patch awaiting a debounced save
  planRef.current = plan;

  useEffect(() => {
    let alive = true;
    setPlan(null); setError(null); skipMs.current = true;
    api.getPlan(id).then((p) => {
      if (!alive) return;
      setPlan(p); setMilestones(p.milestones || []);
    }).catch((e) => { if (alive) setError(e.message); });
    return () => { alive = false; };
  }, [id]);

  useEffect(() => {
    if (skipMs.current) { skipMs.current = false; return; }
    const t = setTimeout(() => api.updatePlan(id, { milestones }).then(setPlan).catch((e) => toast(`Could not save: ${e.message}`, 'error')), 500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [milestones]);

  // Paste images into the last-used (or first) moodboard block.
  useEffect(() => {
    const onPaste = async (e) => {
      const files = [...(e.clipboardData?.items || [])]
        .filter((it) => it.type.startsWith('image/')).map((it) => it.getAsFile()).filter(Boolean);
      if (!files.length) return;
      const boards = (planRef.current?.blocks || []).filter((b) => b.type === 'moodboard');
      if (!boards.length) return;
      e.preventDefault();
      const target = boards.find((b) => b.id === lastMoodboard.current) || boards[0];
      try { setPlan(await api.addBlockFiles(id, target.id, files)); lastMoodboard.current = target.id; toast(`Pasted into “${target.title}”`); }
      catch (err) { toast(`Paste failed: ${err.message}`, 'error'); }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const patch = (p) => api.updatePlan(id, p).then(setPlan).catch((e) => toast(`Could not save: ${e.message}`, 'error'));

  // Header images (banner / avatar)
  const setImage = async (kind, file) => { if (!file) return; try { setPlan(await api.setPlanImage(id, kind, file)); } catch (e) { toast(`Upload failed: ${e.message}`, 'error'); } };
  const pickGradient = async (gid) => {
    try { if (plan.banner) await api.removePlanImage(id, 'banner'); setPlan(await api.updatePlan(id, { bannerGradient: gid })); setBannerPicker(false); }
    catch (e) { toast(`Failed: ${e.message}`, 'error'); }
  };
  const removeBanner = async () => {
    try { if (plan.banner) setPlan(await api.removePlanImage(id, 'banner')); else setPlan(await api.updatePlan(id, { bannerGradient: null })); }
    catch (e) { toast(`Failed: ${e.message}`, 'error'); }
  };
  const pickEmoji = async (raw) => {
    const emoji = firstEmoji(raw); if (!emoji) return;
    try { if (plan.avatar) await api.removePlanImage(id, 'avatar'); setPlan(await api.updatePlan(id, { avatarEmoji: emoji })); setEmojiInput(''); setAvatarPicker(false); }
    catch (e) { toast(`Failed: ${e.message}`, 'error'); }
  };
  const removeAvatar = async () => {
    try { if (plan.avatar) setPlan(await api.removePlanImage(id, 'avatar')); else setPlan(await api.updatePlan(id, { avatarEmoji: null })); setAvatarPicker(false); }
    catch (e) { toast(`Failed: ${e.message}`, 'error'); }
  };

  const remove = async () => {
    try {
      const { trashId } = await api.removePlan(id);
      navigate('/plan');
      toast('Moved to Trash', 'ok', { label: 'Undo', onClick: async () => { try { await api.restoreTrash(trashId); navigate(`/plan/${id}`); } catch (e) { toast(`Undo failed: ${e.message}`, 'error'); } } });
    } catch (e) { toast(`Delete failed: ${e.message}`, 'error'); }
  };

  // Milestones
  const addMilestone = () => setMilestones((m) => [...m, { id: rid(), title: '', date: '', done: false }]);
  const editMilestone = (mid, p) => setMilestones((m) => m.map((x) => (x.id === mid ? { ...x, ...p } : x)));
  const removeMilestone = (mid) => setMilestones((m) => m.filter((x) => x.id !== mid));

  // Blocks
  const addBlock = async (type) => { setAddOpen(false); try { setPlan(await api.addBlock(id, type)); } catch (e) { toast(`Could not add block: ${e.message}`, 'error'); } };
  const moveBlock = async (bid, dir) => { try { setPlan(await api.moveBlock(id, bid, dir)); } catch (e) { toast(`Failed: ${e.message}`, 'error'); } };
  const deleteBlock = async (b) => {
    const heavy = (b.images && b.images.length) || (b.files && b.files.length);
    if (heavy && !window.confirm(`Delete the “${b.title}” block and its files?`)) return;
    try { setPlan(await api.removeBlock(id, b.id)); } catch (e) { toast(`Failed: ${e.message}`, 'error'); }
  };
  const editBlock = (bid, p, immediate = false) => {
    setPlan((prev) => ({ ...prev, blocks: prev.blocks.map((b) => (b.id === bid ? { ...b, ...p } : b)) }));
    clearTimeout(timers.current[bid]);
    // Merge patches so a later edit to one field can't cancel a pending save of another.
    pendingPatch.current[bid] = { ...(pendingPatch.current[bid] || {}), ...p };
    const send = () => {
      const patch = pendingPatch.current[bid]; delete pendingPatch.current[bid];
      if (patch) api.updateBlock(id, bid, patch).catch((e) => toast(`Could not save: ${e.message}`, 'error'));
    };
    if (immediate) send(); else timers.current[bid] = setTimeout(send, 500);
  };
  const addFilesTo = (bid) => { pending.current = bid; filesRef.current?.click(); };
  const onFiles = async (files) => { if (!files?.length || !pending.current) return; try { setPlan(await api.addBlockFiles(id, pending.current, files)); } catch (e) { toast(`Upload failed: ${e.message}`, 'error'); } };
  // Add one file (with example image + title) to a files block via the modal.
  const submitFile = async ({ file, example, title }) => {
    if (!fileModalBlock) return;
    try { setPlan(await api.addBlockFile(id, fileModalBlock, { file, example, title })); setFileModalBlock(null); }
    catch (e) { toast(`Upload failed: ${e.message}`, 'error'); }
  };
  const removeFile = async (bid, fid) => {
    try {
      const res = await api.removeBlockFile(id, bid, fid);
      if (res.plan) setPlan(res.plan);
      if (res.trashId) {
        toast('Moved to Trash', 'ok', { label: 'Undo', onClick: async () => {
          try { await api.restoreTrash(res.trashId); setPlan(await api.getPlan(id)); } catch (e) { toast(`Undo failed: ${e.message}`, 'error'); }
        } });
      }
    } catch (e) { toast(`Failed: ${e.message}`, 'error'); }
  };

  // References block — attach existing library items (projects / galleries).
  const addRef = (bid, item) => {
    const b = (planRef.current?.blocks || []).find((x) => x.id === bid); if (!b) return;
    if ((b.items || []).some((r) => r.refKind === item.kind && r.refId === item.id)) return;
    const next = [...(b.items || []), { id: rid(), refKind: item.kind, refId: item.id, refType: item.type || null, title: item.title, subtitle: item.subtitle || '', thumb: item.thumb || null }];
    editBlock(bid, { items: next }, true);
  };
  const removeRef = (bid, itemId) => {
    const b = (planRef.current?.blocks || []).find((x) => x.id === bid); if (!b) return;
    editBlock(bid, { items: (b.items || []).filter((r) => r.id !== itemId) }, true);
  };
  const openRef = (r) => navigate(r.refKind === 'gallery' ? `/gallery/${r.refId}` : `/project/${r.refId}`);

  // Load full data for referenced library items so they render as real cards.
  useEffect(() => {
    const items = (plan?.blocks || []).filter((b) => b.type === 'refs').flatMap((b) => b.items || []);
    items.forEach((r) => {
      const key = `${r.refKind}:${r.refId}`;
      if (refReq.current.has(key)) return;
      refReq.current.add(key);
      (async () => {
        try {
          if (r.refKind === 'gallery') {
            const g = await api.getGallery(r.refId);
            const members = [];
            for (const mid of (g.projectIds || [])) {
              try { members.push(await api.get(mid)); } catch { /* skip missing member */ }
              if (members.filter((m) => m.thumb).length >= 4) break;
            }
            setRefCache((c) => ({ ...c, [key]: { gallery: g, members } }));
          } else {
            const project = await api.get(r.refId);
            setRefCache((c) => ({ ...c, [key]: { project } }));
          }
        } catch { setRefCache((c) => ({ ...c, [key]: { gone: true } })); }
      })();
    });
  }, [plan]);

  // Palette block — swatches (hex + optional name), or extract from an image.
  const extractInto = (bid) => { pending.current = bid; paletteRef.current?.click(); };
  const onExtract = async (file) => {
    if (!file || !pending.current) return;
    const bid = pending.current;
    try {
      const rgbs = await extractPalette(file, 6);
      const b = (planRef.current?.blocks || []).find((x) => x.id === bid); if (!b) return;
      const add = rgbs.map((c) => ({ id: rid(), hex: rgbToHex(c), name: '' }));
      editBlock(bid, { items: [...(b.items || []), ...add] }, true);
      toast(`Added ${add.length} colour${add.length === 1 ? '' : 's'}`);
    } catch (e) { toast(`Could not extract colours: ${e.message}`, 'error'); }
  };
  const copyHex = async (hex) => { try { await navigator.clipboard.writeText(hex); toast(`Copied ${hex}`); } catch { toast('Copy failed', 'error'); } };

  // Table block — always persist columns + rows together so no edit is lost.
  const saveTable = (b, columns, rows, immediate = false) => editBlock(b.id, { columns, rows }, immediate);

  if (error) return <div className="detail"><BackBtn /> <div className="center-msg">Couldn’t load: {error}</div></div>;
  if (!plan) return <div className="detail"><div className="spinner" /></div>;

  const bannerUrl = plan.banner ? planFileUrl(plan, plan.banner) : null;
  const bannerGrad = !bannerUrl ? gradientCss(plan.bannerGradient) : null;
  const hasBanner = !!(bannerUrl || bannerGrad);
  const bannerStyle = bannerUrl ? { backgroundImage: `url("${bannerUrl}")` } : bannerGrad ? { backgroundImage: bannerGrad } : undefined;
  const avatarUrl = plan.avatar ? planFileUrl(plan, plan.avatar) : null;
  const avatarEmoji = !avatarUrl ? (plan.avatarEmoji || null) : null;

  const blockMenu = (b, i) => [
    ...(b.type === 'heading' || b.type === 'divider' ? [] : [{ label: 'Rename', icon: <Pencil size={15} />, onClick: () => setRenameBlock(b) }]),
    ...(i > 0 ? [{ label: 'Move up', icon: <ArrowUp size={15} />, onClick: () => moveBlock(b.id, 'up') }] : []),
    ...(i < plan.blocks.length - 1 ? [{ label: 'Move down', icon: <ArrowDown size={15} />, onClick: () => moveBlock(b.id, 'down') }] : []),
    { separator: true },
    { label: 'Delete block', icon: <Trash2 size={15} />, danger: true, onClick: () => deleteBlock(b) },
  ];

  return (
    <div className="detail">
      <div className="plan-topbar">
        <BackBtn to="/plan" label="Back to Plans" />
        <Menu
          trigger={<button className="btn btn-sm"><Pencil size={15} /> Edit <MoreHorizontal size={15} /></button>}
          items={[
            { label: 'Rename', icon: <Pencil size={15} />, onClick: () => setRenaming(true) },
            { separator: true },
            { label: 'Delete plan', icon: <Trash2 size={15} />, danger: true, onClick: remove },
          ]}
        />
      </div>

      {/* Banner + avatar */}
      <div className={`plan-banner ${hasBanner ? '' : 'empty'}`} style={bannerStyle}>
        <div className="plan-banner-actions">
          <button className="btn btn-sm" onClick={() => setBannerPicker((v) => !v)}><ImageIcon size={15} /> {hasBanner ? 'Change banner' : 'Add banner'}</button>
          {hasBanner && <button className="btn btn-sm btn-ghost" onClick={removeBanner}>Remove</button>}
        </div>
        {bannerPicker && <div className="banner-picker-backdrop" onClick={() => setBannerPicker(false)} />}
        {bannerPicker && (
          <div className="banner-picker" onMouseDown={(e) => e.stopPropagation()}>
            <div className="banner-picker-head">Gradients</div>
            <div className="banner-picker-grid">
              {PLAN_GRADIENTS.map((g) => (
                <button key={g.id} className={`banner-swatch ${plan.bannerGradient === g.id && !bannerUrl ? 'on' : ''}`}
                  style={{ backgroundImage: g.css }} title={g.id} onClick={() => pickGradient(g.id)} />
              ))}
            </div>
            <button className="btn btn-sm banner-picker-upload" onClick={() => { setBannerPicker(false); bannerRef.current?.click(); }}>
              <UploadCloud size={14} /> Upload custom image…
            </button>
          </div>
        )}
      </div>
      <div className="plan-idrow">
        <div className="plan-avatar-wrap">
          <button className="plan-avatar" onClick={() => setAvatarPicker((v) => !v)} title="Change profile image">
            {avatarUrl ? <img src={avatarUrl} alt="" />
              : avatarEmoji ? <span className="plan-avatar-emoji">{avatarEmoji}</span>
                : <span>{(plan.name || '?').charAt(0).toUpperCase()}</span>}
            <span className="plan-avatar-edit"><Camera size={15} /></span>
          </button>
          {avatarPicker && <div className="avatar-picker-backdrop" onClick={() => setAvatarPicker(false)} />}
          {avatarPicker && (
            <div className="avatar-picker" onMouseDown={(e) => e.stopPropagation()}>
              <div className="avatar-picker-emojis">
                {PLAN_EMOJIS.map((e) => (
                  <button key={e} className={`ap-emoji ${plan.avatarEmoji === e && !avatarUrl ? 'on' : ''}`} onClick={() => pickEmoji(e)}>{e}</button>
                ))}
              </div>
              <input className="input ap-input" value={emojiInput} placeholder="Type or paste an emoji…"
                onChange={(ev) => setEmojiInput(ev.target.value)}
                onKeyDown={(ev) => { if (ev.key === 'Enter') { ev.preventDefault(); pickEmoji(emojiInput); } }} />
              <div className="ap-actions">
                <button className="btn btn-sm" onClick={() => { setAvatarPicker(false); avatarRef.current?.click(); }}><UploadCloud size={14} /> Upload image…</button>
                {(avatarUrl || plan.avatarEmoji) && <button className="btn btn-sm btn-ghost" onClick={removeAvatar}>Remove</button>}
              </div>
            </div>
          )}
        </div>
        <h1 className="plan-name">{plan.name}</h1>
      </div>

      <input ref={bannerRef} type="file" accept="image/*" className="visually-hidden-input" onChange={(e) => { setImage('banner', e.target.files[0]); e.target.value = ''; }} />
      <input ref={avatarRef} type="file" accept="image/*" className="visually-hidden-input" onChange={(e) => { setImage('avatar', e.target.files[0]); e.target.value = ''; }} />
      <input ref={filesRef} type="file" multiple className="visually-hidden-input" onChange={(e) => { onFiles(e.target.files); e.target.value = ''; }} />
      <input ref={paletteRef} type="file" accept="image/*" className="visually-hidden-input" onChange={(e) => { onExtract(e.target.files[0]); e.target.value = ''; }} />

      {/* Timeframe + milestones (fixed) */}
      <div className="section">
        <div className="section-head"><h2><CalendarRange size={16} /> Timeframe</h2></div>
        <div className="row-2">
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Start</label>
            <input type="date" className="input" value={plan.start || ''} onChange={(e) => patch({ start: e.target.value })} />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>End</label>
            <input type="date" className="input" value={plan.end || ''} onChange={(e) => patch({ end: e.target.value })} />
          </div>
        </div>
        <div className="milestones">
          {milestones.map((m) => (
            <div className={`milestone ${m.done ? 'done' : ''}`} key={m.id}>
              <button className={`ms-check ${m.done ? 'on' : ''}`} onClick={() => editMilestone(m.id, { done: !m.done })} title="Toggle done">{m.done && <Check size={13} />}</button>
              <input className="ms-title input" value={m.title} placeholder="Milestone…" onChange={(e) => editMilestone(m.id, { title: e.target.value })} />
              <input className="ms-date input" type="date" value={m.date || ''} onChange={(e) => editMilestone(m.id, { date: e.target.value })} />
              <button className="ms-del icon-btn" onClick={() => removeMilestone(m.id)}><X size={14} /></button>
            </div>
          ))}
          <button className="btn btn-ghost btn-sm ms-add" onClick={addMilestone}><Plus size={15} /> Add milestone</button>
        </div>
      </div>

      {/* Content blocks (dynamic) */}
      {plan.blocks.map((b, i) => {
        const Meta = BLOCK_META[b.type] || BLOCK_META.text;
        const menu = <Menu align="right" trigger={<button className="icon-btn" style={{ width: 34, height: 34 }}><MoreHorizontal size={16} /></button>} items={blockMenu(b, i)} />;

        if (b.type === 'moodboard') {
          return (
            <div className={`section block moodboard ${dragBlock === b.id ? 'dragover' : ''}`} key={b.id}
              onDragOver={(e) => { e.preventDefault(); setDragBlock(b.id); }}
              onDragLeave={(e) => { if (e.target === e.currentTarget) setDragBlock(null); }}
              onDrop={(e) => { e.preventDefault(); setDragBlock(null); pending.current = b.id; lastMoodboard.current = b.id; onFiles(e.dataTransfer.files); }}>
              <div className="moodboard-head">
                <button className="mb-collapse" onClick={() => editBlock(b.id, { collapsed: !b.collapsed }, true)}>
                  {b.collapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                  <Meta.icon size={16} /><span className="mb-name">{b.title}</span>
                  <span className="count">{(b.images || []).length}</span>
                </button>
                <div className="moodboard-actions">
                  <button className="btn btn-sm" onClick={() => { lastMoodboard.current = b.id; addFilesTo(b.id); }}><UploadCloud size={14} /> Add images</button>
                  {menu}
                </div>
              </div>
              {!b.collapsed && ((b.images || []).length ? (
                <div className="masonry">
                  {b.images.map((im, idx) => (
                    <div className="masonry-item" key={im.id}>
                      <img src={planFileUrl(plan, im.file)} alt="" loading="lazy"
                        onClick={() => setLightbox({ items: b.images.map((x) => ({ src: planFileUrl(plan, x.file) })), index: idx })} />
                      <div className="masonry-menu" onClick={(e) => e.stopPropagation()}>
                        <button className="icon-btn masonry-menu-btn" title="Remove" onClick={() => removeFile(b.id, im.id)}><X size={15} /></button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="dropzone" onClick={() => { lastMoodboard.current = b.id; addFilesTo(b.id); }}>
                  <UploadCloud size={20} /><div>Drop or select images · or paste (⌘V)</div>
                </div>
              ))}
            </div>
          );
        }

        if (b.type === 'text') {
          return (
            <div className="section block" key={b.id}>
              <div className="section-head"><h2><Meta.icon size={16} /> {b.title}</h2>{menu}</div>
              <textarea className="textarea notes-textarea" value={b.content || ''}
                onChange={(e) => editBlock(b.id, { content: e.target.value })} placeholder="Write here…" />
            </div>
          );
        }

        if (b.type === 'todos') {
          const items = b.items || [];
          const setItems = (next) => editBlock(b.id, { items: next });
          return (
            <div className="section block" key={b.id}>
              <div className="section-head">
                <h2><Meta.icon size={16} /> {b.title} {items.length > 0 && <span className="count">{items.filter((t) => t.done).length}/{items.length}</span>}</h2>{menu}
              </div>
              <div className="milestones">
                {items.map((t) => (
                  <div className={`milestone ${t.done ? 'done' : ''}`} key={t.id}>
                    <button className={`ms-check ${t.done ? 'on' : ''}`} onClick={() => setItems(items.map((x) => (x.id === t.id ? { ...x, done: !x.done } : x)))}>{t.done && <Check size={13} />}</button>
                    <input className="ms-title input" value={t.text} placeholder="To-do…" onChange={(e) => setItems(items.map((x) => (x.id === t.id ? { ...x, text: e.target.value } : x)))} />
                    <button className="ms-del icon-btn" onClick={() => setItems(items.filter((x) => x.id !== t.id))}><X size={14} /></button>
                  </div>
                ))}
                <button className="btn btn-ghost btn-sm ms-add" onClick={() => setItems([...items, { id: rid(), text: '', done: false }])}><Plus size={15} /> Add to-do</button>
              </div>
            </div>
          );
        }

        if (b.type === 'links') {
          const items = b.items || [];
          const setItems = (next) => editBlock(b.id, { items: next });
          return (
            <div className="section block" key={b.id}>
              <div className="section-head">
                <h2><Meta.icon size={16} /> {b.title} {items.length > 0 && <span className="count">{items.length}</span>}</h2>
                <div className="moodboard-actions">
                  <button className="btn btn-sm" onClick={() => setItems([...items, { id: rid(), url: '', title: '' }])}><Plus size={14} /> Add link</button>{menu}
                </div>
              </div>
              {items.length ? (
                <div className="linklist">
                  {items.map((it) => (
                    <div className="linkrow" key={it.id}>
                      <Link2 size={17} className="linkrow-icon" />
                      <input className="input linkrow-title" value={it.title} placeholder={hostOf(it.url) || 'Label…'}
                        onChange={(e) => setItems(items.map((x) => (x.id === it.id ? { ...x, title: e.target.value } : x)))} />
                      <input className="input linkrow-url" value={it.url} placeholder="https://…"
                        onChange={(e) => setItems(items.map((x) => (x.id === it.id ? { ...x, url: e.target.value } : x)))} />
                      <a className={`icon-btn linkrow-open ${it.url ? '' : 'is-disabled'}`} href={it.url ? normalizeUrl(it.url) : undefined}
                        target="_blank" rel="noopener noreferrer" title="Open link"><ExternalLink size={15} /></a>
                      <button className="icon-btn linkrow-del" onClick={() => setItems(items.filter((x) => x.id !== it.id))} title="Remove"><X size={15} /></button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="dropzone" onClick={() => setItems([{ id: rid(), url: '', title: '' }])}>
                  <Link2 size={20} /><div>Add a link — inspiration, references, client sites…</div>
                </div>
              )}
            </div>
          );
        }

        if (b.type === 'refs') {
          const items = b.items || [];
          return (
            <div className="section block" key={b.id}>
              <div className="section-head">
                <h2><Meta.icon size={16} /> {b.title} {items.length > 0 && <span className="count">{items.length}</span>}</h2>
                <div className="moodboard-actions">
                  <button className="btn btn-sm" onClick={() => setRefPickerBlock(b.id)}><Plus size={14} /> Add reference</button>{menu}
                </div>
              </div>
              {items.length ? (
                <div className="grid ref-grid">
                  {items.map((r) => {
                    const data = refCache[`${r.refKind}:${r.refId}`];
                    if (data?.project) return <ProjectCard key={r.id} project={data.project} onRemove={() => removeRef(b.id, r.id)} removeTitle="Remove reference" />;
                    if (data?.gallery) {
                      const covers = (data.members || []).filter((m) => m.thumb).slice(0, 4);
                      const count = (data.gallery.projectIds || []).length;
                      return (
                        <div className="card gallery-card" key={r.id} onClick={() => openRef(r)}>
                          <button className="card-remove icon-btn" title="Remove reference" onClick={(e) => { e.stopPropagation(); removeRef(b.id, r.id); }}><X size={15} /></button>
                          <div className="gallery-mosaic">
                            {covers.length ? covers.map((m) => <img key={m.id} src={fileUrl(m, m.thumb)} alt="" loading="lazy" />)
                              : <div className="card-thumb-empty"><FolderOpen size={26} /></div>}
                          </div>
                          <div className="card-meta"><span className="card-title">{data.gallery.name}</span></div>
                          <div className="card-sub">{count} {count === 1 ? 'project' : 'projects'}</div>
                        </div>
                      );
                    }
                    if (data?.gone) return (
                      <div className="card ref-gone" key={r.id}>
                        <button className="card-remove icon-btn" title="Remove reference" onClick={() => removeRef(b.id, r.id)}><X size={15} /></button>
                        <div className="card-thumb"><div className="card-thumb-empty"><FileIcon size={22} /></div></div>
                        <div className="card-meta"><span className="card-title">{r.title || 'Missing item'}</span></div>
                        <div className="card-sub">No longer in your library</div>
                      </div>
                    );
                    return (
                      <div className="card ref-loading" key={r.id}>
                        <div className="card-thumb"><div className="spinner" /></div>
                        <div className="card-meta"><span className="card-title">{r.title || '…'}</span></div>
                        <div className="card-sub">{r.subtitle || 'Loading…'}</div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="dropzone" onClick={() => setRefPickerBlock(b.id)}>
                  <Library size={20} /><div>Attach projects or galleries from your library</div>
                </div>
              )}
            </div>
          );
        }

        if (b.type === 'palette') {
          const items = b.items || [];
          const setItems = (next) => editBlock(b.id, { items: next });
          const patchSwatch = (sid, p) => setItems(items.map((s) => (s.id === sid ? { ...s, ...p } : s)));
          return (
            <div className="section block" key={b.id}>
              <div className="section-head">
                <h2><Meta.icon size={16} /> {b.title} {items.length > 0 && <span className="count">{items.length}</span>}</h2>
                <div className="moodboard-actions">
                  <button className="btn btn-sm" onClick={() => extractInto(b.id)}><Wand2 size={14} /> Extract from image</button>
                  <button className="btn btn-sm" onClick={() => setItems([...items, { id: rid(), hex: '#5B8CFF', name: '' }])}><Plus size={14} /> Add color</button>
                  {menu}
                </div>
              </div>
              {items.length ? (
                <div className="swatchlist">
                  {items.map((sw) => {
                    const rgb = hexToRgb(sw.hex);
                    const colorVal = rgb ? rgbToHex(rgb).toLowerCase() : '#000000';
                    return (
                      <div className="swatch" key={sw.id}>
                        <label className="swatch-chip" style={{ background: sw.hex || 'var(--surface-2)' }} title="Pick colour">
                          <input type="color" value={colorVal} onChange={(e) => patchSwatch(sw.id, { hex: e.target.value.toUpperCase() })} />
                          <span className="swatch-actions" onClick={(e) => e.preventDefault()}>
                            <button className="icon-btn" title="Copy hex" onClick={() => copyHex(sw.hex)}><Copy size={13} /></button>
                            <button className="icon-btn" title="Remove" onClick={() => setItems(items.filter((x) => x.id !== sw.id))}><X size={13} /></button>
                          </span>
                        </label>
                        <div className="swatch-body">
                          <input className="input swatch-hex" value={sw.hex} onChange={(e) => patchSwatch(sw.id, { hex: e.target.value })} spellCheck={false} />
                          <input className="input swatch-name" value={sw.name} placeholder="Name…" onChange={(e) => patchSwatch(sw.id, { name: e.target.value })} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="dropzone" onClick={() => extractInto(b.id)}>
                  <PaletteIcon size={20} /><div>Extract colours from an image · or add them by hand</div>
                </div>
              )}
            </div>
          );
        }

        if (b.type === 'heading') {
          return (
            <div className="section block block-structural" key={b.id}>
              <div className="heading-row">
                <div className="heading-fields">
                  <input className="heading-input" value={b.title} placeholder="Section heading"
                    onChange={(e) => editBlock(b.id, { title: e.target.value })} />
                  <input className="heading-sub" value={b.content || ''} placeholder="Add a description…"
                    onChange={(e) => editBlock(b.id, { content: e.target.value })} />
                </div>
                {menu}
              </div>
            </div>
          );
        }

        if (b.type === 'divider') {
          return (
            <div className="section block block-structural block-divider" key={b.id}>
              <div className="divider-row"><hr className="block-hr" />{menu}</div>
            </div>
          );
        }

        if (b.type === 'table') {
          const columns = b.columns || [];
          const rows = b.rows || [];
          const colSums = columns.map((c) => {
            const vals = rows.map((r) => String(r.cells?.[c.id] ?? '').trim()).filter((v) => v !== '');
            if (!vals.length || !vals.every((v) => isFinite(toNum(v)))) return null;
            return vals.reduce((s, v) => s + toNum(v), 0);
          });
          const showSums = colSums.some((s) => s !== null);
          return (
            <div className="section block" key={b.id}>
              <div className="section-head">
                <h2><Meta.icon size={16} /> {b.title}</h2>
                <div className="moodboard-actions">
                  <button className="btn btn-sm" onClick={() => saveTable(b, columns, [...rows, { id: rid(), cells: {} }], true)}><Plus size={14} /> Add row</button>
                  {menu}
                </div>
              </div>
              <div className="table-scroll">
                <table className="plan-table">
                  <thead>
                    <tr>
                      {columns.map((c) => (
                        <th key={c.id}>
                          <div className="th-inner">
                            <input className="cell-input th-input" value={c.name} placeholder=""
                              onChange={(e) => saveTable(b, columns.map((x) => (x.id === c.id ? { ...x, name: e.target.value } : x)), rows)} />
                            <button className="icon-btn th-del" title="Remove column"
                              onClick={() => saveTable(b, columns.filter((x) => x.id !== c.id), rows.map((r) => { const cells = { ...r.cells }; delete cells[c.id]; return { ...r, cells }; }), true)}><X size={13} /></button>
                          </div>
                        </th>
                      ))}
                      <th className="th-add"><button className="icon-btn" title="Add column" onClick={() => saveTable(b, [...columns, { id: rid(), name: '' }], rows, true)}><Plus size={15} /></button></th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id}>
                        {columns.map((c) => (
                          <td key={c.id}>
                            <input className="cell-input" value={r.cells?.[c.id] || ''}
                              onChange={(e) => saveTable(b, columns, rows.map((x) => (x.id === r.id ? { ...x, cells: { ...x.cells, [c.id]: e.target.value } } : x)))} />
                          </td>
                        ))}
                        <td className="row-del-cell"><button className="icon-btn row-del" title="Remove row" onClick={() => saveTable(b, columns, rows.filter((x) => x.id !== r.id), true)}><X size={14} /></button></td>
                      </tr>
                    ))}
                  </tbody>
                  {showSums && (
                    <tfoot>
                      <tr>
                        {columns.map((c, ci) => <td key={c.id} className="sum-cell">{colSums[ci] === null ? '' : `Σ ${fmtSum(colSums[ci])}`}</td>)}
                        <td className="row-del-cell" />
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
              {!rows.length && <div className="table-empty">No rows yet — “Add row” to start.</div>}
            </div>
          );
        }

        // files — each file shows a square example image before it.
        return (
          <div className={`section block ${dragBlock === b.id ? 'dragover' : ''}`} key={b.id}
            onDragOver={(e) => { e.preventDefault(); setDragBlock(b.id); }}
            onDragLeave={(e) => { if (e.target === e.currentTarget) setDragBlock(null); }}
            onDrop={(e) => { e.preventDefault(); setDragBlock(null); pending.current = b.id; onFiles(e.dataTransfer.files); }}>
            <div className="section-head">
              <h2><Meta.icon size={16} /> {b.title} {(b.files || []).length > 0 && <span className="count">{b.files.length}</span>}</h2>
              <div className="moodboard-actions">
                <button className="btn btn-sm" onClick={() => setFileModalBlock(b.id)}><Plus size={14} /> Add file</button>{menu}
              </div>
            </div>

            {(b.files || []).length ? (
              <div className="filelist">
                {b.files.map((f) => {
                  const ex = f.example ? planFileUrl(plan, f.example) : null;
                  return (
                    <div className="filerow" key={f.id}>
                      <a className="filerow-ex" href={planFileUrl(plan, f.file)} target="_blank" rel="noopener noreferrer" title={f.title || f.name}>
                        {ex ? <img src={ex} alt="" loading="lazy" /> : <FileIcon size={20} />}
                      </a>
                      <div className="filerow-main">
                        <a className="filerow-name" href={planFileUrl(plan, f.file)} target="_blank" rel="noopener noreferrer" title={f.title || f.name}>{f.title || f.name}</a>
                        <span className="filerow-meta">{[f.title ? f.name : null, fmtBytes(f.size)].filter(Boolean).join(' · ')}</span>
                      </div>
                      <a className="icon-btn filerow-open" href={planFileUrl(plan, f.file)} target="_blank" rel="noopener noreferrer" title="Open"><ExternalLink size={15} /></a>
                      <button className="icon-btn filerow-del" onClick={() => removeFile(b.id, f.id)} title="Move to Trash"><X size={15} /></button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="dropzone" onClick={() => setFileModalBlock(b.id)}>
                <UploadCloud size={20} /><div>Add a file — with an optional example image</div>
              </div>
            )}
          </div>
        );
      })}

      {/* Add block */}
      <div className="add-block">
        <Menu
          align="left"
          trigger={<button className="add-block-btn" onClick={() => setAddOpen((v) => !v)}><Plus size={16} /> Add block</button>}
          items={Object.entries(BLOCK_META).map(([type, m]) => ({ label: m.label, icon: <m.icon size={15} />, onClick: () => addBlock(type) }))}
        />
      </div>

      {lightbox && (
        <Lightbox items={lightbox.items} index={lightbox.index} onIndex={(n) => setLightbox((l) => ({ ...l, index: n }))} onClose={() => setLightbox(null)} />
      )}
      {renaming && (
        <GalleryNameModal title="Rename plan" initialName={plan.name} submitLabel="Save" placeholder="Plan name"
          onSubmit={async (name) => { await patch({ name }); setRenaming(false); }} onClose={() => setRenaming(false)} />
      )}
      {renameBlock && (
        <GalleryNameModal title="Rename block" initialName={renameBlock.title} submitLabel="Save" placeholder="Block name"
          onSubmit={async (name) => { editBlock(renameBlock.id, { title: name }, true); setRenameBlock(null); }} onClose={() => setRenameBlock(null)} />
      )}
      {refPickerBlock && (
        <RefPicker
          addedIds={new Set(((plan.blocks.find((b) => b.id === refPickerBlock)?.items) || []).map((r) => r.refId))}
          onPick={(item) => addRef(refPickerBlock, item)}
          onClose={() => setRefPickerBlock(null)}
        />
      )}
      {fileModalBlock && (
        <FileAddModal onSubmit={submitFile} onClose={() => setFileModalBlock(null)} />
      )}
    </div>
  );
}

function BackBtn({ to, label = 'Back' }) {
  const navigate = useNavigate();
  return (
    <button className="detail-back" style={{ margin: 0 }} onClick={() => (to ? navigate(to) : navigate(-1))}>
      <ArrowLeft size={16} /> {label}
    </button>
  );
}
