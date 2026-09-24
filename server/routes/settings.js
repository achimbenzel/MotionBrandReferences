// Storage usage + editable limit, and app settings (dashboard banner, …).
import path from 'node:path';
import { DATA_DIR } from '../config.js';
import { readDB, mutateDB } from '../db.js';
import { getUsedBytes, replaceImage, safeRm } from '../files.js';
import { upload } from '../upload.js';
import { str } from '../schema.js';
import { createRouter } from '../http.js';

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
    return db.settings;
  });
  res.json({ settings });
});
router.post('/api/settings/dashboard-banner', upload.single('banner'), async (req, res) => {
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
