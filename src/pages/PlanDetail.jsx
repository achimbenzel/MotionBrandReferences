import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Trash2, Pencil, MoreHorizontal, CalendarRange, Images, StickyNote,
  ListChecks, Paperclip, UploadCloud, X, Plus, Check, ChevronDown, ChevronRight,
  Image as ImageIcon, Camera, ArrowUp, ArrowDown, File as FileIcon, ExternalLink,
  Link2, Library, FolderOpen, Palette as PaletteIcon, Heading as HeadingIcon,
  Minus, Table as TableIcon, Wand2, Copy, FileText, AlertTriangle, ClipboardList,
  LayoutTemplate, Building2, Clapperboard, ScrollText, MonitorPlay, PackageCheck,
  Archive, Film,
} from 'lucide-react';
import { api, planFileUrl, fileUrl } from '../lib/api.js';
import { useSaver, useRefreshOnReturn } from '../lib/autosave.js';
import { PLAN_GRADIENTS, PLAN_STATUSES, gradientCss, normalizeUrl, hostOf, planStatus, tagColor } from '../lib/types.js';
import { rgbToHex, hexToRgb } from '../lib/color.js';
import { extractPalette } from '../lib/imaging.js';
import { useToast } from '../components/Toast.jsx';
import Menu from '../components/Menu.jsx';
import PdfViewer from '../components/PdfViewer.jsx';
import Lightbox from '../components/Lightbox.jsx';
import GalleryNameModal from '../components/GalleryNameModal.jsx';
import RefPicker from '../components/RefPicker.jsx';
import FileAddModal from '../components/FileAddModal.jsx';
import ProjectCard from '../components/ProjectCard.jsx';
import AutoTextarea from '../components/AutoTextarea.jsx';
import ScriptBlock from '../components/plan/ScriptBlock.jsx';
import StoryboardBlock from '../components/plan/StoryboardBlock.jsx';
import ReviewBlock from '../components/plan/ReviewBlock.jsx';
import DeliverablesBlock, { tableToDeliverables } from '../components/plan/DeliverablesBlock.jsx';
import PlanTodos from '../components/plan/PlanTodos.jsx';
import ArchiveModal from '../components/plan/ArchiveModal.jsx';
import { voEstimate } from '../lib/timing.js';

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
  briefing: { label: 'Briefing', icon: ClipboardList },
  script: { label: 'Script', icon: ScrollText },
  storyboard: { label: 'Storyboard', icon: Clapperboard },
  review: { label: 'Review', icon: MonitorPlay },
  deliverables: { label: 'Deliverables', icon: PackageCheck },
  moodboard: { label: 'Moodboard', icon: Images },
  text: { label: 'Text', icon: StickyNote },
  todos: { label: 'To-dos', icon: ListChecks },
  files: { label: 'Files', icon: Paperclip },
  pdf: { label: 'PDF', icon: FileText },
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
  const [refPickerBlock, setRefPickerBlock] = useState(null); // block id currently picking references
  const [fileModalBlock, setFileModalBlock] = useState(null); // block id for the add-file modal
  const [refCache, setRefCache] = useState({}); // `${refKind}:${refId}` -> { project?|gallery?+members?|gone? }
  const [bannerPicker, setBannerPicker] = useState(false);
  const [avatarPicker, setAvatarPicker] = useState(false);
  const [emojiInput, setEmojiInput] = useState('');
  const [dragBlock, setDragBlock] = useState(null);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [client, setClient] = useState('');
  const saver = useSaver();
  const planRef = useRef(null);
  const bannerRef = useRef(null);
  const avatarRef = useRef(null);
  const filesRef = useRef(null);
  const pdfRef = useRef(null);
  const paletteRef = useRef(null);
  const refReq = useRef(new Set()); // referenced ids already fetched, so we load each once
  const pending = useRef(null);       // { blockId } for the files/cover inputs
  const lastMoodboard = useRef(null); // block id for paste target
  const pendingPatch = useRef({});    // per-block accumulated patch awaiting a debounced save
  const milestonesRef = useRef([]);
  milestonesRef.current = milestones;
  planRef.current = plan;

  useEffect(() => {
    let alive = true;
    saver.flush(); // another plan's pending edits go out before we switch
    setPlan(null); setError(null);
    api.getPlan(id).then((p) => {
      if (!alive) return;
      setPlan(p); setMilestones(p.milestones || []); setClient(p.client || '');
    }).catch((e) => { if (alive) setError(e.message); });
    return () => { alive = false; };
  }, [id, saver]);

  // Back on this tab after a while: pick up changes made on another device.
  useRefreshOnReturn(() => api.getPlan(id), (p) => { setPlan(p); setMilestones(p.milestones || []); setClient(p.client || ''); }, saver);

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

  // Milestones — edited locally, saved debounced (the response is ignored so
  // it can't overwrite a block edit that's still waiting to be saved).
  const saveMilestones = (next) => {
    milestonesRef.current = next;
    setMilestones(next);
    const planId = id;
    saver.schedule('milestones', () => api.updatePlan(planId, { milestones: next })
      .catch((e) => toast(`Could not save: ${e.message}`, 'error')));
  };
  const addMilestone = () => saveMilestones([...milestonesRef.current, { id: rid(), title: '', date: '', done: false }]);
  const editMilestone = (mid, p) => saveMilestones(milestonesRef.current.map((x) => (x.id === mid ? { ...x, ...p } : x)));
  const removeMilestone = (mid) => saveMilestones(milestonesRef.current.filter((x) => x.id !== mid));

  // Status + client — shown right away, saved without applying the response
  // (it could carry a block's state from before an edit that's still pending).
  const setStatus = (status) => {
    setPlan((p) => ({ ...p, status }));
    api.updatePlan(id, { status }).catch((e) => toast(`Could not save: ${e.message}`, 'error'));
  };
  const editClient = (value) => {
    setClient(value);
    const planId = id;
    saver.schedule('client', () => api.updatePlan(planId, { client: value }).catch((e) => toast(`Could not save: ${e.message}`, 'error')));
  };

  // Save this plan's structure as a template for new plans.
  const saveAsTemplate = async (name) => {
    try {
      await saver.flush();
      const { template, replaced } = await api.savePlanTemplate(id, name);
      setSavingTemplate(false);
      toast(replaced ? `Template “${template.name}” updated` : `Saved as template “${template.name}”`);
    } catch (e) { toast(`Could not save template: ${e.message}`, 'error'); }
  };

  // Finished: the final work goes to the library as references.
  const onArchived = (res, err) => {
    if (!res) { toast(`Could not archive: ${err?.message || 'failed'}`, 'error'); return; }
    setArchiving(false);
    // Only what the archive changed — edits made here stay as they are.
    setPlan((p) => ({ ...p, archivedAs: res.plan?.archivedAs || p.archivedAs, status: res.plan?.status ?? p.status }));
    const n = res.projects.length;
    toast(`Added ${n} reference${n === 1 ? '' : 's'} to your library`, 'ok',
      { label: 'Open', onClick: () => navigate(`/project/${res.projects[0].id}`) });
  };

  // Briefing block — copy all answers as plain text (for an email or a doc).
  const copyBriefing = async (b) => {
    const head = [plan.name, client].filter(Boolean).join(' — ');
    const lines = (b.fields || []).filter((f) => f.label.trim() || f.value.trim()).map((f) => `${f.label.trim() || 'Note'}: ${f.value.trim() || '—'}`);
    try { await navigator.clipboard.writeText(`${head}\n${b.title}\n\n${lines.join('\n')}`); toast('Briefing copied'); }
    catch { toast('Copy failed', 'error'); }
  };
  // Add a block right after another one; keeps this page's unsaved edits and
  // only takes the new block from the server. → the new block
  const addBlockAfter = async (type, afterId) => {
    const before = new Set((planRef.current?.blocks || []).map((x) => x.id));
    const next = await api.addBlock(id, type, { after: afterId });
    setPlan((prev) => ({ ...prev, blocks: next.blocks.map((x) => prev.blocks.find((y) => y.id === x.id) || x) }));
    return next.blocks.find((x) => !before.has(x.id));
  };
  const scrollToBlock = (bid) => setTimeout(() => document.getElementById(`block-${bid}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);

  // Table → deliverables list (right below it; the table itself stays).
  const makeDeliverables = async (b) => {
    const items = tableToDeliverables(b);
    if (!items.length) { toast('This table has no rows to turn into deliverables.'); return; }
    try {
      const nb = await addBlockAfter('deliverables', b.id);
      editBlock(nb.id, { items, ...(b.title && b.title !== 'Table' ? { title: b.title } : {}) }, true);
      toast(`Deliverables list with ${items.length} item${items.length === 1 ? '' : 's'} added below — the table stays until you delete it`);
      scrollToBlock(nb.id);
    } catch (e) { toast(`Could not create the list: ${e.message}`, 'error'); }
  };

  // Script → storyboard: one shot per script line, timed by its voice-over,
  // added to the plan's first storyboard (or a new one right after the script).
  const scriptToStoryboard = async (b) => {
    const lines = (b.lines || []).filter((l) => l.visual.trim() || l.vo.trim());
    if (!lines.length) { toast('Write a few script lines first.'); return; }
    const shots = lines.map((l) => {
      const secs = voEstimate(l.vo, b.pace || 2.5).seconds;
      return { id: rid(), image: null, duration: secs ? Math.max(1, Math.ceil(secs * 2) / 2) : 2, visual: l.visual, vo: l.vo, notes: '' };
    });
    try {
      let sb = (planRef.current?.blocks || []).find((x) => x.type === 'storyboard');
      if (!sb) sb = await addBlockAfter('storyboard', b.id);
      editBlock(sb.id, { shots: [...(sb.shots || []), ...shots] }, true);
      toast(`Added ${shots.length} shot${shots.length === 1 ? '' : 's'} to “${sb.title}”`);
      scrollToBlock(sb.id);
    } catch (e) { toast(`Could not create storyboard: ${e.message}`, 'error'); }
  };

  const removeField = (b, f) => {
    const fields = b.fields || [];
    const idx = fields.findIndex((x) => x.id === f.id);
    editBlock(b.id, { fields: fields.filter((x) => x.id !== f.id) }, true);
    if (!f.label.trim() && !f.value.trim()) return;
    toast('Field removed', 'ok', { label: 'Undo', onClick: () => {
      const cur = (planRef.current?.blocks || []).find((x) => x.id === b.id)?.fields || [];
      const next = [...cur]; next.splice(Math.min(idx, next.length), 0, f);
      editBlock(b.id, { fields: next }, true);
    } });
  };

  // Blocks
  const addBlock = async (type) => { try { setPlan(await api.addBlock(id, type)); } catch (e) { toast(`Could not add block: ${e.message}`, 'error'); } };
  const moveBlock = async (bid, dir) => { try { setPlan(await api.moveBlock(id, bid, dir)); } catch (e) { toast(`Failed: ${e.message}`, 'error'); } };
  // Deleting a block moves it (and its files) to Trash, with Undo.
  const deleteBlock = async (b) => {
    try {
      await saver.flush(`block:${b.id}`);
      const res = await api.removeBlock(id, b.id);
      setPlan(res.plan);
      toast(`“${b.title || BLOCK_META[b.type]?.label || 'Block'}” moved to Trash`, 'ok', { label: 'Undo', onClick: async () => {
        try { await api.restoreTrash(res.trashId); setPlan(await api.getPlan(id)); } catch (e) { toast(`Undo failed: ${e.message}`, 'error'); }
      } });
    } catch (e) { toast(`Failed: ${e.message}`, 'error'); }
  };
  const editBlock = (bid, p, immediate = false) => {
    setPlan((prev) => ({ ...prev, blocks: prev.blocks.map((b) => (b.id === bid ? { ...b, ...p } : b)) }));
    // Merge patches so a later edit to one field can't cancel a pending save of another.
    pendingPatch.current[bid] = { ...(pendingPatch.current[bid] || {}), ...p };
    saver.schedule(`block:${bid}`, () => {
      const patch = pendingPatch.current[bid]; delete pendingPatch.current[bid];
      if (patch) return api.updateBlock(id, bid, patch).catch((e) => toast(`Could not save: ${e.message}`, 'error'));
      return null;
    }, { immediate });
  };
  const addFilesTo = (bid) => { pending.current = bid; filesRef.current?.click(); };
  const addPdfTo = (bid) => { pending.current = bid; pdfRef.current?.click(); };
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
    ...(b.type === 'script' ? [{ label: 'Storyboard from script', icon: <Clapperboard size={15} />, onClick: () => scriptToStoryboard(b) }] : []),
    ...(b.type === 'table' && (b.rows || []).length ? [{ label: 'Make a deliverables list', icon: <PackageCheck size={15} />, onClick: () => makeDeliverables(b) }] : []),
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
            { label: 'Save as template…', icon: <LayoutTemplate size={15} />, onClick: () => setSavingTemplate(true) },
            { label: 'Archive as reference…', icon: <Archive size={15} />, onClick: () => setArchiving(true) },
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
      <div className="plan-meta">
        <Menu
          align="left"
          title="Status"
          trigger={<StatusPick status={plan.status} />}
          items={[
            ...PLAN_STATUSES.map((st) => ({ label: st.label, icon: <span className="status-dot" style={{ background: tagColor(st.color).fg }} />, onClick: () => setStatus(st.key) })),
            { separator: true },
            { label: 'No status', icon: <span className="status-dot" style={{ background: 'var(--text-faint)' }} />, onClick: () => setStatus('') },
          ]}
        />
        <label className="plan-client" title="Client">
          <Building2 size={15} />
          <input value={client} placeholder="Add client" onChange={(e) => editClient(e.target.value)} aria-label="Client" />
        </label>
      </div>
      <LibraryChips items={plan.archivedAs} />

      <input ref={bannerRef} type="file" accept="image/*" className="visually-hidden-input" onChange={(e) => { setImage('banner', e.target.files[0]); e.target.value = ''; }} />
      <input ref={avatarRef} type="file" accept="image/*" className="visually-hidden-input" onChange={(e) => { setImage('avatar', e.target.files[0]); e.target.value = ''; }} />
      <input ref={filesRef} type="file" multiple className="visually-hidden-input" onChange={(e) => { onFiles(e.target.files); e.target.value = ''; }} />
      <input ref={pdfRef} type="file" accept="application/pdf,.pdf" multiple className="visually-hidden-input" onChange={(e) => { onFiles(e.target.files); e.target.value = ''; }} />
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

      {/* The To-Do board's cards linked to this plan */}
      <PlanTodos planId={plan.id} toast={toast} />

      {/* Content blocks (dynamic) */}
      {plan.blocks.map((b, i) => {
        const Meta = BLOCK_META[b.type] || BLOCK_META.text;
        const menu = <Menu align="right" trigger={<button className="icon-btn" style={{ width: 34, height: 34 }}><MoreHorizontal size={16} /></button>} items={blockMenu(b, i)} />;

        if (b.type === 'script') {
          return <ScriptBlock key={b.id} plan={plan} block={b} menu={menu} icon={Meta.icon} editBlock={editBlock} planRef={planRef} toast={toast} />;
        }

        if (b.type === 'storyboard') {
          return (
            <StoryboardBlock key={b.id} plan={plan} block={b} menu={menu} icon={Meta.icon} editBlock={editBlock} planRef={planRef} toast={toast}
              upload={(files) => api.uploadBlockFiles(id, b.id, files)} fileUrl={(rel) => planFileUrl(plan, rel)} />
          );
        }

        if (b.type === 'deliverables') {
          return <DeliverablesBlock key={b.id} plan={plan} block={b} menu={menu} icon={Meta.icon} editBlock={editBlock} planRef={planRef} toast={toast} />;
        }

        if (b.type === 'review') {
          return (
            <ReviewBlock key={b.id} plan={plan} block={b} menu={menu} icon={Meta.icon} editBlock={editBlock} planRef={planRef} toast={toast}
              upload={(files) => api.uploadBlockFiles(id, b.id, files)} fileUrl={(rel) => planFileUrl(plan, rel)} />
          );
        }

        if (b.type === 'briefing') {
          const fields = b.fields || [];
          const setFields = (next, immediate = false) => editBlock(b.id, { fields: next }, immediate);
          const patchField = (fid, p) => setFields(fields.map((f) => (f.id === fid ? { ...f, ...p } : f)));
          const answered = fields.filter((f) => f.value.trim()).length;
          return (
            <div className="section block" key={b.id}>
              <div className="section-head">
                <h2><Meta.icon size={16} /> {b.title} {fields.length > 0 && <span className="count" title="Answered">{answered}/{fields.length}</span>}</h2>
                <div className="moodboard-actions">
                  {fields.length > 0 && <button className="btn btn-sm" onClick={() => copyBriefing(b)}><Copy size={14} /> Copy</button>}
                  {menu}
                </div>
              </div>
              <div className="brief">
                {fields.map((f) => (
                  <div className={`brief-row ${f.value.trim() ? 'done' : ''}`} key={f.id}>
                    <input className="brief-label" value={f.label} placeholder="Question…" aria-label="Question"
                      onChange={(e) => patchField(f.id, { label: e.target.value })} />
                    <AutoTextarea className="brief-value" value={f.value} placeholder="—" aria-label={f.label || 'Answer'}
                      onChange={(e) => patchField(f.id, { value: e.target.value })} />
                    <button className="icon-btn brief-del" title="Remove field" onClick={() => removeField(b, f)}><X size={14} /></button>
                  </div>
                ))}
                <button className="btn btn-ghost btn-sm ms-add" onClick={() => setFields([...fields, { id: rid(), label: '', value: '' }], true)}><Plus size={15} /> Add field</button>
              </div>
            </div>
          );
        }

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
                  <div className={`milestone ${t.done ? 'done' : ''} ${t.urgent ? 'urgent' : ''}`} key={t.id}>
                    <button className={`ms-check ${t.done ? 'on' : ''}`} onClick={() => setItems(items.map((x) => (x.id === t.id ? { ...x, done: !x.done } : x)))}>{t.done && <Check size={13} />}</button>
                    <input className="ms-title input" value={t.text} placeholder="To-do…" onChange={(e) => setItems(items.map((x) => (x.id === t.id ? { ...x, text: e.target.value } : x)))} />
                    <button className={`ms-urgent icon-btn ${t.urgent ? 'on' : ''}`} title={t.urgent ? 'Unmark urgent' : 'Mark urgent'} onClick={() => setItems(items.map((x) => (x.id === t.id ? { ...x, urgent: !x.urgent } : x)))}><AlertTriangle size={13} /></button>
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

        if (b.type === 'pdf') {
          return (
            <div className={`section block ${dragBlock === b.id ? 'dragover' : ''}`} key={b.id}
              onDragOver={(e) => { e.preventDefault(); setDragBlock(b.id); }}
              onDragLeave={(e) => { if (e.target === e.currentTarget) setDragBlock(null); }}
              onDrop={(e) => { e.preventDefault(); setDragBlock(null); pending.current = b.id; onFiles(e.dataTransfer.files); }}>
              <div className="section-head">
                <h2><Meta.icon size={16} /> {b.title} {(b.files || []).length > 0 && <span className="count">{b.files.length}</span>}</h2>
                <div className="moodboard-actions">
                  <button className="btn btn-sm" onClick={() => addPdfTo(b.id)}><Plus size={14} /> Add PDF</button>{menu}
                </div>
              </div>
              {(b.files || []).length ? (
                <PlanPdfBlock plan={plan} files={b.files} onRemove={(fid) => removeFile(b.id, fid)} />
              ) : (
                <div className="dropzone" onClick={() => addPdfTo(b.id)}>
                  <FileText size={20} /><div>Add a PDF — it renders inline, page by page (like Branding)</div>
                </div>
              )}
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
          trigger={<button className="add-block-btn"><Plus size={16} /> Add block</button>}
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
      {savingTemplate && (
        <GalleryNameModal title="Save as template" initialName="" submitLabel="Save template" placeholder="e.g. Launch video — short"
          hint="Keeps the blocks, text, to-dos (unticked), tables and briefing questions. Images, files, dates and briefing answers are left out. Using the name of one of your templates updates it."
          onSubmit={saveAsTemplate} onClose={() => setSavingTemplate(false)} />
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
      {archiving && (
        <ArchiveModal plan={plan} client={client} flush={() => saver.flush()} onDone={onArchived} onClose={() => setArchiving(false)} />
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

// A PDF block: renders the active PDF inline (like Branding), with tabs when
// there is more than one, an "Open" link and a Remove button.
function PlanPdfBlock({ plan, files, onRemove }) {
  const [activeId, setActiveId] = useState(files[0]?.id);
  const active = files.find((f) => f.id === activeId) || files[0];
  const shorten = (n) => (n && n.length > 22 ? `${n.slice(0, 20)}…` : n);
  return (
    <div>
      {files.length > 1 && (
        <div className="asset-tabs">
          {files.map((f, i) => (
            <button key={f.id} className={`asset-tab ${active?.id === f.id ? 'on' : ''}`} onClick={() => setActiveId(f.id)}>
              <FileText size={14} /> {shorten(f.title || f.name) || `PDF ${i + 1}`}
            </button>
          ))}
        </div>
      )}
      {active && (
        <>
          <PdfViewer key={active.id} url={planFileUrl(plan, active.file)} />
          <div className="plan-pdf-bar">
            <span className="plan-pdf-name" title={active.name}>{active.name}</span>
            <a className="btn btn-sm" href={planFileUrl(plan, active.file)} target="_blank" rel="noopener noreferrer"><ExternalLink size={14} /> Open</a>
            <button className="btn btn-sm btn-danger" onClick={() => onRemove(active.id)}><Trash2 size={14} /> Remove</button>
          </div>
        </>
      )}
    </div>
  );
}

// "In your library": the references made from this plan (hidden once deleted).
function LibraryChips({ items }) {
  const navigate = useNavigate();
  const [alive, setAlive] = useState({}); // project id → project | false
  const key = (items || []).map((x) => x.id).join(',');
  useEffect(() => {
    let on = true;
    for (const id of key ? key.split(',') : []) {
      api.get(id).then((p) => { if (on) setAlive((a) => ({ ...a, [id]: p })); }).catch(() => { if (on) setAlive((a) => ({ ...a, [id]: false })); });
    }
    return () => { on = false; };
  }, [key]);
  const shown = (items || []).filter((x) => alive[x.id]);
  if (!shown.length) return null;
  const ICON = { motion: Film, branding: Images, color: PaletteIcon };
  const LABEL = { motion: 'Motion', branding: 'Branding', color: 'Colors' };
  return (
    <div className="plan-library">
      <span className="plan-library-label"><Library size={14} /> In your library</span>
      {shown.map((x) => {
        const Icon = ICON[x.type] || Library;
        return (
          <button key={x.id} className="plan-library-chip" onClick={() => navigate(`/project/${x.id}`)}>
            <Icon size={13} /> <span className="plan-library-type">{LABEL[x.type] || 'Reference'}</span> {alive[x.id].title || x.title}
          </button>
        );
      })}
    </div>
  );
}

// The status pill in the plan header (opens the status menu).
function StatusPick({ status }) {
  const st = planStatus(status);
  const c = st ? tagColor(st.color) : null;
  return (
    <button className={`status-pick ${st ? '' : 'none'}`} style={c ? { background: c.bg, color: c.fg } : undefined} aria-label="Status">
      <span className="status-dot" style={{ background: c ? c.fg : 'var(--text-faint)' }} />
      {st ? st.label : 'Set status'}
      <ChevronDown size={13} />
    </button>
  );
}
