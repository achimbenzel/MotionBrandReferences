// Export / import the whole library as a single .zip (STORE + ZIP64).
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { DATA_DIR, BACKUP_DIR, TRASH_DIR } from '../config.js';
import { mutateDB, withWriteLock } from '../db.js';
import { folderSize, invalidateStorage, safeRm } from '../files.js';
import { uploadArchive } from '../upload.js';
import { createZipToStream, validateLibraryZip, extractZip } from '../zip.js';
import { createRouter, HttpError } from '../http.js';

const router = createRouter();
export default router;

// Skip working/backup files so the archive holds just the library itself.
const EXPORT_SKIP = (rel) =>
  rel === 'db.json.bak'
  || rel.startsWith('backups/') || rel === 'backups'
  || rel.startsWith('tmp/') || rel === 'tmp'
  || rel.startsWith('trash/') || rel === 'trash'
  || /^\.db-.*\.tmp$/.test(rel);

router.get('/api/export', async (_req, res) => {
  const stamp = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="design-reference-${stamp}.zip"`);
  await createZipToStream(DATA_DIR, res, { skip: EXPORT_SKIP });
  res.end();
});

const GB = 1024 * 1024 * 1024;
async function freeBytes(dir) {
  if (typeof fsp.statfs !== 'function') return Infinity; // Node < 18.15: can't tell
  const s = await fsp.statfs(dir);
  return s.bavail * s.bsize;
}

// Replace the live library with the freshly-extracted staging dir, preserving
// backups/ and tmp/ (which holds the staging dir itself).
async function swapLibrary(stage) {
  const preserve = new Set(['backups', 'tmp']);
  for (const name of await fsp.readdir(DATA_DIR)) {
    if (preserve.has(name)) continue;
    await safeRm(path.join(DATA_DIR, name), { recursive: true, force: true });
  }
  for (const name of await fsp.readdir(stage)) {
    const src = path.join(stage, name);
    if (preserve.has(name)) { await safeRm(src, { recursive: true, force: true }); continue; }
    await fsp.rename(src, path.join(DATA_DIR, name));
  }
  invalidateStorage();
}

router.post('/api/import', uploadArchive.single('archive'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'archive_required' });
  try {
    // 1) Validate the archive completely before touching the current library.
    await validateLibraryZip(req.file.path);
    // 2) Make sure there's room for the safety backup + the extracted copy, so
    //    a full disk can't strand the import halfway.
    const need = await folderSize(DATA_DIR, EXPORT_SKIP) + req.file.size + 64 * 1024 * 1024;
    const free = await freeBytes(DATA_DIR);
    if (free < need) {
      throw new HttpError(507, 'disk_full', `Not enough free disk space for a safe import: about ${(need / GB).toFixed(1)} GB needed, ${(free / GB).toFixed(1)} GB free.`);
    }
    // 3) Auto-backup the current library as a safety net (kept in backups/).
    await fsp.mkdir(BACKUP_DIR, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backup = path.join(BACKUP_DIR, `pre-import-${stamp}.zip`);
    const ws = fs.createWriteStream(backup);
    await createZipToStream(DATA_DIR, ws, { skip: EXPORT_SKIP });
    await new Promise((resolve, reject) => ws.end((err) => (err ? reject(err) : resolve())));
    // 4) Extract into staging (verifies CRCs) — still non-destructive.
    const stage = path.join(req.tmpDir, 'stage');
    await fsp.mkdir(stage, { recursive: true });
    await extractZip(req.file.path, stage);
    // 5) Swap it in while holding the write lock, so no save can interleave.
    await withWriteLock(() => swapLibrary(stage));
    // Exports don't carry trash folders — drop trash entries whose files
    // didn't come along, so "Restore" never brings back a record without files.
    await mutateDB((db) => { db.trash = db.trash.filter((t) => t.kind === 'gallery' || fs.existsSync(path.join(TRASH_DIR, t.trashId))); });
    res.json({ ok: true, backup: path.basename(backup) });
  } catch (err) {
    if (err.status) throw err;
    console.error('import failed', err);
    throw new HttpError(400, 'import_failed', String(err.message || err));
  }
});
