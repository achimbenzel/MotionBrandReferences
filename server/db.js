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
import { checkConflict, recordChange } from './live.js';

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

// ---- The database in memory -----------------------------------------------------
// Reading db.json, parsing and normalizing it on every request costs tens of
// milliseconds once the library grows — and the dashboard asks for ~10 things
// at once. So the normalized database is kept in memory as a (compact) JSON
// string, and every reader gets its own parsed copy: nobody can change what
// another request sees, just like reading the file. A write replaces it (it's
// normalized again on the next read, as a read from the file would be); a
// db.json changed from outside — an import, a restored backup, an edit by
// hand — is noticed by its file stats and read again.
let cache = null;   // { key, json } — normalized
let written = null; // { key, json } — what we last wrote, not normalized yet
let loading = null; // the read in flight, shared by everyone asking meanwhile

async function fileKey() {
  try { const st = await fsp.stat(DB_PATH); return `${st.ino}:${st.size}:${st.mtimeMs}`; } catch { return null; }
}

// The database with every record brought to the shape the code expects.
export async function readDB() {
  const key = await fileKey();
  if (key && cache?.key === key) return JSON.parse(cache.json);
  if (key && written?.key === key) {
    const db = normalizeDB(JSON.parse(written.json));
    cache = { key, json: JSON.stringify(db) };
    written = null;
    return db;
  }
  if (!loading) {
    loading = (async () => {
      const before = await fileKey();
      const raw = await loadRawDB();
      const db = normalizeDB(raw || emptyDB());
      const json = JSON.stringify(db);
      const after = await fileKey();
      if (raw && before && before === after) cache = { key: after, json }; // the file didn't change while it was read
      return json;
    })().finally(() => { loading = null; });
  }
  return JSON.parse(await loading);
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
  cache = null; written = { key: await fileKey(), json }; // what the next read starts from
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
// An edit based on something another device has changed since is refused
// (409) before anything happens; every saved change is announced (live.js).
export function mutateDB(mutator) {
  return withWriteLock(async () => {
    checkConflict();
    const db = await readDB();
    const result = await mutator(db);
    await writeDBAtomic(db);
    recordChange();
    return result;
  });
}

// Wait until the queue is empty (used on shutdown).
export async function drainWrites() {
  let prev;
  do { prev = writeChain; await prev.catch(() => {}); } while (writeChain !== prev);
}
