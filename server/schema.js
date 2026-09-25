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
  schemaVersion: SCHEMA_VERSION, projects: [], galleries: [], plans: [], planTemplates: [], software: [], trash: [],
  settings: { storageLimitBytes: DEFAULT_STORAGE_LIMIT },
});

// ---------------------------------------------------------------------------
// Plans
// ---------------------------------------------------------------------------
export const BLOCK_TYPES = new Set(['moodboard', 'text', 'todos', 'files', 'pdf', 'links', 'refs', 'palette', 'heading', 'divider', 'table', 'briefing', 'storyboard', 'script']);
export const BLOCK_TITLES = {
  moodboard: 'Moodboard', text: 'Text', todos: 'To-dos', files: 'Files', pdf: 'PDF', links: 'Links',
  refs: 'References', palette: 'Palette', heading: 'Heading', divider: 'Divider', table: 'Table',
  briefing: 'Briefing', storyboard: 'Storyboard', script: 'Script',
};

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
export const normalizeShot = (s, blockId) => ({
  id: s?.id ? str(s.id, 40) : nanoid(6),
  image: blockFile(blockId, s?.image),
  duration: num(s?.duration, 0.1, 600, 2),
  visual: str(s?.visual, 4000),
  vo: str(s?.vo, 4000),
  notes: str(s?.notes, 4000),
});
export const normalizeAudio = (a, blockId) => {
  const file = blockFile(blockId, a?.file);
  return file ? { file, name: str(a?.name, 200), size: Number.isFinite(a?.size) ? a.size : 0 } : null;
};
export const normalizeLine = (l) => ({ id: l?.id ? str(l.id, 40) : nanoid(6), visual: str(l?.visual, 4000), vo: str(l?.vo, 4000) });
export const normalizeTarget = (v) => num(v, 1, 3600, null); // seconds, or null = none / from the briefing
export const normalizePace = (v) => num(v, 0.5, 6, 2.5);     // words per second

// `fallbackId` keeps ids stable across reads for records that never had one,
// so the client can address a block it was just sent.
export function normalizeBlock(b, fallbackId) {
  if (!b || typeof b !== 'object') return null;
  if (!BLOCK_TYPES.has(b.type)) return null;
  if (!b.id) b.id = fallbackId || nanoid(8);
  if (typeof b.title !== 'string') b.title = BLOCK_TITLES[b.type];
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
