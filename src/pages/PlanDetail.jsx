import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Trash2, Pencil, MoreHorizontal, CalendarRange, Images, StickyNote,
  ListChecks, Paperclip, UploadCloud, X, Plus, Check, ChevronDown, ChevronRight,
  Image as ImageIcon, Camera, ArrowUp, ArrowDown, File as FileIcon, ExternalLink,
  Link2, Library, FolderOpen,
} from 'lucide-react';
import { api, planFileUrl } from '../lib/api.js';
import { PLAN_GRADIENTS, gradientCss, normalizeUrl, hostOf } from '../lib/types.js';
import { useToast } from '../components/Toast.jsx';
import Menu from '../components/Menu.jsx';
import Lightbox from '../components/Lightbox.jsx';
import GalleryNameModal from '../components/GalleryNameModal.jsx';
import RefPicker from '../components/RefPicker.jsx';

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
};
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
  const [bannerPicker, setBannerPicker] = useState(false);
  const [avatarPicker, setAvatarPicker] = useState(false);
  const [emojiInput, setEmojiInput] = useState('');
  const [dragBlock, setDragBlock] = useState(null);
  const skipMs = useRef(true);
  const planRef = useRef(null);
  const bannerRef = useRef(null);
  const avatarRef = useRef(null);
  const filesRef = useRef(null);
  const coverRef = useRef(null);
  const pending = useRef(null);       // { blockId } for the files/cover inputs
  const lastMoodboard = useRef(null); // block id for paste target
  const timers = useRef({});
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
    const send = () => api.updateBlock(id, bid, p).catch((e) => toast(`Could not save: ${e.message}`, 'error'));
    if (immediate) send(); else timers.current[bid] = setTimeout(send, 500);
  };
  const addFilesTo = (bid) => { pending.current = bid; filesRef.current?.click(); };
  const onFiles = async (files) => { if (!files?.length || !pending.current) return; try { setPlan(await api.addBlockFiles(id, pending.current, files)); } catch (e) { toast(`Upload failed: ${e.message}`, 'error'); } };
  const removeFile = async (bid, fid) => { try { setPlan(await api.removeBlockFile(id, bid, fid)); } catch (e) { toast(`Failed: ${e.message}`, 'error'); } };
  const setCover = (bid) => { pending.current = bid; coverRef.current?.click(); };
  const onCover = async (file) => { if (!file || !pending.current) return; try { setPlan(await api.setBlockCover(id, pending.current, file)); } catch (e) { toast(`Failed: ${e.message}`, 'error'); } };
  const clearCover = async (bid) => { try { setPlan(await api.removeBlockCover(id, bid)); } catch (e) { toast(`Failed: ${e.message}`, 'error'); } };

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

  if (error) return <div className="detail"><BackBtn /> <div className="center-msg">Couldn’t load: {error}</div></div>;
  if (!plan) return <div className="detail"><div className="spinner" /></div>;

  const bannerUrl = plan.banner ? planFileUrl(plan, plan.banner) : null;
  const bannerGrad = !bannerUrl ? gradientCss(plan.bannerGradient) : null;
  const hasBanner = !!(bannerUrl || bannerGrad);
  const bannerStyle = bannerUrl ? { backgroundImage: `url("${bannerUrl}")` } : bannerGrad ? { backgroundImage: bannerGrad } : undefined;
  const avatarUrl = plan.avatar ? planFileUrl(plan, plan.avatar) : null;
  const avatarEmoji = !avatarUrl ? (plan.avatarEmoji || null) : null;

  const blockMenu = (b, i) => [
    { label: 'Rename', icon: <Pencil size={15} />, onClick: () => setRenameBlock(b) },
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
      <input ref={coverRef} type="file" accept="image/*" className="visually-hidden-input" onChange={(e) => { onCover(e.target.files[0]); e.target.value = ''; }} />

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
                <div className="reflist">
                  {items.map((r) => (
                    <div className="refcard" key={r.id} onClick={() => openRef(r)} title={r.title}>
                      <span className="refcard-thumb">
                        {r.thumb ? <img src={r.thumb} alt="" loading="lazy" onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }} />
                          : r.refKind === 'gallery' ? <FolderOpen size={20} /> : <FileIcon size={20} />}
                      </span>
                      <span className="refcard-text">
                        <span className="refcard-title">{r.title}</span>
                        <span className="refcard-sub">{r.subtitle}</span>
                      </span>
                      <button className="icon-btn refcard-del" onClick={(e) => { e.stopPropagation(); removeRef(b.id, r.id); }} title="Remove"><X size={14} /></button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="dropzone" onClick={() => setRefPickerBlock(b.id)}>
                  <Library size={20} /><div>Attach projects or galleries from your library</div>
                </div>
              )}
            </div>
          );
        }

        // files
        const cover = b.cover ? planFileUrl(plan, b.cover) : null;
        return (
          <div className={`section block ${dragBlock === b.id ? 'dragover' : ''}`} key={b.id}
            onDragOver={(e) => { e.preventDefault(); setDragBlock(b.id); }}
            onDragLeave={(e) => { if (e.target === e.currentTarget) setDragBlock(null); }}
            onDrop={(e) => { e.preventDefault(); setDragBlock(null); pending.current = b.id; onFiles(e.dataTransfer.files); }}>
            <div className="section-head">
              <h2><Meta.icon size={16} /> {b.title} {(b.files || []).length > 0 && <span className="count">{b.files.length}</span>}</h2>
              <div className="moodboard-actions">
                <button className="btn btn-sm" onClick={() => addFilesTo(b.id)}><UploadCloud size={14} /> Add files</button>{menu}
              </div>
            </div>

            <div className="files-cover">
              {cover ? (
                <figure className="media-frame" style={{ marginBottom: 12 }}>
                  <img src={cover} alt="example" />
                  <div className="files-cover-actions">
                    <button className="btn btn-sm" onClick={() => setCover(b.id)}><ImageIcon size={14} /> Change</button>
                    <button className="btn btn-sm btn-ghost" onClick={() => clearCover(b.id)}>Remove</button>
                  </div>
                </figure>
              ) : (
                <button className="btn btn-sm files-cover-add" onClick={() => setCover(b.id)}><ImageIcon size={14} /> Set example image</button>
              )}
            </div>

            {(b.files || []).length ? (
              <div className="filelist">
                {b.files.map((f) => (
                  <div className="filerow" key={f.id}>
                    <FileIcon size={18} className="filerow-icon" />
                    <a className="filerow-name" href={planFileUrl(plan, f.file)} target="_blank" rel="noopener noreferrer" title={f.name}>{f.name}</a>
                    <span className="filerow-size">{fmtBytes(f.size)}</span>
                    <a className="icon-btn filerow-open" href={planFileUrl(plan, f.file)} target="_blank" rel="noopener noreferrer" title="Open"><ExternalLink size={15} /></a>
                    <button className="icon-btn filerow-del" onClick={() => removeFile(b.id, f.id)} title="Remove"><X size={15} /></button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="dropzone" onClick={() => addFilesTo(b.id)}>
                <UploadCloud size={20} /><div>Drop or select files</div>
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
