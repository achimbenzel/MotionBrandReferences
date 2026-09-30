// Library maintenance (Settings → Library): the one-time data-format
// migration and the "unused files" cleanup.
import fsp from 'node:fs/promises';
import path from 'node:path';
import { nanoid } from 'nanoid';
import { DATA_DIR, DB_PATH, BACKUP_DIR, TRASH_DIR } from '../config.js';
import { loadRawDB, readDB, mutateDB, withWriteLock, writeDBAtomic } from '../db.js';
import { relPairs, pruneEmptyDirs, sniffImageExt, extOf } from '../files.js';
import { trashFiles } from '../trashMoves.js';
import { upload } from '../upload.js';
import { scanPictures, ownerOf, names, renameRefs, smallerName, RASTER, PICTURE_AREAS } from '../pictures.js';
import { SCHEMA_VERSION, migrationReport, migrateDB, emptyDB } from '../schema.js';
import { scanUnused } from '../unused.js';
import { createRouter, HttpError } from '../http.js';

const SAFE_REL = /^[\w.-]+(\/[\w.-]+)+$/;

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
  await trashFiles(trashId, relPairs(DATA_DIR, path.join(TRASH_DIR, trashId), rels));
  for (const rel of rels) {
    const root = rel.split('/')[0];
    await pruneEmptyDirs(path.dirname(path.join(DATA_DIR, rel)), path.join(DATA_DIR, root));
  }
  res.json({ count, bytes, trashId });
});

// ---- Stored pictures, made smaller afterwards -------------------------------------
// The big ones (at least `min` KB) that a record uses, by area.
router.get('/api/maintenance/pictures', async (req, res) => {
  const min = Math.max(50, Math.min(20000, Number(req.query.min) || 500));
  const items = await scanPictures(await readDB(), min * 1024);
  res.json({ ...summarize(items), items, areas: PICTURE_AREAS.map(({ key, label }) => ({ key, label })) });
});

// One picture swapped for its smaller version (made in the browser): the new
// file next to it under a new name, the record's names for it rewritten, the
// original into the Trash item `batch` (one item for the whole run, restorable).
router.post('/api/maintenance/pictures/replace', upload.single('file'), async (req, res) => {
  const rel = String(req.body?.rel || '');
  const batch = String(req.body?.batch || '');
  const f = req.file;
  if (!SAFE_REL.test(rel) || rel.includes('..') || !RASTER.test(rel)) throw new HttpError(400, 'bad_path', 'That is not a stored picture.');
  if (!/^[\w-]{6,40}$/.test(batch)) throw new HttpError(400, 'bad_batch', 'A batch id is needed.');
  if (!f) throw new HttpError(400, 'file_required', 'The smaller picture is missing.');
  const abs = path.join(DATA_DIR, rel);
  if (!abs.startsWith(path.resolve(DATA_DIR) + path.sep)) throw new HttpError(400, 'bad_path', 'That is not a stored picture.');
  const before = (await fsp.stat(abs).catch(() => null))?.size;
  if (!before) throw new HttpError(404, 'not_found', 'That picture is no longer there.');
  const ext = (await sniffImageExt(f.path)) || '';
  if (!['.jpg', '.webp', '.png'].includes(ext) || !['.jpg', '.jpeg', '.webp', '.png'].includes(extOf(f.originalname) || ext)) throw new HttpError(400, 'not_a_picture', 'Only JPEG, WebP or PNG.');
  if (f.size >= before) throw new HttpError(400, 'not_smaller', 'The new picture isn’t smaller.');
  const db0 = await readDB();
  const own = ownerOf(db0, rel);
  if (!own || !names(own.record, own.inner)) throw new HttpError(409, 'not_used', 'Nothing uses that picture any more.');

  const next = smallerName(rel, ext);
  const trashFile = path.join(TRASH_DIR, batch, rel);
  await fsp.mkdir(path.dirname(trashFile), { recursive: true });
  await fsp.copyFile(f.path, path.join(DATA_DIR, next));
  await fsp.rename(abs, trashFile).catch(async () => { await fsp.copyFile(abs, trashFile); await fsp.rm(abs, { force: true }); });
  try {
    await mutateDB((db) => {
      renameRefs(db, rel, next);
      let entry = db.trash.find((t) => t.trashId === batch);
      if (!entry) {
        entry = { trashId: batch, kind: 'pictures', deletedAt: Date.now(), data: { items: [], before: 0, after: 0 } };
        db.trash.unshift(entry);
      }
      entry.data.items.push({ rel, next, before, after: f.size });
      entry.data.before += before;
      entry.data.after += f.size;
    });
  } catch (e) { // put it back as it was
    await fsp.rename(trashFile, abs).catch(() => {});
    await fsp.rm(path.join(DATA_DIR, next), { force: true }).catch(() => {});
    throw e;
  }
  res.json({ rel: next, before, after: f.size });
});
