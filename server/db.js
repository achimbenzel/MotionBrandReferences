/**
 * db.json persistence: crash-safe atomic writes, self-healing reads, rotating
 * snapshots and a serialized write queue.
 */
import fsp from 'node:fs/promises';
import path from 'node:path';
import { nanoid } from 'nanoid';
import { DATA_DIR, DB_PATH, DB_BAK, BACKUP_DIR, MAX_SNAPSHOTS, SNAPSHOT_INTERVAL_MS } from './config.js';
import { invalidateStorage, safeRm } from './files.js';
import { normalizeDB, emptyDB } from './schema.js';

export class DBUnavailableError extends Error {
  constructor(cause) {
    super('The library database (data/db.json) could not be read. Nothing was changed — '
      + 'check the file, or restore one from data/backups/.');
    this.status = 503;
    this.code = 'db_unavailable';
    this.cause = cause;
  }
}

async function parseDBFile(p) {
  const db = JSON.parse(await fsp.readFile(p, 'utf8'));
  if (!db || typeof db !== 'object' || Array.isArray(db)) throw new Error(`${path.basename(p)} is not a library database`);
  return db;
}

async function newestSnapshot() {
  const snaps = (await fsp.readdir(BACKUP_DIR).catch(() => []))
    .filter((f) => /^db-.*\.json$/.test(f)).sort();
  return snaps.length ? path.join(BACKUP_DIR, snaps[snaps.length - 1]) : null;
}

/**
 * Load the raw database, tolerating a missing or corrupt db.json by falling
 * back to the .bak mirror and then the newest snapshot; a fallback is written
 * back so the app self-heals. Returns null only when there is genuinely no
 * database yet. If files exist but none can be read (corrupt, or a transient
 * error such as too many open files) it throws instead — starting from an
 * empty library here would overwrite the real one on the next save.
 */
export async function loadRawDB() {
  const candidates = [DB_PATH, DB_BAK];
  const snap = await newestSnapshot();
  if (snap) candidates.push(snap);

  let unreadable = null;
  for (const p of candidates) {
    try {
      const db = await parseDBFile(p);
      if (p !== DB_PATH) {
        console.warn(`  db.json unreadable — recovered from ${path.basename(p)}`);
        await writeDBAtomic(db).catch(() => {});
      }
      return db;
    } catch (err) {
      if (err.code !== 'ENOENT') unreadable = unreadable || err;
    }
  }
  if (unreadable) throw new DBUnavailableError(unreadable);
  return null;
}

// The database with every record brought to the shape the code expects.
export async function readDB() {
  return normalizeDB((await loadRawDB()) || emptyDB());
}

// Write db.json atomically: temp file → fsync → rename over the target (atomic
// on the same filesystem), so a crash mid-write can never leave a truncated
// db.json. Mirror the last good version to .bak and keep rotating snapshots.
let lastSnapshotAt = 0;
export async function writeDBAtomic(db) {
  const json = JSON.stringify(db, null, 2);
  const tmp = path.join(DATA_DIR, `.db-${nanoid(8)}.tmp`);
  try {
    const fh = await fsp.open(tmp, 'w');
    try { await fh.writeFile(json); await fh.sync(); } finally { await fh.close(); }
    await fsp.rename(tmp, DB_PATH);                   // atomic replace
  } catch (err) {
    await fsp.rm(tmp, { force: true }).catch(() => {});
    throw err;
  }
  await fsp.writeFile(DB_BAK, json).catch(() => {}); // mirror the last good version
  await snapshotDB(json).catch(() => {});
  invalidateStorage();
}

// Keep the newest MAX_SNAPSHOTS versions under data/backups/, throttled so a
// burst of autosaves doesn't churn the disk while snapshots still span time.
async function snapshotDB(json) {
  const now = Date.now();
  if (now - lastSnapshotAt < SNAPSHOT_INTERVAL_MS) return;
  lastSnapshotAt = now;
  await fsp.mkdir(BACKUP_DIR, { recursive: true });
  const stamp = new Date(now).toISOString().replace(/[:.]/g, '-');
  await fsp.writeFile(path.join(BACKUP_DIR, `db-${stamp}.json`), json);
  const files = (await fsp.readdir(BACKUP_DIR).catch(() => []))
    .filter((f) => /^db-.*\.json$/.test(f)).sort();
  for (const f of files.slice(0, Math.max(0, files.length - MAX_SNAPSHOTS))) {
    await safeRm(path.join(BACKUP_DIR, f), { force: true }).catch(() => {});
  }
}

// ---- Serialized writes --------------------------------------------------------
let writeChain = Promise.resolve();

// Run `fn` exclusively: after every earlier queued write has settled (resolved
// OR rejected, so one failure can't block the writes after it) and before any
// later one starts.
export function withWriteLock(fn) {
  const result = writeChain.then(fn, fn);
  writeChain = result.catch(() => {}); // keep the internal chain always-resolved
  return result;                       // callers still see this write's real outcome
}

// Read → mutate → write, serialized. The mutator's return value is passed on.
export function mutateDB(mutator) {
  return withWriteLock(async () => {
    const db = await readDB();
    const result = await mutator(db);
    await writeDBAtomic(db);
    return result;
  });
}

// Wait until the queue is empty (used on shutdown).
export async function drainWrites() {
  let prev;
  do { prev = writeChain; await prev.catch(() => {}); } while (writeChain !== prev);
}
