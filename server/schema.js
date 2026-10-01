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
import { DEFAULT_STORAGE_LIMIT } from './config.js';
import { nanoid } from 'nanoid';
import { isLegacyPlan, normalizePlan, normalizeStoryboardTemplate } from './schema/plans.js';
import { normalizeTimeTracker } from './schema/time.js';
import { linkClients, normalizeClient } from './schema/clients.js';
import { normalizeNote } from './schema/notes.js';
import { normalizeContent, normalizeContentPillars, normalizeContentProfile, normalizeContentRhythm, normalizeContentSnippet } from './schema/content.js';
import { normalizeExpense, normalizeFinance, normalizeIncome } from './schema/expenses.js';
import { normalizeAchievement, normalizeAchievementStats } from './schema/achievements.js';
import { isLegacySoftware, normalizeSoftware } from './schema/software.js';
import { logoActive, logoNeedsMigration, logoRenditionList, logoSource, normalizeSegments } from './schema/references.js';
import { CURRENCIES } from './schema/base.js';
import { normalizeDashboardFocus, normalizeDashboardLayout, normalizeImageUploads, normalizeWeeklyTodos, normalizeFormats } from './schema/settings.js';
import { normalizeBoard } from './schema/board.js';

// Each area's record shapes live in schema/ — all of them are exported from here too.
export * from './schema/base.js';
export * from './schema/plans.js';
export * from './schema/references.js';
export * from './schema/board.js';
export * from './schema/software.js';
export * from './schema/mockups.js';
export * from './schema/settings.js';
export * from './schema/expenses.js';
export * from './schema/content.js';
export * from './schema/time.js';
export * from './schema/clients.js';
export * from './schema/notes.js';
export * from './schema/achievements.js';

export const SCHEMA_VERSION = 2;
export const schemaVersionOf = (db) => (Number.isInteger(db?.schemaVersion) ? db.schemaVersion : 1);
export const emptyDB = () => ({
  schemaVersion: SCHEMA_VERSION, projects: [], galleries: [], plans: [], planTemplates: [], software: [], trash: [], inbox: [], mockups: [], mockupModels: [], mockupHdris: [], timeEntries: [], clients: [], notes: [],
  content: [], achievements: [], storyboardTemplates: [],
  settings: { storageLimitBytes: DEFAULT_STORAGE_LIMIT },
});
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
  db.storyboardTemplates = (Array.isArray(db.storyboardTemplates) ? db.storyboardTemplates : []).filter((t) => t && typeof t === 'object').map(normalizeStoryboardTemplate);
  if (!Array.isArray(db.inbox)) db.inbox = [];
  if (!Array.isArray(db.mockups)) db.mockups = [];
  if (!Array.isArray(db.mockupModels)) db.mockupModels = [];
  if (!Array.isArray(db.mockupHdris)) db.mockupHdris = [];
  if (!Array.isArray(db.timeEntries)) db.timeEntries = [];           // the time tracker's entries
  db.timeTracker = normalizeTimeTracker(db.timeTracker);              // …and what's running now
  if (!Array.isArray(db.clients)) db.clients = [];                    // who projects are for
  db.clients = db.clients.filter((c) => c && typeof c === 'object').map(normalizeClient);
  if (!Array.isArray(db.notes)) db.notes = [];                        // general notes (with pictures)
  db.notes = db.notes.filter((n) => n && typeof n === 'object').map(normalizeNote);
  if (!Array.isArray(db.content)) db.content = [];                    // social media posts being planned
  db.content = db.content.filter((c) => c && typeof c === 'object').map(normalizeContent);
  if (!Array.isArray(db.expenses)) db.expenses = [];                  // what the business costs
  db.expenses = db.expenses.filter((e) => e && typeof e === 'object').map(normalizeExpense);
  if (!Array.isArray(db.income)) db.income = [];                      // money that comes in regularly (retainers …)
  db.income = db.income.filter((x) => x && typeof x === 'object').map(normalizeIncome);
  if (!Array.isArray(db.contentLibrary)) db.contentLibrary = [];      // saved hooks, hashtag sets, calls to action
  db.contentLibrary = db.contentLibrary.filter((x) => x && typeof x === 'object').map(normalizeContentSnippet).filter((x) => x.text.trim());
  if (!Array.isArray(db.achievements)) db.achievements = [];          // milestones (gamified)
  db.achievements = db.achievements.filter((a) => a && typeof a === 'object').map(normalizeAchievement);
  db.achievementStats = normalizeAchievementStats(db.achievementStats);
  for (const plan of db.plans) normalizePlan(plan);
  linkClients(db);
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
  if (typeof db.settings.dashboardNote !== 'string') db.settings.dashboardNote = ''; // the dashboard's quick note
  if (!CURRENCIES.has(db.settings.currency)) db.settings.currency = 'EUR';             // hourly rates, invoices
  db.settings.dashboardFocus = normalizeDashboardFocus(db.settings.dashboardFocus);
  db.settings.weeklyTodos = normalizeWeeklyTodos(db.settings.weeklyTodos);
  db.settings.imageUploads = normalizeImageUploads(db.settings.imageUploads);
  db.settings.contentProfile = normalizeContentProfile(db.settings.contentProfile);
  db.settings.contentPillars = normalizeContentPillars(db.settings.contentPillars);
  db.settings.finance = normalizeFinance(db.settings.finance);
  db.settings.contentRhythm = normalizeContentRhythm(db.settings.contentRhythm);
  db.settings.dashboardLayout = normalizeDashboardLayout(db.settings.dashboardLayout);
  db.settings.formats = normalizeFormats(db.settings.formats); // how dates and numbers are shown
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
