// Projects (plans): blocks, storyboards, scripts, review versions, deliverables, budget.
// Part of the record shapes (see ../schema.js, which re-exports all of it).
import { nanoid } from 'nanoid';
import { num, str } from './base.js';
import { SEGMENT_KINDS } from './references.js';

// ---------------------------------------------------------------------------
// Plans
// ---------------------------------------------------------------------------
export const BLOCK_TYPES = new Set(['moodboard', 'text', 'todos', 'files', 'pdf', 'links', 'refs', 'palette', 'heading', 'divider', 'table', 'briefing', 'storyboard', 'script', 'review', 'deliverables']);
export const BLOCK_TITLES = {
  moodboard: 'Moodboard', text: 'Text', todos: 'To-dos', files: 'Files', pdf: 'PDF', links: 'Links',
  refs: 'References', palette: 'Palette', heading: 'Heading', divider: 'Divider', table: 'Table',
  briefing: 'Briefing', storyboard: 'Storyboard', script: 'Script', review: 'Review', deliverables: 'Deliverables',
};
// A plan's blocks are grouped in tabs by phase. Blocks without one (made
// before tabs existed) go by their type; headings / dividers with the block
// that follows them.
export const BLOCK_TABS = ['brief', 'concept', 'production', 'delivery'];
export const BLOCK_WIDTHS = ['auto', 'full', 'half'];
const TYPE_TAB = {
  briefing: 'brief', text: 'brief', table: 'brief',
  moodboard: 'concept', refs: 'concept', palette: 'concept', links: 'concept',
  script: 'production', storyboard: 'production', todos: 'production',
  review: 'delivery', deliverables: 'delivery', files: 'delivery', pdf: 'delivery',
};
const STRUCTURAL = new Set(['heading', 'divider']);
/** The tab of every block, in order. */
export function inferTabs(blocks) {
  const list = Array.isArray(blocks) ? blocks : [];
  const own = list.map((b) => (BLOCK_TABS.includes(b?.tab) ? b.tab : STRUCTURAL.has(b?.type) ? null : TYPE_TAB[b?.type] || 'brief'));
  return own.map((t, i) => {
    if (t) return t;
    for (let j = i + 1; j < own.length; j += 1) if (own[j] && !STRUCTURAL.has(list[j]?.type)) return own[j];
    for (let j = i - 1; j >= 0; j -= 1) if (own[j]) return own[j];
    return 'brief';
  });
}
// Where a plan stands. '' = no status (every plan made before statuses existed).
export const PLAN_STATUSES = ['briefing', 'concept', 'design', 'production', 'review', 'delivered', 'archived'];
// A briefing block is a list of question → answer fields.
export const normalizeField = (f) => ({ id: f?.id ? str(f.id, 40) : nanoid(6), label: str(f?.label, 120), value: str(f?.value, 20000) });
// Storyboard + script blocks.
export const STORYBOARD_ASPECTS = ['16:9', '9:16', '1:1', '4:5'];
// A block's files live in its own folder; nothing else may be referenced.
const blockFile = (blockId, v) => (typeof v === 'string' && v.startsWith(`blocks/${blockId}/`) && !v.includes('..') ? str(v, 300) : null);
// Where a shot stands: sketch → styleframe → animated → approved ('' = not set).
export const SHOT_STATUS = ['sketch', 'styleframe', 'animated', 'approved'];
export const normalizeShot = (s, blockId) => ({
  id: s?.id ? str(s.id, 40) : nanoid(6),
  image: blockFile(blockId, s?.image),
  duration: num(s?.duration, 0.1, 600, 2),
  visual: str(s?.visual, 4000),
  vo: str(s?.vo, 4000),
  onscreen: str(s?.onscreen, 2000), // on-screen text / supers
  sfx: str(s?.sfx, 2000),           // sound effects, music cues
  notes: str(s?.notes, 4000),
  size: str(s?.size, 40),           // shot size (wide, close-up …)
  camera: str(s?.camera, 60),       // camera move
  transition: str(s?.transition, 60), // into the next shot
  section: SEGMENT_KINDS.includes(s?.section) ? s.section : '',
  status: SHOT_STATUS.includes(s?.status) ? s.status : '',
  // Other versions of the frame (sketches, drawings, earlier frames); `image` is the one in use.
  alts: (Array.isArray(s?.alts) ? s.alts : []).slice(0, 30)
    .map((a) => ({ id: a?.id ? str(a.id, 40) : nanoid(6), image: blockFile(blockId, a?.image), label: str(a?.label, 80) }))
    .filter((a) => a.image),
  // A voice-over recorded for this shot (plays from the shot's start).
  voice: normalizeVoice(s?.voice, blockId),
});
/**
 * A storyboard template of your own (saved from a storyboard): its shots
 * without pictures — section, duration and the text fields.
 */
const TEMPLATE_TEXT = { visual: 4000, vo: 4000, onscreen: 2000, sfx: 2000, notes: 4000, size: 40, camera: 60, transition: 60 };
export function normalizeStoryboardTemplate(t) {
  return {
    key: typeof t?.key === 'string' && /^own-[\w-]{1,40}$/.test(t.key) ? t.key : `own-${nanoid(8)}`,
    label: str(t?.label, 120).trim() || 'My template',
    description: str(t?.description, 400),
    aspect: STORYBOARD_ASPECTS.includes(t?.aspect) ? t.aspect : '16:9',
    target: num(t?.target, 1, 3600, null),
    shots: (Array.isArray(t?.shots) ? t.shots : []).filter((s) => s && typeof s === 'object').slice(0, 300).map((s) => ({
      section: SEGMENT_KINDS.includes(s.section) ? s.section : '',
      duration: num(s.duration, 0.1, 600, 2),
      ...Object.fromEntries(Object.entries(TEMPLATE_TEXT).map(([k, max]) => [k, str(s[k], max)])),
    })),
    createdAt: num(t?.createdAt, 0, 1e14, Date.now()),
  };
}
function normalizeVoice(v, blockId) {
  const file = blockFile(blockId, v?.file);
  return file ? { file, duration: num(v?.duration, 0, 600, 0), volume: num(v?.volume, 0, 1, 1) } : null;
}
// The music's beat (for cuts on the beat): tempo, where the first beat falls, snapping on / off.
export const normalizeBeat = (b) => (b && typeof b === 'object' && Number(b.bpm) > 0
  ? { bpm: num(b.bpm, 30, 300, 120), offset: num(b.offset, 0, 60, 0), snap: b.snap !== false, auto: !!b.auto } : null);
// Cutdowns: shorter versions of the storyboard — the shots left out and any shorter durations.
export const normalizeCutdowns = (list) => (Array.isArray(list) ? list : []).slice(0, 12).map((c) => ({
  id: c?.id ? str(c.id, 40) : nanoid(6),
  name: str(c?.name, 80) || 'Cutdown',
  target: c?.target == null || c?.target === '' ? null : num(c.target, 1, 3600, 15),
  skip: (Array.isArray(c?.skip) ? c.skip : []).map((x) => str(x, 40)).filter(Boolean).slice(0, 500),
  durations: Object.fromEntries(Object.entries(c?.durations && typeof c.durations === 'object' ? c.durations : {})
    .slice(0, 500).filter(([k, v]) => k && Number.isFinite(Number(v))).map(([k, v]) => [str(k, 40), num(v, 0.1, 600, 2)])),
}));
export const normalizeAudio = (a, blockId) => {
  const file = blockFile(blockId, a?.file);
  return file ? { file, name: str(a?.name, 200), size: Number.isFinite(a?.size) ? a.size : 0 } : null;
};
export const normalizeLine = (l) => ({ id: l?.id ? str(l.id, 40) : nanoid(6), visual: str(l?.visual, 4000), vo: str(l?.vo, 4000) });
// Review block: uploaded versions (renders) with time-stamped comments.
export const normalizeComment = (c) => ({
  id: c?.id ? str(c.id, 40) : nanoid(6),
  t: num(c?.t, 0, 86400, 0),
  text: str(c?.text, 4000),
  done: !!c?.done,
  createdAt: num(c?.createdAt, 0, 1e14, 0),
});
export const normalizeVersion = (v, blockId) => ({
  id: v?.id ? str(v.id, 40) : nanoid(6),
  file: blockFile(blockId, v?.file),
  name: str(v?.name, 200),
  size: num(v?.size, 0, 1e13, 0),
  label: str(v?.label, 40),
  approved: !!v?.approved,
  createdAt: num(v?.createdAt, 0, 1e14, 0),
  comments: (Array.isArray(v?.comments) ? v.comments : []).slice(0, 2000).map(normalizeComment),
});
// Deliverables block: every export to deliver, with its spec and where it stands.
export const DELIVERABLE_STATUS = ['open', 'rendering', 'review', 'delivered'];
export const normalizeDeliverable = (d) => ({
  id: d?.id ? str(d.id, 40) : nanoid(6),
  name: str(d?.name, 200),
  aspect: str(d?.aspect, 20),
  resolution: str(d?.resolution, 40),
  fps: str(d?.fps, 20),
  codec: str(d?.codec, 60),
  length: str(d?.length, 40),
  status: DELIVERABLE_STATUS.includes(d?.status) ? d.status : 'open',
  notes: str(d?.notes, 2000),
});
export const normalizeTarget = (v) => num(v, 1, 3600, null);
 // seconds, or null = none / from the briefing
export const normalizePace = (v) => num(v, 0.5, 6, 2.5);
     // words per second

// `fallbackId` keeps ids stable across reads for records that never had one,
// so the client can address a block it was just sent.
export function normalizeBlock(b, fallbackId) {
  if (!b || typeof b !== 'object') return null;
  if (!BLOCK_TYPES.has(b.type)) return null;
  if (!b.id) b.id = fallbackId || nanoid(8);
  if (typeof b.title !== 'string') b.title = BLOCK_TITLES[b.type];
  if ('tab' in b && !BLOCK_TABS.includes(b.tab)) delete b.tab;
  // Its width on the plan page: 'auto' (small blocks sit side by side), 'full' or 'half'.
  if ('width' in b && !BLOCK_WIDTHS.includes(b.width)) delete b.width;
  if (b.type === 'moodboard') {
    if (typeof b.collapsed !== 'boolean') b.collapsed = false;
    if (!Array.isArray(b.images)) b.images = [];
  } else if (b.type === 'text') {
    if (typeof b.content !== 'string') b.content = '';
  } else if (b.type === 'todos') {
    if (!Array.isArray(b.items)) b.items = [];
  } else if (b.type === 'files' || b.type === 'pdf') {
    if (!Array.isArray(b.files)) b.files = [];
    delete b.cover; // legacy block-level cover — files now carry per-item example images
  } else if (b.type === 'links' || b.type === 'refs' || b.type === 'palette') {
    if (!Array.isArray(b.items)) b.items = [];
  } else if (b.type === 'heading') {
    if (typeof b.content !== 'string') b.content = '';
  } else if (b.type === 'table') {
    if (!Array.isArray(b.columns)) b.columns = [];
    if (!Array.isArray(b.rows)) b.rows = [];
  } else if (b.type === 'briefing') {
    if (!Array.isArray(b.fields)) b.fields = [];
  } else if (b.type === 'storyboard') {
    if (!Array.isArray(b.shots)) b.shots = [];
    if (!STORYBOARD_ASPECTS.includes(b.aspect)) b.aspect = '16:9';
    if (!('audio' in b)) b.audio = null;
    if (!('target' in b)) b.target = null;
    if (!('beat' in b)) b.beat = null;
    if (!Array.isArray(b.cutdowns)) b.cutdowns = [];
  } else if (b.type === 'review') {
    if (!Array.isArray(b.versions)) b.versions = [];
  } else if (b.type === 'deliverables') {
    if (!Array.isArray(b.items)) b.items = [];
  } else if (b.type === 'script') {
    if (!Array.isArray(b.lines)) b.lines = [];
    if (!Number.isFinite(b.pace)) b.pace = 2.5;
    if (!('target' in b)) b.target = null;
  }
  return b;
}
// Is this plan stored in a pre-blocks shape?
export const isLegacyPlan = (plan) => !!plan && !Array.isArray(plan.blocks);
// Bring a plan up to the current shape. Sections are a `blocks` array; older
// plans are converted: the very first version had one `moodboard` image list,
// the next one `moodboards` + `info` + `todos`.
export function normalizePlan(plan) {
  if (!plan) return plan;
  if (!Array.isArray(plan.blocks)) {
    const blocks = [];
    const boards = Array.isArray(plan.moodboards) ? plan.moodboards : [];
    const boardImageIds = new Set(boards.flatMap((mb) => (Array.isArray(mb?.images) ? mb.images : []).map((i) => i?.id)));
    const single = (Array.isArray(plan.moodboard) ? plan.moodboard : []).filter((i) => !boardImageIds.has(i?.id));
    if (single.length) {
      blocks.push({ id: 'moodboard', type: 'moodboard', title: 'Moodboard', collapsed: false, images: single });
    }
    boards.forEach((mb, i) => {
      blocks.push({ id: mb?.id || `moodboard-${i + 1}`, type: 'moodboard', title: mb?.name || 'Moodboard', collapsed: !!mb?.collapsed, images: Array.isArray(mb?.images) ? mb.images : [] });
    });
    if (typeof plan.info === 'string' && plan.info.trim()) blocks.push({ id: 'information', type: 'text', title: 'Information', content: plan.info });
    if (Array.isArray(plan.todos) && plan.todos.length) blocks.push({ id: 'todos', type: 'todos', title: 'To-dos', items: plan.todos });
    plan.blocks = blocks;
  }
  plan.blocks = plan.blocks.map((b, i) => normalizeBlock(b, `block-${i + 1}`)).filter(Boolean);
  delete plan.moodboard; delete plan.moodboards; delete plan.info; delete plan.todos;
  if (!Array.isArray(plan.milestones)) plan.milestones = [];
  if (!('start' in plan)) plan.start = '';
  if (!('end' in plan)) plan.end = '';
  if (!('banner' in plan)) plan.banner = null;
  if (!('bannerGradient' in plan)) plan.bannerGradient = null;
  if (!('avatar' in plan)) plan.avatar = null;
  if (!('avatarEmoji' in plan)) plan.avatarEmoji = null;
  if (!PLAN_STATUSES.includes(plan.status)) plan.status = '';
  if (typeof plan.client !== 'string') plan.client = '';
  if (!Array.isArray(plan.archivedAs)) plan.archivedAs = []; // library projects made from this plan
  plan.pinned = !!plan.pinned;                // on top of the project list
  plan.budget = normalizeBudget(plan.budget); // hours for the project or per month (null = none)
  plan.rate = normalizeRate(plan.rate);       // hourly rate (null = none)
  return plan;
}
/** A project's hour budget: { hours, per: 'project' | 'month' } — or null. */
export function normalizeBudget(b) {
  const h = Number(b?.hours);
  if (!b || !Number.isFinite(h) || h <= 0) return null;
  return { hours: Math.round(Math.min(h, 100000) * 100) / 100, per: b.per === 'month' ? 'month' : 'project' };
}
/** An hourly rate (in the currency of the settings) — or null. */
export function normalizeRate(v) {
  const n = Number(v);
  return v == null || v === '' || !Number.isFinite(n) || n <= 0 ? null : Math.round(Math.min(n, 1e6) * 100) / 100;
}
