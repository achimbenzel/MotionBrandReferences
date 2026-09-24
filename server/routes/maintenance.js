// Library maintenance (Settings → Library): the one-time data-format
// migration and the "unused files" cleanup.
import fsp from 'node:fs/promises';
import path from 'node:path';
import { nanoid } from 'nanoid';
import { DATA_DIR, DB_PATH, BACKUP_DIR, TRASH_DIR } from '../config.js';
import { loadRawDB, mutateDB, withWriteLock, writeDBAtomic } from '../db.js';
import { moveRelPaths, pruneEmptyDirs } from '../files.js';
import { SCHEMA_VERSION, migrationReport, migrateDB, emptyDB } from '../schema.js';
import { scanUnused } from '../unused.js';
import { createRouter } from '../http.js';

const router = createRouter();
export default router;

const status = (raw) => {
  const report = migrationReport(raw);
  return {
    schemaVersion: report.from,
    currentVersion: SCHEMA_VERSION,
    needsMigration: report.needed || report.changes.length > 0,
    changes: report.changes,
    migratedAt: raw.migratedAt || null,
  };
};

router.get('/api/maintenance', async (_req, res) => {
  res.json(status((await loadRawDB()) || emptyDB()));
});

// Rewrite db.json into the current format. A copy of the current db.json is
// kept as data/backups/pre-migrate-v<from>-<time>.json first; files on disk
// are never touched.
router.post('/api/maintenance/migrate', async (_req, res) => {
  const result = await withWriteLock(async () => {
    const raw = await loadRawDB();
    if (!raw) return { migrated: false };
    const before = status(raw);
    if (!before.needsMigration) return { migrated: false, ...before };
    await fsp.mkdir(BACKUP_DIR, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backup = `pre-migrate-v${before.schemaVersion}-${stamp}.json`;
    await fsp.copyFile(DB_PATH, path.join(BACKUP_DIR, backup));
    const db = migrateDB(raw);
    await writeDBAtomic(db);
    return { migrated: true, backup, changes: before.changes, from: before.schemaVersion };
  });
  const after = status((await loadRawDB()) || emptyDB());
  res.json({ ...result, ...after });
});

const summarize = (files) => ({ count: files.length, bytes: files.reduce((n, f) => n + f.size, 0) });

router.get('/api/maintenance/unused', async (_req, res) => {
  const files = await scanUnused();
  res.json({ ...summarize(files), files: files.slice(0, 500) });
});

// Move unused files into Trash as one restorable "N unused files" item.
// Body: { rels?: string[] } — limit to these (still-unused) files.
router.post('/api/maintenance/unused', async (req, res) => {
  let files = await scanUnused();
  if (Array.isArray(req.body?.rels)) {
    const pick = new Set(req.body.rels.filter((r) => typeof r === 'string'));
    files = files.filter((f) => pick.has(f.rel));
  }
  if (!files.length) return res.json({ count: 0, bytes: 0, trashId: null });
  const trashId = nanoid(10);
  const rels = files.map((f) => f.rel);
  const { count, bytes } = summarize(files);
  await mutateDB((db) => { db.trash.unshift({ trashId, kind: 'orphans', deletedAt: Date.now(), data: { rels, count, bytes } }); });
  await moveRelPaths(DATA_DIR, path.join(TRASH_DIR, trashId), rels);
  for (const rel of rels) {
    const root = rel.split('/')[0];
    await pruneEmptyDirs(path.dirname(path.join(DATA_DIR, rel)), path.join(DATA_DIR, root));
  }
  res.json({ count, bytes, trashId });
});
