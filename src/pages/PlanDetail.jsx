import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft, Trash2, Pencil, MoreHorizontal, Images, Image as ImageIcon, Plus, ChevronDown, ArrowUp, ArrowDown, Library, Palette as PaletteIcon,
  LayoutTemplate, Clapperboard, PackageCheck, Archive, Film, ChevronUp, ChevronsDownUp, ChevronsUpDown, Columns2, RectangleHorizontal,
  GripVertical, GripHorizontal, Pin, PinOff, Megaphone,
} from 'lucide-react';
import { api, planFileUrl } from '../lib/api.js';
import { useSaver, useRefreshOnReturn, whenSaved } from '../lib/autosave.js';
import { PLAN_STATUSES, planStatus, tagColor } from '../lib/types.js';
import { rgbToHex } from '../lib/color.js';
import { extractPalette } from '../lib/imaging.js';
import { useToast } from '../components/Toast.jsx';
import Menu from '../components/Menu.jsx';
import Lightbox from '../components/Lightbox.jsx';
import GalleryNameModal from '../components/GalleryNameModal.jsx';
import RefPicker from '../components/RefPicker.jsx';
import FileAddModal from '../components/FileAddModal.jsx';
import MediaPicker from '../components/mockups/MediaPicker.jsx';
import ScriptBlock from '../components/plan/ScriptBlock.jsx';
import StoryboardBlock from '../components/plan/StoryboardBlock.jsx';
import ReviewBlock from '../components/plan/ReviewBlock.jsx';
import DeliverablesBlock, { tableToDeliverables } from '../components/plan/DeliverablesBlock.jsx';
import PlanTodos from '../components/plan/PlanTodos.jsx';
import ArchiveModal from '../components/plan/ArchiveModal.jsx';
import { BLOCK_META } from '../components/plan/blockMeta.js';
import PlanTabs from '../components/plan/PlanTabs.jsx';
import PlanOverview from '../components/plan/PlanOverview.jsx';
import BlockRow from '../components/plan/BlockRow.jsx';
import PlanWhen, { PlanWhenPanel } from '../components/plan/PlanWhen.jsx';
import PlanIdentity from '../components/plan/PlanIdentity.jsx';
import useMakePost from '../components/content/useMakePost.js';
import { PlanToc, PlanJump } from '../components/plan/PlanToc.jsx';
import PlanTime from '../components/plan/PlanTime.jsx';
import { BriefingBlock, TextBlock, TodosBlock, LinksBlock, HeadingBlock, DividerBlock, TableBlock } from '../components/plan/BasicBlocks.jsx';
import { RefsBlock, PaletteBlock } from '../components/plan/LibraryBlocks.jsx';
import { MoodboardBlock, PdfBlock, FilesBlock } from '../components/plan/FileBlocks.jsx';
import ClientPicker from '../components/ClientPicker.jsx';
import { PLAN_TABS, BLOCK_TABS, STRUCTURAL, blockTabs, statusTab, isEmptyBlock, tabColor, planTab } from '../lib/planTabs.js';
import { voEstimate } from '../lib/timing.js';
import { useSortable, moveItem } from '../lib/useSortable.js';
import { getPref, setPref } from '../lib/prefs.js';
import '../styles/plan.css';

const rid = () => Math.random().toString(36).slice(2, 8);

// BLOCK_META (name + icon per block type) lives in components/plan/blockMeta.js.

// Small blocks sit side by side, two in a row, unless set to full width (and any block can be set to half).
const HALF_BY_DEFAULT = new Set(['palette', 'links', 'files']);
const halfOf = (b) => b.width === 'half' || (b.width !== 'full' && HALF_BY_DEFAULT.has(b.type));

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
  const [appPick, setAppPick] = useState(null); // picking a picture that's in the app: { kind: 'banner' | 'avatar' | 'moodboard', blockId? }
  const [dragBlock, setDragBlock] = useState(null);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [bannerAsk, setBannerAsk] = useState(0); // Edit → Banner…: opens the banner choices
  const [params, setParams] = useSearchParams();
  const [tab, setTabState] = useState('overview');     // which tab shows (set when the plan loads)
  const [opened, setOpened] = useState(() => new Set()); // empty blocks opened on this visit
  const [whenOpen, setWhenOpen] = useState(false);        // the timeframe / milestones panel under the header
  const [client, setClient] = useState('');
  const [clients, setClients] = useState([]);
  const saver = useSaver();
  const [makePostRaw] = useMakePost();
  const makePost = (from) => makePostRaw(from, { before: () => saver.flush() });
  const planRef = useRef(null);
  const bannerRef = useRef(null);
  const avatarRef = useRef(null);
  const filesRef = useRef(null);
  const pdfRef = useRef(null);
  const paletteRef = useRef(null);
  const refReq = useRef(new Set()); // referenced ids already fetched, so we load each once
  const pending = useRef(null);       // { blockId } for the files/cover inputs
  const lastMoodboard = useRef(null); // block id for paste target
  const tabRef = useRef(null);        // the open tab, for the paste handler
  const openBlockRef = useRef(null);
  const pendingPatch = useRef({});    // per-block accumulated patch awaiting a debounced save
  const milestonesRef = useRef([]);
  milestonesRef.current = milestones;
  planRef.current = plan;
  tabRef.current = tab;

  useEffect(() => {
    let alive = true;
    saver.flush(); // another plan's pending edits go out before we switch
    setPlan(null); setError(null);
    // Edits just made elsewhere (e.g. the storyboard editor) land first.
    whenSaved().then(() => api.getPlan(id)).then((p) => {
      if (!alive) return;
      setPlan(p); setMilestones(p.milestones || []); setClient(p.client || '');
      const askedBlock = params.get('block'); // a link to one block (e.g. from the dashboard)
      setTabState(firstTab(p));
      if (askedBlock && (p.blocks || []).some((b) => b.id === askedBlock)) setTimeout(() => openBlockRef.current?.(askedBlock), 80);
    }).catch((e) => { if (alive) setError(e.message); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- firstTab reads ?tab= once per plan
  }, [id, saver]);
  useEffect(() => { api.listClients().then(setClients).catch(() => {}); }, []);

  // The tab to open: ?tab= (a link), the one used last on this plan, else the
  // one for the plan's phase, else the overview.
  function firstTab(p) {
    const asked = params.get('tab');
    if (asked) setParams({}, { replace: true });
    const saved = getPref(`planTab:${p.id}`);
    const phase = statusTab(p.status);
    const phaseHasBlocks = phase && blockTabs(p.blocks).includes(phase);
    return [asked, saved].find((t) => PLAN_TABS.some((x) => x.key === t)) || (phaseHasBlocks ? phase : 'overview');
  }
  const setTab = (key) => {
    setTabState(key);
    setPref(`planTab:${id}`, key);
    window.scrollTo({ top: Math.min(window.scrollY, document.querySelector('.plan-tabs-wrap')?.offsetTop ?? 0) });
  };

  // Back on this tab after a while: pick up changes made on another device.
  useRefreshOnReturn(() => api.getPlan(id), (p) => { setPlan(p); setMilestones(p.milestones || []); setClient(p.client || ''); }, saver, { live: `plans/${id}` });

  // Paste images into the last-used (or first) moodboard block.
  useEffect(() => {
    const onPaste = async (e) => {
      const files = [...(e.clipboardData?.items || [])]
        .filter((it) => it.type.startsWith('image/')).map((it) => it.getAsFile()).filter(Boolean);
      if (!files.length) return;
      const boards = (planRef.current?.blocks || []).filter((b) => b.type === 'moodboard');
      if (!boards.length) return;
      e.preventDefault();
      const all = planRef.current?.blocks || [];
      const tabs = blockTabs(all);
      const inTab = boards.filter((b) => tabs[all.indexOf(b)] === tabRef.current);
      const target = boards.find((b) => b.id === lastMoodboard.current) || inTab[0] || boards[0];
      try {
        const next = await api.addBlockFiles(id, target.id, files, { pictures: true });
        setPlan((prev) => ({ ...prev, blocks: next.blocks.map((x) => (x.id === target.id ? x : prev.blocks.find((y) => y.id === x.id) || x)) }));
        lastMoodboard.current = target.id;
        toast(`Pasted into “${target.title}”`, 'ok', { label: 'Show', onClick: () => openBlockRef.current?.(target.id) });
      }
      catch (err) { toast(`Paste failed: ${err.message}`, 'error'); }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const patch = (p) => api.updatePlan(id, p).then(setPlan).catch((e) => toast(`Could not save: ${e.message}`, 'error'));

  // Header images (banner / avatar)
  const setImage = async (kind, file) => { if (!file) return; try { setPlan(await api.setPlanImage(id, kind, file)); } catch (e) { toast(`Upload failed: ${e.message}`, 'error'); } };
  // A picture that's already in the app, as banner / profile picture or into a moodboard.
  const pickFromApp = async (source, meta) => {
    const target = appPick;
    if (!target) return;
    try {
      if (target.kind === 'palette') { // colours from a picture that's in the app
        setAppPick(null);
        await onExtract(meta?.url, target.blockId);
      } else if (target.kind === 'moodboard') {
        const next = await api.addBlockFiles(id, target.blockId, { source });
        setPlan((prev) => ({ ...prev, blocks: next.blocks.map((x) => (x.id === target.blockId ? x : prev.blocks.find((y) => y.id === x.id) || x)) }));
        toast('Added to the moodboard', 'ok');
      } else {
        setPlan(await api.setPlanImage(id, target.kind, { source }));
        setAppPick(null);
      }
    } catch (e) { toast(`Could not add it: ${e.message}`, 'error'); }
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
  // The client: one of yours, a new one, or none.
  const pickClient = async (clientId) => {
    const c = clients.find((x) => x.id === clientId);
    setPlan((p) => ({ ...p, clientId, client: c?.name || '' })); setClient(c?.name || '');
    try { await api.updatePlan(id, { clientId }); } catch (e) { toast(`Could not save: ${e.message}`, 'error'); }
  };
  const newClient = async (name) => {
    try {
      const { client: c } = await api.createClient({ name });
      setClients((l) => (l.some((x) => x.id === c.id) ? l : [...l, c].sort((a, b) => a.name.localeCompare(b.name))));
      setPlan((p) => ({ ...p, clientId: c.id, client: c.name })); setClient(c.name);
      await api.updatePlan(id, { clientId: c.id });
      toast(`Client “${c.name}” added`, 'ok', { label: 'Open', onClick: () => navigate(`/clients/${c.id}`) });
    } catch (e) { toast(`Could not add the client: ${e.message}`, 'error'); }
  };
  // Budget / hourly rate (from the time chip) — saved shortly after typing.
  const editMoney = (patch) => {
    setPlan((p) => ({ ...p, ...patch }));
    const planId = id;
    saver.schedule('money', () => api.updatePlan(planId, patch).catch((e) => toast(`Could not save: ${e.message}`, 'error')));
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
  const scrollToBlock = (bid) => setTimeout(() => document.querySelector(`[data-block="${bid}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
  // Show a block wherever it is: its tab, unfolded, opened if empty, scrolled to.
  const openBlock = (bid) => {
    const blocks = planRef.current?.blocks || [];
    const i = blocks.findIndex((b) => b.id === bid);
    if (i === -1) return;
    setTab(blockTabs(blocks)[i]);
    setOpened((set) => new Set(set).add(bid));
    if (blocks[i].collapsed) editBlock(bid, { collapsed: false }, true);
    scrollToBlock(bid);
  };
  openBlockRef.current = openBlock;

  // Table → deliverables list (right below it; the table itself stays).
  const makeDeliverables = async (b) => {
    const items = tableToDeliverables(b);
    if (!items.length) { toast('This table has no rows to turn into deliverables.'); return; }
    try {
      const nb = await addBlockAfter('deliverables', b.id);
      editBlock(nb.id, { items, ...(b.title && b.title !== 'Table' ? { title: b.title } : {}) }, true);
      toast(`Deliverables list with ${items.length} item${items.length === 1 ? '' : 's'} added below — the table stays until you delete it`);
      openBlock(nb.id);
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
      openBlock(sb.id);
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
  // Server answers carry every block; keep this page's (possibly unsaved) copies.
  const mergeBlocks = (next) => setPlan((prev) => ({ ...prev, blocks: next.blocks.map((x) => prev.blocks.find((y) => y.id === x.id) || x) }));
  // A new block goes into the open tab, opened and in view.
  const addBlock = async (type) => {
    const before = new Set(plan.blocks.map((b) => b.id));
    try {
      const next = await api.addBlock(id, type, { tab: BLOCK_TABS.includes(tab) ? tab : undefined });
      mergeBlocks(next);
      const nb = next.blocks.find((b) => !before.has(b.id));
      if (nb) { setOpened((set) => new Set(set).add(nb.id)); scrollToBlock(nb.id); }
    } catch (e) { toast(`Could not add block: ${e.message}`, 'error'); }
  };
  // Up / down among the blocks of the same tab (they needn't be next to each other).
  const neighbourInTab = (b, dir) => {
    const blocks = plan.blocks; const tabs = blockTabs(blocks);
    const i = blocks.indexOf(b); const step = dir === 'up' ? -1 : 1;
    for (let j = i + step; j >= 0 && j < blocks.length; j += step) if (tabs[j] === tabs[i]) return blocks[j];
    return null;
  };
  const moveBlock = async (b, dir) => {
    const other = neighbourInTab(b, dir);
    if (!other) return;
    const tabs = blockTabs(plan.blocks);
    // Headings / dividers without a tab of their own follow their neighbours — pin them first.
    for (const x of [b, other]) if (!x.tab) editBlock(x.id, { tab: tabs[plan.blocks.indexOf(x)] }, true);
    try { mergeBlocks(await api.moveBlock(id, b.id, dir, other.id)); } catch (e) { toast(`Failed: ${e.message}`, 'error'); }
  };
  // Drag and drop: put a block right before / after another. Headings and
  // dividers that only follow their neighbours keep the tab they're in now.
  const placeBlock = async (movedId, where) => {
    const all = planRef.current?.blocks || [];
    const t = blockTabs(all);
    const pin = {};
    all.forEach((b, i) => { if (!b.tab && STRUCTURAL.has(b.type)) pin[b.id] = t[i]; });
    setPlan((prev) => { // at once on screen, then saved
      const moved = prev.blocks.find((b) => b.id === movedId);
      const rest = prev.blocks.filter((b) => b.id !== movedId).map((b) => (pin[b.id] ? { ...b, tab: pin[b.id] } : b));
      const k = rest.findIndex((b) => b.id === (where.after || where.before));
      if (!moved || k === -1) return prev;
      rest.splice(where.after ? k + 1 : k, 0, pin[movedId] ? { ...moved, tab: pin[movedId] } : moved);
      return { ...prev, blocks: rest };
    });
    try { mergeBlocks(await api.placeBlock(id, movedId, { ...where, pin })); } catch (e) { toast(`Could not move it: ${e.message}`, 'error'); }
  };
  const tabsNow = plan ? blockTabs(plan.blocks) : [];
  const tabIds = plan ? plan.blocks.filter((_, i) => tabsNow[i] === tab).map((b) => b.id) : [];
  const blocksRef = useRef(null);
  const sort = useSortable({
    ids: tabIds, container: blocksRef, mode: 'rect', axis: 'y', threshold: 5,
    onMove: (from, to) => {
      const order = moveItem(tabIds, from, to);
      placeBlock(tabIds[from], to > 0 ? { after: order[to - 1] } : { before: order[1] });
    },
  });
  // The handle a block is dragged by (arrow keys move it too).
  const gripOf = (b) => (
    <button type="button" className="block-grip" {...sort.grab(b.id)} title="Drag to move · ↑ ↓ with the keyboard" aria-label={`Move “${b.title || 'block'}”`}
      onKeyDown={(e) => { if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); moveBlock(b, e.key === 'ArrowUp' ? 'up' : 'down'); } }}>
      <GripVertical size={15} className="grip-v" /><GripHorizontal size={15} className="grip-h" />
    </button>
  );
  const moveToTab = (b, key) => {
    editBlock(b.id, { tab: key }, true);
    toast(`Moved to ${planTab(key).label}`, 'ok', { label: 'Show', onClick: () => openBlockRef.current?.(b.id) });
  };
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
  // Dropping files onto a moodboard / PDF / files block uploads them into it.
  const dropOn = (b, board = false) => ({
    dragOver: dragBlock === b.id,
    onDrag: (on) => setDragBlock(on ? b.id : null),
    onDropFiles: (files) => { pending.current = b.id; if (board) lastMoodboard.current = b.id; onFiles(files); },
  });
  const addFilesTo = (bid) => { pending.current = bid; filesRef.current?.click(); };
  const addPdfTo = (bid) => { pending.current = bid; pdfRef.current?.click(); };
  const onFiles = async (files) => {
    if (!files?.length || !pending.current) return;
    const board = planRef.current?.blocks?.find((x) => x.id === pending.current)?.type === 'moodboard'; // a moodboard's pictures get made smaller; a files block keeps them
    try { setPlan(await api.addBlockFiles(id, pending.current, files, { pictures: board })); } catch (e) { toast(`Upload failed: ${e.message}`, 'error'); }
  };
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
  const onExtract = async (file, bid = pending.current) => {
    if (!file || !bid) return;
    try {
      const rgbs = await extractPalette(file, 6);
      const b = (planRef.current?.blocks || []).find((x) => x.id === bid); if (!b) return;
      const add = rgbs.map((c) => ({ id: rid(), hex: rgbToHex(c), name: '' }));
      editBlock(bid, { items: [...(b.items || []), ...add] }, true);
      toast(`Added ${add.length} colour${add.length === 1 ? '' : 's'}`);
    } catch (e) { toast(`Could not extract colours: ${e.message}`, 'error'); }
  };

  if (error) return <div className="detail"><BackBtn /> <div className="center-msg">Couldn’t load: {error}</div></div>;
  if (!plan) return <div className="detail"><div className="spinner" /></div>;


  const blockMenu = (b, i) => [
    ...(b.type === 'script' ? [{ label: 'Storyboard from script', icon: <Clapperboard size={15} />, onClick: () => scriptToStoryboard(b) }] : []),
    ...(b.type === 'table' && (b.rows || []).length ? [{ label: 'Make a deliverables list', icon: <PackageCheck size={15} />, onClick: () => makeDeliverables(b) }] : []),
    ...(b.type === 'heading' || b.type === 'divider' ? [] : [{ label: 'Rename', icon: <Pencil size={15} />, onClick: () => setRenameBlock(b) }]),
    ...(neighbourInTab(b, 'up') ? [{ label: 'Move up', icon: <ArrowUp size={15} />, onClick: () => moveBlock(b, 'up') }] : []),
    ...(neighbourInTab(b, 'down') ? [{ label: 'Move down', icon: <ArrowDown size={15} />, onClick: () => moveBlock(b, 'down') }] : []),
    ...(STRUCTURAL.has(b.type) ? [] : [{ label: b.collapsed ? 'Unfold' : 'Fold', icon: b.collapsed ? <ChevronDown size={15} /> : <ChevronUp size={15} />, onClick: () => editBlock(b.id, { collapsed: !b.collapsed }, true) }]),
    ...(STRUCTURAL.has(b.type) ? [] : [halfOf(b)
      ? { label: 'Full width', icon: <RectangleHorizontal size={15} />, onClick: () => editBlock(b.id, { width: 'full' }, true) }
      : { label: 'Half width (side by side)', icon: <Columns2 size={15} />, onClick: () => editBlock(b.id, { width: 'half' }, true) }]),
    { separator: true },
    ...PLAN_TABS.filter((t) => t.key !== 'overview' && t.key !== blockTabs(plan.blocks)[i]).map((t) => ({
      label: `Move to ${t.label}`, icon: <span className="status-dot" style={{ background: tabColor(t.key).fg }} />, onClick: () => moveToTab(b, t.key),
    })),
    { separator: true },
    { label: 'Delete block', icon: <Trash2 size={15} />, danger: true, onClick: () => deleteBlock(b) },
  ];

  // One block, fully shown (the per-type editors).
  const renderFull = (b, i, menu) => {
    const Meta = BLOCK_META[b.type] || BLOCK_META.text;

    if (b.type === 'script') {
      return <ScriptBlock key={b.id} plan={plan} block={b} menu={menu} icon={Meta.icon} editBlock={editBlock} planRef={planRef} toast={toast} />;
    }

    if (b.type === 'storyboard') {
      return (
        <StoryboardBlock key={b.id} plan={plan} block={b} menu={menu} icon={Meta.icon} fileUrl={(rel) => planFileUrl(plan, rel)} />
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
      return <BriefingBlock key={b.id} block={b} menu={menu} icon={Meta.icon} editBlock={editBlock} onCopy={() => copyBriefing(b)} onRemoveField={(f) => removeField(b, f)} />;
    }

    if (b.type === 'moodboard') {
      return (
        <MoodboardBlock key={b.id} plan={plan} block={b} menu={menu} icon={Meta.icon} editBlock={editBlock} {...dropOn(b, true)}
          onAddFiles={() => { lastMoodboard.current = b.id; addFilesTo(b.id); }}
          onFromApp={() => { lastMoodboard.current = b.id; setAppPick({ kind: 'moodboard', blockId: b.id }); }}
          onRemoveFile={(fid) => removeFile(b.id, fid)} onLightbox={(items, index) => setLightbox({ items, index })} />
      );
    }

    if (b.type === 'text') {
      return <TextBlock key={b.id} block={b} menu={menu} icon={Meta.icon} editBlock={editBlock} />;
    }

    if (b.type === 'todos') {
      return <TodosBlock key={b.id} block={b} menu={menu} icon={Meta.icon} editBlock={editBlock} />;
    }

    if (b.type === 'links') {
      return <LinksBlock key={b.id} block={b} menu={menu} icon={Meta.icon} editBlock={editBlock} />;
    }

    if (b.type === 'refs') {
      return (
        <RefsBlock key={b.id} block={b} menu={menu} icon={Meta.icon} refCache={refCache}
          onPick={() => setRefPickerBlock(b.id)} onRemove={(itemId) => removeRef(b.id, itemId)} onOpen={openRef} />
      );
    }

    if (b.type === 'palette') {
      return (
        <PaletteBlock key={b.id} block={b} menu={menu} icon={Meta.icon} editBlock={editBlock} toast={toast}
          onExtract={() => extractInto(b.id)} onFromApp={() => setAppPick({ kind: 'palette', blockId: b.id })} />
      );
    }

    if (b.type === 'heading') {
      return <HeadingBlock key={b.id} block={b} menu={menu} editBlock={editBlock} />;
    }

    if (b.type === 'divider') {
      return <DividerBlock key={b.id} menu={menu} />;
    }

    if (b.type === 'table') {
      return <TableBlock key={b.id} block={b} menu={menu} icon={Meta.icon} editBlock={editBlock} />;
    }

    if (b.type === 'pdf') {
      return <PdfBlock key={b.id} plan={plan} block={b} menu={menu} icon={Meta.icon} {...dropOn(b)} onAdd={() => addPdfTo(b.id)} onRemoveFile={(fid) => removeFile(b.id, fid)} />;
    }

    // files — each file shows a square example image before it.
    return <FilesBlock key={b.id} plan={plan} block={b} menu={menu} icon={Meta.icon} {...dropOn(b)} onAdd={() => setFileModalBlock(b.id)} onRemoveFile={(fid) => removeFile(b.id, fid)} />;
  };

  // Tabs: which tab each block sits in, how many each holds, fold / unfold all.
  const tabs = plan ? blockTabs(plan.blocks) : [];
  const tabCounts = Object.fromEntries(BLOCK_TABS.map((k) => [k, tabs.filter((t) => t === k).length]));
  const foldable = plan ? plan.blocks.filter((b, i) => tabs[i] === tab && !STRUCTURAL.has(b.type) && !isEmptyBlock(b)) : [];
  const anyOpen = foldable.some((b) => !b.collapsed);
  const foldAll = () => { for (const b of foldable) if (!!b.collapsed !== anyOpen) editBlock(b.id, { collapsed: anyOpen }, true); };

  // A block as it shows in its tab: a slim row while empty (until opened) or
  // folded, else in full with a fold button next to its ⋯ menu.
  const asRow = (b) => !STRUCTURAL.has(b.type) && ((isEmptyBlock(b) && !opened.has(b.id)) || b.collapsed);
  // The tab's blocks; two half-width ones in a row sit side by side (on wide screens).
  const renderTab = () => {
    const out = [];
    let wait = null; // a half-width block waiting for a partner
    plan.blocks.forEach((b, i) => {
      if (tabs[i] !== tab) return;
      const el = renderBlock(b, i);
      if (halfOf(b) && !asRow(b)) {
        if (wait) { out.push(<div className="block-duo" key={`duo-${wait.id}`}>{wait.el}{el}</div>); wait = null; } else wait = { id: b.id, el };
        return;
      }
      if (wait) { out.push(wait.el); wait = null; }
      out.push(el);
    });
    if (wait) out.push(wait.el);
    return out;
  };
  const renderBlock = (b, i) => {
    const menuEl = <Menu align="right" trigger={<button className="icon-btn" style={{ width: 34, height: 34 }} aria-label="Block options"><MoreHorizontal size={16} /></button>} items={blockMenu(b, i)} />;
    const color = tabColor(tabs[i]).fg;
    if (!STRUCTURAL.has(b.type)) {
      if (isEmptyBlock(b) && !opened.has(b.id)) {
        return <BlockRow key={b.id} plan={plan} block={b} empty color={color} menu={menuEl} onOpen={() => setOpened((set) => new Set(set).add(b.id))} grip={gripOf(b)} sortClass={sort.itemState(b.id).className} />;
      }
      if (b.collapsed) {
        return <BlockRow key={b.id} plan={plan} block={b} color={color} menu={menuEl} onOpen={() => editBlock(b.id, { collapsed: false }, true)} grip={gripOf(b)} sortClass={sort.itemState(b.id).className} />;
      }
    }
    const fold = STRUCTURAL.has(b.type) || b.type === 'moodboard' ? null : (
      <button className="icon-btn block-fold" style={{ width: 34, height: 34 }} onClick={() => editBlock(b.id, { collapsed: true }, true)} title="Fold" aria-label="Fold block"><ChevronUp size={16} /></button>
    );
    return (
      <div className={`tab-block ${sort.itemState(b.id).className}`} key={b.id} data-block={b.id} data-sort-id={b.id} style={{ '--tab-fg': color }}>
        {gripOf(b)}
        {renderFull(b, i, <span className="block-actions">{fold}{menuEl}</span>)}
      </div>
    );
  };

  return (
    <div className="detail has-toc">
      <PlanToc plan={plan} tabs={tabs} tab={tab} onOpen={openBlock} onTab={setTab} />
      <div className="plan-topbar">
        <BackBtn to="/plan" label="Back to Projects" />
        <div className="plan-topbar-r">
        <button type="button" className={`icon-btn plan-pin ${plan.pinned ? 'on' : ''}`} onClick={() => patch({ pinned: !plan.pinned })}
          title={plan.pinned ? 'Unpin — no longer on top of the project list' : 'Pin — keep it on top of the project list'} aria-label={plan.pinned ? 'Unpin project' : 'Pin project'} aria-pressed={!!plan.pinned}>
          {plan.pinned ? <PinOff size={16} /> : <Pin size={16} />}
        </button>
        <Menu
          trigger={<button className="btn btn-sm"><Pencil size={15} /> Edit <MoreHorizontal size={15} /></button>}
          items={[
            { label: plan.pinned ? 'Unpin from the top' : 'Pin to the top', icon: plan.pinned ? <PinOff size={15} /> : <Pin size={15} />, onClick: () => patch({ pinned: !plan.pinned }) },
            { label: 'Rename', icon: <Pencil size={15} />, onClick: () => setRenaming(true) },
            { label: plan.banner || plan.bannerGradient ? 'Change banner…' : 'Add a banner…', icon: <ImageIcon size={15} />, onClick: () => { window.scrollTo({ top: 0, behavior: 'smooth' }); setBannerAsk((n) => n + 1); } },
            { label: 'Save as template…', icon: <LayoutTemplate size={15} />, onClick: () => setSavingTemplate(true) },
            { label: 'Archive as reference…', icon: <Archive size={15} />, onClick: () => setArchiving(true) },
            { label: 'Make a post…', icon: <Megaphone size={15} />, hint: 'In Content: with its latest review cut and banner', onClick: () => makePost({ kind: 'plan', planId: plan.id }) },
            { separator: true },
            { label: 'Delete project', icon: <Trash2 size={15} />, danger: true, onClick: remove },
          ]}
        />
        </div>
      </div>

      <PlanIdentity plan={plan} setPlan={setPlan} toast={toast} onFromApp={(kind) => setAppPick({ kind })} pickBanner={bannerAsk}
        onUpload={(kind) => (kind === 'banner' ? bannerRef : avatarRef).current?.click()} />
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
        <ClientPicker clients={clients} value={plan.clientId} onPick={pickClient} onCreate={newClient} onOpen={(cid) => navigate(`/clients/${cid}`)} />
        <PlanWhen plan={plan} milestones={milestones} open={whenOpen} onToggle={() => setWhenOpen((v) => !v)} />
        <PlanTime plan={plan} toast={toast} onChange={editMoney} />
      </div>
      {/* Timeframe + milestones: one line in the header, the details on click */}
      {whenOpen && (
        <PlanWhenPanel plan={plan} milestones={milestones} onPatch={patch}
          onAdd={addMilestone} onEdit={editMilestone} onRemove={removeMilestone} />
      )}

      <LibraryChips items={plan.archivedAs} />

      {appPick && (
        <MediaPicker accept="image" onPick={pickFromApp} onClose={() => setAppPick(null)}
          title={appPick.kind === 'banner' ? 'Banner from the app' : appPick.kind === 'avatar' ? 'Profile picture from the app' : appPick.kind === 'palette' ? 'Extract colours from…' : 'Add to the moodboard'} />
      )}

      <input ref={bannerRef} type="file" accept="image/*" className="visually-hidden-input" onChange={(e) => { setImage('banner', e.target.files[0]); e.target.value = ''; }} />
      <input ref={avatarRef} type="file" accept="image/*" className="visually-hidden-input" onChange={(e) => { setImage('avatar', e.target.files[0]); e.target.value = ''; }} />
      <input ref={filesRef} type="file" multiple className="visually-hidden-input" onChange={(e) => { onFiles(e.target.files); e.target.value = ''; }} />
      <input ref={pdfRef} type="file" accept="application/pdf,.pdf" multiple className="visually-hidden-input" onChange={(e) => { onFiles(e.target.files); e.target.value = ''; }} />
      <input ref={paletteRef} type="file" accept="image/*" className="visually-hidden-input" onChange={(e) => { onExtract(e.target.files[0]); e.target.value = ''; }} />

      <PlanTabs active={tab} counts={tabCounts} current={statusTab(plan.status)} onPick={setTab}
        tools={(
          <>
            <PlanJump plan={plan} tabs={tabs} onOpen={openBlock} />
            {tab !== 'overview' && foldable.length > 0 && (
              <button type="button" className="btn btn-sm btn-ghost" onClick={foldAll} title={anyOpen ? 'Fold every block in this tab' : 'Unfold every block in this tab'}>
                {anyOpen ? <><ChevronsDownUp size={14} /> Fold all</> : <><ChevronsUpDown size={14} /> Unfold all</>}
              </button>
            )}
          </>
        )} />

      {tab === 'overview' ? (
        <>
          <PlanOverview plan={plan} tabs={tabs} onOpen={openBlock} onTab={setTab} />
          {/* The To-Do board's cards linked to this plan */}
          <PlanTodos planId={plan.id} toast={toast} />
        </>
      ) : (
        <>
          <div className="tab-blocks" ref={blocksRef}>{renderTab()}</div>
          {sort.drag && (() => {
            const b = plan.blocks.find((x) => x.id === sort.drag.id);
            const Meta = BLOCK_META[b?.type] || BLOCK_META.text;
            return <div className="block-ghost" style={{ left: sort.drag.x + 14, top: sort.drag.y + 12 }}><Meta.icon size={14} /> {b?.title || Meta.label}</div>;
          })()}
          {!tabCounts[tab] && (
            <div className="empty-hint tab-empty">Nothing in {planTab(tab).label} yet — add a block below, or move one here with its ⋯ menu.</div>
          )}

          {/* Add block — into this tab */}
          <div className="add-block">
            <Menu
              align="left"
              trigger={<button className="add-block-btn"><Plus size={16} /> Add block to {planTab(tab).label}</button>}
              items={Object.entries(BLOCK_META).map(([type, m]) => ({ label: m.label, icon: <m.icon size={15} />, onClick: () => addBlock(type) }))}
            />
          </div>
        </>
      )}

      {lightbox && (
        <Lightbox items={lightbox.items} index={lightbox.index} onIndex={(n) => setLightbox((l) => ({ ...l, index: n }))} onClose={() => setLightbox(null)} />
      )}
      {renaming && (
        <GalleryNameModal title="Rename project" initialName={plan.name} submitLabel="Save" placeholder="Project name"
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
