/**
 * The shape of db.json: read-time normalizers (so any older library keeps
 * loading as-is) and the explicit, versioned migration that rewrites old
 * records into the current shape once, on request.
 *
 * Version history
 *   1 — implicit: every library written before versioning existed. Old record
 *       shapes are converted on the fly on every read.
 *   2 — all records stored in the current shape; `schemaVersion` recorded.
 */
import { nanoid } from 'nanoid';
import { DEFAULT_STORAGE_LIMIT } from './config.js';

export const SCHEMA_VERSION = 2;
export const schemaVersionOf = (db) => (Number.isInteger(db?.schemaVersion) ? db.schemaVersion : 1);

export const str = (v, max = 2000) => String(v == null ? '' : v).slice(0, max);
export const TAG_KEYS = new Set(['red', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'gray']);
export const CURRENCIES = new Set(['EUR', 'USD', 'GBP', 'CHF', 'JPY', 'CAD', 'AUD']);

export const emptyDB = () => ({
  schemaVersion: SCHEMA_VERSION, projects: [], galleries: [], plans: [], planTemplates: [], software: [], trash: [], inbox: [], mockups: [], mockupModels: [], mockupHdris: [],
  settings: { storageLimitBytes: DEFAULT_STORAGE_LIMIT },
});

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
const num = (v, min, max, fallback) => {
  const n = Number(v);
  return v !== '' && v != null && Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};
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
});
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
export const normalizeTarget = (v) => num(v, 1, 3600, null); // seconds, or null = none / from the briefing
export const normalizePace = (v) => num(v, 0.5, 6, 2.5);     // words per second

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
  return plan;
}

// ---------------------------------------------------------------------------
// Motion segments — labeled sections of a video (Hook, Problem, Reveal …)
// ---------------------------------------------------------------------------
export const SEGMENT_KINDS = ['hook', 'problem', 'reveal', 'features', 'proof', 'cta', 'outro'];
// Segments written before section types existed only have a free-text label.
// A label that names a type is read as that type — an exact name moves into
// the type (the label would just repeat it), anything else stays as a note.
const SEGMENT_ALIASES = {
  hook: ['hook', 'opener', 'opening'],
  problem: ['problem', 'pain', 'pain point', 'challenge'],
  reveal: ['reveal', 'product reveal', 'solution', 'product', 'lösung', 'produkt'],
  features: ['features', 'feature', 'demo', 'product demo', 'showcase', 'benefits'],
  proof: ['social proof', 'proof', 'testimonial', 'testimonials', 'reviews', 'trust'],
  cta: ['cta', 'call to action', 'call-to-action'],
  outro: ['outro', 'logo outro', 'end card', 'endcard', 'end', 'abspann'],
};
export function inferSegmentKind(label) {
  const t = String(label || '').trim().toLowerCase();
  if (!t) return null;
  const base = t.replace(/[\s\d.:#()–-]+$/, '');
  for (const [kind, names] of Object.entries(SEGMENT_ALIASES)) {
    if (names.includes(t)) return { kind, exact: true };
    if (base && names.includes(base)) return { kind, exact: false };
  }
  return null;
}
// Moments: time markers on a motion video, tagged with a technique (Match
// cut, Speed ramp …), an optional note and a captured frame (markers/…).
export const normalizeMarker = (m) => ({
  id: m?.id ? str(m.id, 40) : nanoid(6),
  t: num(m?.t, 0, 86400, 0),
  label: str(m?.label, 60),
  note: str(m?.note, 4000),
  thumb: typeof m?.thumb === 'string' && m.thumb.startsWith('markers/') && !m.thumb.includes('..') ? str(m.thumb, 200) : null,
});
export const normalizeMarkers = (arr) => (Array.isArray(arr) ? arr : []).filter((m) => m && typeof m === 'object')
  .slice(0, 1000).map(normalizeMarker).sort((a, b) => a.t - b.t);
// Audio waveform of a motion video: peak levels (0–100) across its length.
// `none: true` records that the video has no (readable) audio, so it isn't re-read.
export const normalizeWaveform = (w) => {
  if (!w || typeof w !== 'object') return null;
  if (w.none) return { peaks: [], duration: 0, none: true };
  if (!Array.isArray(w.peaks) || !w.peaks.length) return null;
  return { peaks: w.peaks.slice(0, 4000).map((x) => Math.round(num(x, 0, 100, 0))), duration: num(w.duration, 0, 86400, 0) };
};
export const videoDim = (v) => { const n = Math.round(Number(v)); return Number.isFinite(n) && n > 0 && n <= 20000 ? n : null; };

export function normalizeSegments(arr) {
  const segs = (Array.isArray(arr) ? arr : []).filter((s) => s && typeof s === 'object').slice(0, 200).map((s) => {
    let kind = SEGMENT_KINDS.includes(s.kind) ? s.kind : '';
    let label = str(s.label, 80);
    if (!('kind' in s)) {
      const hit = inferSegmentKind(label);
      if (hit) { kind = hit.kind; if (hit.exact) label = ''; }
    }
    const start = Number(s.start);
    return { id: s.id ? str(s.id, 40) : nanoid(6), start: Number.isFinite(start) ? Math.max(0, start) : 0, kind, label };
  }).sort((a, b) => a.start - b.start);
  if (segs.length) segs[0].start = 0;
  return segs;
}

// ---------------------------------------------------------------------------
// To-Do board (a single global Kanban planner: columns → cards → tags)
// ---------------------------------------------------------------------------
export function normalizeBoard(board) {
  const columns = Array.isArray(board?.columns) ? board.columns : [];
  return {
    columns: columns.slice(0, 40).map((c) => ({
      id: c?.id || nanoid(8),
      name: str(c?.name, 120),
      cards: (Array.isArray(c?.cards) ? c.cards : []).slice(0, 500).map((card) => ({
        id: card?.id || nanoid(8),
        title: str(card?.title, 4000),
        notes: str(card?.notes, 8000),
        color: TAG_KEYS.has(card?.color) ? card.color : null,
        urgent: !!card?.urgent,
        planId: typeof card?.planId === 'string' && card.planId ? str(card.planId, 40) : null, // the plan it belongs to
        tags: (Array.isArray(card?.tags) ? card.tags : []).slice(0, 20).map((t) => ({
          id: t?.id || nanoid(6),
          label: str(t?.label, 60),
          color: TAG_KEYS.has(t?.color) ? t.color : 'gray',
        })),
      })),
    })),
  };
}
export const DEFAULT_BOARD = () => ({
  columns: [
    { id: nanoid(8), name: 'To do', cards: [] },
    { id: nanoid(8), name: 'In progress', cards: [] },
    { id: nanoid(8), name: 'Done', cards: [] },
  ],
});

// ---------------------------------------------------------------------------
// Software — a topic per app with plugins, expressions and tutorials
// ---------------------------------------------------------------------------
export function normalizePlugin(p) {
  return {
    id: p?.id || nanoid(8),
    name: str(p?.name, 160), category: str(p?.category, 80),
    url: str(p?.url, 500), account: str(p?.account, 200), key: str(p?.key, 400),
    price: str(p?.price, 40), currency: CURRENCIES.has(p?.currency) ? p.currency : 'EUR',
    version: str(p?.version, 60), purchasedAt: str(p?.purchasedAt, 20), notes: str(p?.notes, 4000),
    file: p?.file ? str(p.file, 300) : null, fileName: p?.fileName ? str(p.fileName, 200) : null,
    size: Number.isFinite(p?.size) ? p.size : 0,
    image: p?.image ? str(p.image, 300) : null, imageName: p?.imageName ? str(p.imageName, 200) : null,
  };
}
export const normTags = (t) => (Array.isArray(t) ? t : []).slice(0, 24).map((x) => str(x, 40)).filter(Boolean);
export const normalizeExpr = (e) => ({ id: e?.id || nanoid(8), title: str(e?.title, 200), code: str(e?.code, 20000), notes: str(e?.notes, 4000), color: TAG_KEYS.has(e?.color) ? e.color : null, tags: normTags(e?.tags) });
export const normalizeExprGroup = (g) => ({
  id: g?.id || nanoid(8), name: str(g?.name, 160), collapsed: !!g?.collapsed,
  image: g?.image ? str(g.image, 300) : null, imageName: g?.imageName ? str(g.imageName, 200) : null,
  items: (Array.isArray(g?.items) ? g.items : []).slice(0, 500).map(normalizeExpr),
});
export const normalizeTut = (t) => ({ id: t?.id || nanoid(8), title: str(t?.title, 200), url: str(t?.url, 500), channel: str(t?.channel, 120), tags: normTags(t?.tags) });

export const isLegacySoftware = (s) => !!s && ('icon' in s || 'scripts' in s || 'expressions' in s || !Array.isArray(s.expressionGroups));

export function normalizeSoftware(s) {
  if (!s || typeof s !== 'object') return s;
  if (!s.id) s.id = nanoid(10);
  s.name = str(s.name, 120) || 'Untitled software';
  // Banner + avatar (like plans). `icon` is the legacy emoji → avatarEmoji.
  if (typeof s.avatarEmoji !== 'string') s.avatarEmoji = typeof s.icon === 'string' ? s.icon : '';
  delete s.icon;
  if (!('banner' in s)) s.banner = null;
  s.bannerGradient = s.bannerGradient != null ? str(s.bannerGradient, 40) : null;
  if (!('avatar' in s)) s.avatar = null;
  if (!Number.isFinite(s.createdAt)) s.createdAt = 0;
  // Legacy `scripts` fold into `plugins` (one combined list now).
  let plugins = Array.isArray(s.plugins) ? s.plugins : [];
  if (Array.isArray(s.scripts) && s.scripts.length) {
    plugins = [...plugins, ...s.scripts.map((sc, i) => ({ id: sc?.id || `script-${i + 1}`, name: sc?.name || sc?.fileName || 'Script', category: 'Script', notes: sc?.notes || '', file: sc?.file || null, fileName: sc?.fileName || null, size: sc?.size || 0 }))];
  }
  delete s.scripts;
  s.plugins = plugins.map(normalizePlugin);
  // Legacy flat `expressions` fold into a single default group.
  if (!Array.isArray(s.expressionGroups)) {
    const flat = Array.isArray(s.expressions) ? s.expressions : [];
    s.expressionGroups = flat.length ? [{ id: 'expressions', name: '', image: null, imageName: null, items: flat.map((e, i) => ({ ...e, id: e?.id || `expression-${i + 1}` })) }] : [];
  }
  delete s.expressions;
  s.expressionGroups = s.expressionGroups.map(normalizeExprGroup);
  s.tutorials = (Array.isArray(s.tutorials) ? s.tutorials : []).map(normalizeTut);
  return s;
}

// ---------------------------------------------------------------------------
// Logos — older versions stored different shapes (see logoNeedsMigration).
// These mirror the frontend's display helpers in src/lib/types.js exactly, so
// a migrated logo looks the same as the unmigrated one did.
// ---------------------------------------------------------------------------
export const logoSource = (p) => p.image || p.logoDark || p.logoLight || p.assets?.[0]?.file || null;
export function logoRenditionList(p) {
  const raw = p.renditions;
  if (Array.isArray(raw) && raw.length && typeof raw[0] === 'object' && raw[0]) return raw;
  const bg = p.bg || '#FFFFFF';
  const list = (Array.isArray(raw) && raw.length ? raw.map((c) => ({ color: c, bg })) : [
    { color: '#111114', bg: '#FFFFFF' }, { color: '#FFFFFF', bg: '#111114' },
  ]);
  if (p.original !== false && !list.some((e) => e.color === 'original')) list.push({ color: 'original', bg });
  return list;
}
export function logoActive(p) {
  const list = logoRenditionList(p);
  const r = p.rendition;
  if (r && typeof r === 'object' && r.color) return r;
  if (typeof r === 'string') return list.find((e) => e.color === r) || list[0];
  return list[0] || { color: 'original', bg: '#FFFFFF' };
}
export const logoNeedsMigration = (p) => p.type === 'logo' && (
  !p.image
  || !(Array.isArray(p.renditions) && p.renditions.length && typeof p.renditions[0] === 'object' && p.renditions[0])
  || !(p.rendition && typeof p.rendition === 'object' && p.rendition.color)
);

// ---------------------------------------------------------------------------
// Mockups — saved 3D device scenes, and 3D models imported by the user
// ---------------------------------------------------------------------------
export const MOCKUP_DEVICES = ['iphone', 'android', 'ipad', 'macbook', 'imac', 'watch', 'tv', 'browser', 'custom', 'object'];
export const MOCKUP_OBJECTS = ['card', 'poster', 'box', 'mug'];
export const MOCKUP_FRAMES = ['16:9', '4:5', '1:1', '9:16', '3:2', 'auto'];
export const MOCKUP_ANIMATIONS = ['none', 'turntable', 'sway', 'float', 'orbit', 'push', 'reveal'];
export const MOCKUP_LIGHTS = ['studio', 'product', 'daylight', 'golden', 'overcast', 'office', 'neon', 'hdri'];
export const MOCKUP_2D = ['browser', 'ig-post', 'ig-story', 'ig-profile', 'x-post', 'x-profile', 'app-icon', 'avatars', 'yt-channel', 'li-page'];
const MOCKUP_BG = ['transparent', 'color', 'gradient', 'environment'];
const SHADOWS = ['contact', 'sun', 'both', 'none'];
const KEY_NAME = /^[a-zA-Z][\w-]{0,30}$/;
// Keyframes: [{ t (s), v }] sorted by time.
const keyList = (list, min, max) => (Array.isArray(list) ? list : [])
  .filter((k) => k && Number.isFinite(Number(k.t)) && Number.isFinite(Number(k.v)))
  .slice(0, 200)
  .map((k) => ({ t: num(k.t, 0, 600, 0), v: num(k.v, min, max, 0) }))
  .sort((a, b) => a.t - b.t);
const MAX_MOCKUP_ITEMS = 8;
const HEX6 = /^#[0-9a-f]{6}$/i;
const vec3 = (v, fallback) => (Array.isArray(v) && v.length === 3 && v.every((x) => Number.isFinite(Number(x)))
  ? v.map((x) => Math.max(-1e4, Math.min(1e4, Number(x)))) : fallback);
const mockupFile = (v) => (typeof v === 'string' && /^[\w.-]+$/.test(v) ? v : null);
const mockupContent = (c) => (c && mockupFile(c.file)
  ? { file: c.file, kind: c.kind === 'video' ? 'video' : 'image', name: str(c.name, 200) } : null);
const DEVICE_FIELDS = ['device', 'modelId', 'color', 'landscape', 'lying', 'lid', 'url', 'fit', 'content', 'adjust'];

const mapOf = (o, pick) => Object.fromEntries(Object.entries(o && typeof o === 'object' && !Array.isArray(o) ? o : {})
  .filter(([k]) => KEY_NAME.test(k)).slice(0, 80).map(([k, v]) => [k, pick(v)]).filter(([, v]) => v !== undefined));
// A picture with its own fit / size / position (a 2D slot, an object's printed face).
const placedContent = (v) => {
  const c = mockupContent(v);
  if (!c) return undefined;
  const adj = v.adjust && typeof v.adjust === 'object' ? v.adjust : {};
  return { ...c, fit: v.fit === 'contain' ? 'contain' : 'cover', adjust: { scale: num(adj.scale, 0.05, 8, 1), x: num(adj.x, -3, 3, 0), y: num(adj.y, -3, 3, 0) } };
};
// A branding object (device 'object'): business card, poster, box or mug and how it's made.
export function normalizeObject(o) {
  if (!o || typeof o !== 'object') return null;
  const pick = (v, list, d) => (list.includes(v) ? v : d);
  return {
    type: pick(o.type, MOCKUP_OBJECTS, 'card'),
    size: str(o.size, 20),                  // card: eu | us | square; poster: a4 … a1, 50x70, 18x24, 24x36
    landscape: !!o.landscape,
    color: HEX6.test(o.color || '') ? o.color : '#F4F2EE',   // paper / card / mug
    color2: HEX6.test(o.color2 || '') ? o.color2 : '#E9E7E2', // poster wall / mug inside
    finish: pick(o.finish, ['matte', 'silk', 'gloss'], 'matte'),
    radius: num(o.radius, 0, 10, 0),        // card corners (mm)
    layout: pick(o.layout, ['single', 'pair', 'stack'], 'pair'),
    frame: pick(o.frame, ['none', 'black', 'white', 'oak', 'alu'], 'black'),
    mat: o.mat !== false,                   // poster passe-partout
    placement: pick(o.placement, ['wall', 'lean', 'free'], 'wall'),
    w: num(o.w, 1, 200, 12), h: num(o.h, 1, 200, 18), d: num(o.d, 0.5, 200, 5), // box (cm)
    material: pick(o.material, ['white', 'kraft', 'black'], 'white'),
    wrap: pick(o.wrap, ['front', 'full'], 'front'), // mug print
  };
}

// One device in a scene: what it is, how it looks, what's on its screen (and
// how the picture sits in it), where it stands on the floor.
export function normalizeMockupItem(it, i = 0) {
  const adj = it?.adjust && typeof it.adjust === 'object' ? it.adjust : {};
  return {
    id: str(it?.id, 40) || `d${i + 1}`,
    device: MOCKUP_DEVICES.includes(it?.device) ? it.device : 'iphone',
    modelId: it?.modelId ? str(it.modelId, 40) : null,
    color: str(it?.color, 40),
    landscape: !!it?.landscape,
    lying: !!it?.lying, // phone / tablet lying flat, screen up
    lid: num(it?.lid, 0, 180, 112),
    url: str(it?.url, 200),
    fit: it?.fit === 'contain' ? 'contain' : 'cover',
    content: mockupContent(it?.content),
    // The picture's size (1 = filling / fitting the screen) and where its
    // centre sits, in screen widths / heights from the middle (x → right, y → down).
    adjust: { scale: num(adj.scale, 0.05, 8, 1), x: num(adj.x, -3, 3, 0), y: num(adj.y, -3, 3, 0) },
    logo: it?.logo !== false,               // imported models: show their logo parts
    hidden: Array.isArray(it?.hidden) ? it.hidden.map((x) => str(x, 200)).filter(Boolean).slice(0, 200) : [],
    size: num(it?.size, 1, 500, 25),        // imported models: longest side in cm
    x: num(it?.x, -1000, 1000, 0),          // position on the floor (cm)
    z: num(it?.z, -1000, 1000, 0),
    rotY: num(it?.rotY, -360, 360, 0),      // turned around its vertical axis (degrees)
    hingeAngle: num(it?.hingeAngle, -360, 360, 0), // imported models: the hinge (e.g. a lid) turned from how the file has it
    keys: { hinge: keyList(it?.keys?.hinge, -360, 360) }, // …and its keyframes on the timeline
    videoStart: num(it?.videoStart, 0, 86400, 0), // a screen video: where in it the animation starts (s)
    sound: !!it?.sound,                     // play / export the screen video's sound
    volume: num(it?.volume, 0, 1, 1),
    obj: it?.device === 'object' ? normalizeObject(it?.obj) || normalizeObject({ type: 'card' }) : null,
    // An object's other printed faces (back, sides, top …); its front is `content`.
    faces: mapOf(it?.faces, placedContent),
  };
}

// A 2D mockup (browser window, social posts / profiles): what it is, its
// texts, numbers and switches, and the pictures in its slots.
export function normalize2D(d) {
  return {
    type: MOCKUP_2D.includes(d?.type) ? d.type : 'browser',
    theme: ['light', 'dark', 'dim'].includes(d?.theme) ? d.theme : 'light',
    text: mapOf(d?.text, (v) => (typeof v === 'string' ? v.slice(0, 4000) : undefined)),
    nums: mapOf(d?.nums, (v) => (Number.isFinite(Number(v)) ? Math.max(-1e12, Math.min(1e12, Number(v))) : undefined)),
    flags: mapOf(d?.flags, (v) => (typeof v === 'boolean' ? v : undefined)),
    slots: mapOf(d?.slots, placedContent),
    padding: num(d?.padding, 0, 0.45, 0.08), // space around the mockup (share of the picture's short side)
    shadow: d?.shadow !== false,
    scale: num(d?.scale, 0.2, 2, 1),
  };
}

export function normalizeMockup(m) {
  const cam = m?.camera && typeof m.camera === 'object' ? m.camera : null;
  const bg = m?.background && typeof m.background === 'object' ? m.background : {};
  const anim = m?.animation && typeof m.animation === 'object' ? m.animation : {};
  // Scenes from before several devices were possible keep their one device in
  // the top-level fields — read as the scene's only device.
  const rawItems = Array.isArray(m?.items) && m.items.length ? m.items : [{ ...m, id: 'd1' }];
  const items = rawItems.slice(0, MAX_MOCKUP_ITEMS).map(normalizeMockupItem);
  const seen = new Set();
  for (const [i, it] of items.entries()) { if (seen.has(it.id)) it.id = `d${i + 1}-${nanoid(4)}`; seen.add(it.id); }
  const main = items[0];
  const light = m?.light && typeof m.light === 'object' ? m.light : {};
  const cameraKeys = (Array.isArray(anim.camera) ? anim.camera : []).slice(0, 100)
    .filter((k) => k && Number.isFinite(Number(k.t)) && vec3(k.position, null))
    .map((k) => ({ t: num(k.t, 0, 600, 0), position: vec3(k.position, null), target: vec3(k.target, [0, 0, 0]), fov: num(k.fov, 10, 90, 30) }))
    .sort((a, b) => a.t - b.t);
  return {
    id: str(m?.id, 40) || nanoid(10),
    name: str(m?.name, 120) || 'Untitled mockup',
    kind: m?.kind === '2d' ? '2d' : '3d',
    items,
    // The first device, mirrored at the top for simple readers (lists, older code).
    ...Object.fromEntries(DEVICE_FIELDS.map((k) => [k, main[k]])),
    camera: cam ? { preset: str(cam.preset, 40), position: vec3(cam.position, null), target: vec3(cam.target, [0, 0, 0]), fov: num(cam.fov, 10, 90, 30) } : null,
    frame: MOCKUP_FRAMES.includes(m?.frame) ? m.frame : '16:9',
    background: {
      mode: MOCKUP_BG.includes(bg.mode) ? bg.mode : 'gradient',
      color: HEX6.test(bg.color || '') ? bg.color : '#16161A',
      color2: HEX6.test(bg.color2 || '') ? bg.color2 : '#2A2A33',
    },
    shadow: m?.shadow !== false,
    light: {
      setup: MOCKUP_LIGHTS.includes(light.setup) ? light.setup : 'studio',
      rotation: num(light.rotation, -360, 360, 0),
      exposure: num(light.exposure, 0.2, 3, 1),
      shadow: SHADOWS.includes(light.shadow) ? light.shadow : (m?.shadow === false ? 'none' : 'contact'),
      strength: num(light.strength, 0, 1, 0.6),
      hdri: str(light.hdri, 40),         // your own HDRI (setup 'hdri')
      blur: num(light.blur, 0, 1, 0.35), // how soft the Room background is
    },
    animation: {
      preset: MOCKUP_ANIMATIONS.includes(anim.preset) ? anim.preset : 'none',
      duration: num(anim.duration, 1, 60, 6),
      easing: anim.easing === 'linear' ? 'linear' : 'ease',
      camera: cameraKeys, // camera keyframes on the timeline
    },
    d2: m?.kind === '2d' || m?.d2 ? normalize2D(m?.d2) : null,
    thumb: mockupFile(m?.thumb),
    createdAt: num(m?.createdAt, 0, 1e14, 0),
    updatedAt: num(m?.updatedAt, 0, 1e14, 0),
  };
}
export function normalizeMockupModel(m) {
  return {
    id: str(m?.id, 40) || nanoid(10),
    name: str(m?.name, 120) || '3D model',
    file: mockupFile(m?.file),
    format: ['glb', 'gltf', 'usdz'].includes(m?.format) ? m.format : 'glb',
    size: num(m?.size, 0, 1e13, 0),
    screenMesh: str(m?.screenMesh, 200),
    screenTurn: [0, 90, 180, 270].includes(Number(m?.screenTurn)) ? Number(m.screenTurn) : 0,
    screenFlip: !!m?.screenFlip,
    // The part that opens / closes (a lid's hinge): a node of the model, the
    // axis it turns around (in its own space) and which way is "open".
    // null = not looked at yet (a likely hinge is picked for you), false = none.
    hinge: m?.hinge === false ? false
      : m?.hinge?.node ? { node: str(m.hinge.node, 200), axis: ['x', 'y', 'z'].includes(m.hinge.axis) ? m.hinge.axis : 'x', invert: !!m.hinge.invert } : null,
    createdAt: num(m?.createdAt, 0, 1e14, 0),
  };
}

/** One of your own HDRIs: an .hdr / .exr or a panorama picture, with a small preview. */
export function normalizeMockupHdri(h) {
  return {
    id: str(h?.id, 40) || nanoid(10),
    name: str(h?.name, 120) || 'HDRI',
    file: mockupFile(h?.file),
    format: ['hdr', 'exr', 'jpg', 'png', 'webp', 'avif'].includes(h?.format) ? h.format : 'hdr',
    size: num(h?.size, 0, 1e13, 0),
    thumb: h?.thumb ? mockupFile(h.thumb) : null,
    createdAt: num(h?.createdAt, 0, 1e14, 0),
  };
}

// ---------------------------------------------------------------------------
// Whole database
// ---------------------------------------------------------------------------
// Read-time normalization: fills in fields newer code expects without changing
// what anything means. Runs on every read, so a v1 library works unmigrated.
export function normalizeDB(db) {
  if (!Array.isArray(db.projects)) db.projects = [];
  if (!Array.isArray(db.galleries)) db.galleries = [];
  if (!Array.isArray(db.plans)) db.plans = [];
  if (!Array.isArray(db.software)) db.software = [];
  if (!Array.isArray(db.trash)) db.trash = [];
  if (!Array.isArray(db.planTemplates)) db.planTemplates = [];
  if (!Array.isArray(db.inbox)) db.inbox = [];
  if (!Array.isArray(db.mockups)) db.mockups = [];
  if (!Array.isArray(db.mockupModels)) db.mockupModels = [];
  if (!Array.isArray(db.mockupHdris)) db.mockupHdris = [];
  for (const plan of db.plans) normalizePlan(plan);
  for (const s of db.software) normalizeSoftware(s);
  for (const p of db.projects) {
    if (p?.type === 'motion' && Array.isArray(p.segments) && p.segments.some((x) => x && !('kind' in x))) {
      p.segments = normalizeSegments(p.segments);
    }
  }
  if (!db.settings || typeof db.settings !== 'object') db.settings = {};
  if (db.settings.storageLimitBytes == null) db.settings.storageLimitBytes = DEFAULT_STORAGE_LIMIT;
  if (!('dashboardBanner' in db.settings)) db.settings.dashboardBanner = null;
  if (!('dashboardBannerGradient' in db.settings)) db.settings.dashboardBannerGradient = null;
  return db;
}

// What a migration would change, computed from the RAW (unnormalized) db.
export function migrationReport(raw) {
  const projects = Array.isArray(raw?.projects) ? raw.projects : [];
  const plans = Array.isArray(raw?.plans) ? raw.plans : [];
  const software = Array.isArray(raw?.software) ? raw.software : [];
  const from = schemaVersionOf(raw);
  const changes = [
    { key: 'plans', label: 'Plans in an older format (moodboard / info / to-do fields → blocks)', count: plans.filter(isLegacyPlan).length },
    { key: 'software', label: 'Software entries in an older format (scripts / flat expressions)', count: software.filter(isLegacySoftware).length },
    { key: 'logos', label: 'Logos in an older format (light/dark variants or hex colour lists → colour pairs)', count: projects.filter(logoNeedsMigration).length },
    { key: 'ids', label: 'Records missing an id (colours, frames, blocks…)', count: countMissingIds(raw) },
  ].filter((c) => c.count > 0);
  return { from, to: SCHEMA_VERSION, needed: from < SCHEMA_VERSION, changes };
}

function countMissingIds(raw) {
  let n = 0;
  for (const p of (Array.isArray(raw?.projects) ? raw.projects : [])) {
    for (const c of (Array.isArray(p.colors) ? p.colors : [])) if (!c?.id) n += 1;
    for (const f of (Array.isArray(p.frames) ? p.frames : [])) if (!f?.id) n += 1;
    for (const a of (Array.isArray(p.assets) ? p.assets : [])) if (!a?.id) n += 1;
  }
  for (const pl of (Array.isArray(raw?.plans) ? raw.plans : [])) {
    for (const b of (Array.isArray(pl.blocks) ? pl.blocks : [])) if (!b?.id) n += 1;
  }
  return n;
}

/**
 * Rewrite a (normalized) db into the current shape, in place. Non-destructive:
 * nothing is removed that anything still reads, and every file reference is
 * kept — legacy logo fields (logoLight / logoDark / assets) stay alongside the
 * new `image` so the files they point at remain part of the library.
 */
export function migrateDB(db) {
  normalizeDB(db); // plans + software → current shape (now persisted)
  for (const p of db.projects) {
    if (!p || typeof p !== 'object') continue;
    if (!Array.isArray(p.tags)) p.tags = [];
    for (const k of ['title', 'year', 'category', 'notes']) if (typeof p[k] !== 'string') p[k] = p[k] == null ? '' : String(p[k]);
    if (Array.isArray(p.colors)) p.colors = p.colors.map((c) => (c && !c.id ? { id: nanoid(6), ...c } : c));
    if (Array.isArray(p.assets)) p.assets = p.assets.map((a) => (a && !a.id ? { id: nanoid(6), ...a } : a));
    if (p.type === 'motion') {
      if (!Array.isArray(p.frames)) p.frames = [];
      p.frames = p.frames.map((f) => (f && !f.id ? { id: nanoid(8), ...f } : f));
    }
    if (p.type === 'logo' && logoNeedsMigration(p)) {
      const renditions = logoRenditionList(p);
      const rendition = logoActive(p);
      const image = logoSource(p);
      if (image && !p.image) p.image = image;
      p.renditions = renditions;
      p.rendition = rendition;
      if (typeof p.scale !== 'number') p.scale = 0.7;
      if (!p.thumb && p.image) p.thumb = p.image;
    }
  }
  if (db.board) db.board = normalizeBoard(db.board);
  db.schemaVersion = SCHEMA_VERSION;
  db.migratedAt = Date.now();
  return db;
}
