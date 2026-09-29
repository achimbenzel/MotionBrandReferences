// Storage usage + editable limit, and app settings (dashboard banner, …).
import path from 'node:path';
import { DATA_DIR } from '../config.js';
import { readDB, mutateDB } from '../db.js';
import { getUsedBytes, replaceImage, safeRm } from '../files.js';
import { upload } from '../upload.js';
import { str, normalizeDashboardFocus, normalizeDashboardLayout, normalizeWeeklyTodos, normalizeImageUploads, CURRENCIES } from '../schema.js';
import { createRouter } from '../http.js';
import { sourceAsUpload } from '../sources.js';
import { activityDays, noteFocus, recentItems } from '../activity.js';

const router = createRouter();
export default router;

router.get('/api/storage', async (_req, res) => {
  const db = await readDB();
  const usedBytes = await getUsedBytes();
  res.json({ usedBytes, limitBytes: db.settings.storageLimitBytes });
});

router.patch('/api/storage', async (req, res) => {
  const limitBytes = Number(req.body.limitBytes);
  if (!Number.isFinite(limitBytes) || limitBytes <= 0) return res.status(400).json({ error: 'invalid_limit' });
  const settings = await mutateDB((db) => { db.settings.storageLimitBytes = Math.round(limitBytes); return db.settings; });
  res.json({ limitBytes: settings.storageLimitBytes });
});

const dashboardDir = () => path.join(DATA_DIR, 'dashboard');

router.get('/api/settings', async (_req, res) => {
  const db = await readDB();
  res.json({ settings: db.settings });
});
router.patch('/api/settings', async (req, res) => {
  const settings = await mutateDB((db) => {
    if ('dashboardBannerGradient' in req.body) db.settings.dashboardBannerGradient = req.body.dashboardBannerGradient == null ? null : str(req.body.dashboardBannerGradient, 40);
    if ('dashboardNote' in req.body) db.settings.dashboardNote = str(req.body.dashboardNote, 8000);
    if ('dashboardFocus' in req.body) db.settings.dashboardFocus = normalizeDashboardFocus(req.body.dashboardFocus);
    if ('dashboardLayout' in req.body) db.settings.dashboardLayout = normalizeDashboardLayout(req.body.dashboardLayout);
    if ('weeklyTodos' in req.body) db.settings.weeklyTodos = normalizeWeeklyTodos(req.body.weeklyTodos);
    if (req.body.imageUploads && typeof req.body.imageUploads === 'object') db.settings.imageUploads = normalizeImageUploads({ ...db.settings.imageUploads, ...req.body.imageUploads });
    if ('currency' in req.body && CURRENCIES.has(req.body.currency)) db.settings.currency = req.body.currency; // rates, invoices
    return db.settings;
  });
  res.json({ settings });
});
// What you changed last (the dashboard's "Continue where you left off").
router.get('/api/recent', async (req, res) => {
  const db = await readDB();
  res.json({ items: await recentItems(db, Math.max(1, Math.min(20, Number(req.query.limit) || 8))) });
});
// A finished focus-timer session: its minutes count on today.
router.post('/api/activity/focus', async (req, res) => {
  const minutes = Math.round(Number(req.body?.minutes));
  if (!(minutes >= 1 && minutes <= 240)) return res.status(400).json({ error: 'invalid_minutes' });
  res.json({ today: await noteFocus(minutes) });
});
// The dashboard's activity map: saves and what was added, per day.
router.get('/api/activity', async (req, res) => {
  const db = await readDB();
  res.json({ days: await activityDays(db, Number(req.query.days) || 182) });
});
router.post('/api/settings/dashboard-banner', upload.single('banner'), async (req, res) => {
  await sourceAsUpload(req); // or a picture that's already in the app
  if (!req.file) return res.status(400).json({ error: 'file_required' });
  const db = await readDB();
  const stored = await replaceImage(dashboardDir(), req.file.path, 'banner', req.file.originalname, db.settings.dashboardBanner, '.png');
  const settings = await mutateDB((d) => { d.settings.dashboardBanner = stored; d.settings.dashboardBannerGradient = null; return d.settings; });
  res.json({ settings });
});
router.delete('/api/settings/dashboard-banner', async (_req, res) => {
  let file = null;
  const settings = await mutateDB((db) => { file = db.settings.dashboardBanner; db.settings.dashboardBanner = null; return db.settings; });
  if (file) await safeRm(path.join(dashboardDir(), path.basename(file)), { force: true }).catch(() => {});
  res.json({ settings });
});
