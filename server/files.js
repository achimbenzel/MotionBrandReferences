/**
 * File-system helpers for the library folder: path containment, moves that
 * survive cross-device renames, single-slot image replacement, the storage
 * usage cache and trash moves.
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { nanoid } from 'nanoid';
import { DATA_DIR, TMP_DIR, BACKUP_DIR, TRASH_DIR, DB_PATH, TYPES } from './config.js';

export const sanitize = (name) => String(name || '').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
export const extOf = (name) => {
  const e = path.extname(String(name || '')).toLowerCase();
  return e && e.length <= 6 ? e : '';
};

// What kind of picture a file is, from its first bytes — for files saved
// without a telling extension (older profile pictures / banners are `.img`).
export async function sniffImageExt(abs) {
  let fh;
  try {
    fh = await fsp.open(abs, 'r');
    const buf = Buffer.alloc(512);
    const { bytesRead } = await fh.read(buf, 0, 512, 0);
    const b = buf.subarray(0, bytesRead);
    if (b[0] === 0x89 && b.toString('latin1', 1, 4) === 'PNG') return '.png';
    if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return '.jpg';
    if (b.toString('latin1', 0, 4) === 'GIF8') return '.gif';
    if (b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP') return '.webp';
    if (b.toString('latin1', 4, 8) === 'ftyp' && /^avi[fs]/.test(b.toString('latin1', 8, 12))) return '.avif';
    if (/<svg[\s>]/i.test(b.toString('utf8'))) return '.svg';
    return '';
  } catch { return ''; } finally { await fh?.close().catch(() => {}); }
}

// Create the folder layout (and an empty db.json on first run), and sweep
// leftovers of an earlier crash.
export function ensureDirs(emptyDB) {
  const typeDirs = [...TYPES].map((t) => path.join(DATA_DIR, t));
  for (const d of [DATA_DIR, TMP_DIR, BACKUP_DIR, TRASH_DIR, path.join(DATA_DIR, 'plan'), ...typeDirs]) {
    fs.mkdirSync(d, { recursive: true });
  }
  if (!fs.existsSync(DB_PATH)) fs.writeFileSync(DB_PATH, JSON.stringify(emptyDB, null, 2));
  // Leftover atomic-write temp files from a previous crash.
  for (const f of fs.readdirSync(DATA_DIR).filter((n) => /^\.db-.*\.tmp$/.test(n))) {
    fs.rmSync(path.join(DATA_DIR, f), { force: true });
  }
  // Leftover upload temp dirs (aborted uploads) — nothing is in flight at
  // startup, so data/tmp/ can be safely emptied.
  for (const f of fs.readdirSync(TMP_DIR)) {
    fs.rmSync(path.join(TMP_DIR, f), { recursive: true, force: true });
  }
}

// ---- Storage usage (cached) -------------------------------------------------
// Recursively sum the size of every file under a directory. `skip(rel)` can
// leave out sub-paths (relative, forward slashes).
export async function folderSize(dir, skip = null, base = dir) {
  let total = 0;
  const entries = await fsp.readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (skip && skip(path.relative(base, p).split(path.sep).join('/'))) continue;
    if (e.isDirectory()) total += await folderSize(p, skip, base);
    else { const st = await fsp.stat(p).catch(() => null); if (st) total += st.size; }
  }
  return total;
}

// folderSize walks the whole tree, so cache the result with a short TTL and
// invalidate it whenever files change. The TTL is a backstop for manual edits.
const STORAGE_TTL_MS = 60 * 1000;
let storageCache = { bytes: null, at: 0 };
export function invalidateStorage() { storageCache = { bytes: null, at: 0 }; }
export async function getUsedBytes() {
  const now = Date.now();
  if (storageCache.bytes != null && now - storageCache.at < STORAGE_TTL_MS) return storageCache.bytes;
  const bytes = await folderSize(DATA_DIR);
  storageCache = { bytes, at: now };
  return bytes;
}

// ---- Safety -------------------------------------------------------------------
// Refuse to rm/rename anything that resolves outside data/, as a defensive
// backstop against traversal via request-derived path segments.
export function assertInside(target) {
  const resolved = path.resolve(target);
  const base = path.resolve(DATA_DIR);
  if (resolved !== base && !resolved.startsWith(base + path.sep)) {
    throw new Error(`refusing to touch a path outside data/: ${target}`);
  }
  return resolved;
}
export function safeRm(target, opts) {
  assertInside(target);
  invalidateStorage();
  return fsp.rm(target, opts);
}

// ---- Locked files (Windows) -----------------------------------------------------
// Windows won't rename a folder while a file in it is open — a video the
// browser is still streaming, a virus scanner or the search indexer reading a
// new file — and says EPERM / EACCES / EBUSY. Such a lock is usually gone in a
// moment, so a rename is tried a few more times before it counts as failed.
export const LOCKED = new Set(['EPERM', 'EACCES', 'EBUSY']);
const wait = (ms) => new Promise((r) => { setTimeout(r, ms); });
// Tests stand in for such a lock: renames of paths containing FS_LOCKED fail
// until a file data/.unlock exists (only with NODE_ENV=test).
const TEST_LOCK = process.env.NODE_ENV === 'test' ? process.env.FS_LOCKED || '' : '';
function rename(from, to) {
  if (TEST_LOCK && from.includes(TEST_LOCK) && !fs.existsSync(path.join(DATA_DIR, '.unlock'))) {
    return Promise.reject(Object.assign(new Error(`EPERM: operation not permitted, rename '${from}'`), { code: 'EPERM' }));
  }
  return fsp.rename(from, to);
}
async function renameRetry(from, to) {
  for (let i = 0; ; i += 1) {
    try { return await rename(from, to); } catch (err) {
      if (!LOCKED.has(err.code) || i >= 5) throw err;
      await wait(40 * 2 ** i); // 40 … 640 ms — about 1.2 s in all
    }
  }
}

// Move a file or folder, falling back to copy + delete when a plain rename
// crosses devices (EXDEV) — or, with `copyIfLocked`, when something still holds
// a file in it (the copy is what counts; the leftovers are removed later).
// Missing sources are ignored when `ignoreMissing`.
export async function moveFile(from, to, { ignoreMissing = false, copyIfLocked = false } = {}) {
  assertInside(from); assertInside(to);
  await fsp.mkdir(path.dirname(to), { recursive: true });
  try {
    await renameRetry(from, to);
  } catch (err) {
    if (err.code === 'EXDEV' || (copyIfLocked && LOCKED.has(err.code))) {
      await fsp.cp(from, to, { recursive: true, force: true });
      await fsp.rm(from, { recursive: true, force: true }).catch((e) => removeLater(from, e));
    } else if (!(ignoreMissing && err.code === 'ENOENT')) {
      throw err;
    }
  }
  invalidateStorage();
}
// What couldn't be deleted (still locked) is tried again a few times in the background.
function removeLater(target, err, attempt = 0) {
  if (attempt === 0) console.warn(`  Could not remove ${path.relative(DATA_DIR, target)} yet (${err?.code || err?.message}) — trying again shortly.`);
  if (attempt >= 5) return;
  setTimeout(() => {
    safeRm(target, { recursive: true, force: true }).catch((e) => removeLater(target, e, attempt + 1));
  }, 5000 * 3 ** attempt).unref?.();
}

// Move an uploaded tmp file into its final folder under `finalName`.
export async function moveInto(dir, tmpPath, finalName) {
  const dest = path.join(dir, finalName);
  await moveFile(tmpPath, dest);
  return finalName;
}

// Store a single-slot image (banner, avatar, thumbnail, plugin/group preview…)
// under a UNIQUE filename and delete the previous one. The URL changes on every
// re-upload, so no browser can serve a stale cached copy, and the old file is
// removed so nothing leaks on disk. `stem` is a readable prefix, e.g. 'avatar'.
export async function replaceImage(dir, tmpPath, stem, originalName, oldStored, defaultExt = '') {
  const ext = extOf(originalName) || defaultExt;
  const stored = await moveInto(dir, tmpPath, `${stem}-${nanoid(8)}${ext}`);
  if (oldStored && path.basename(oldStored) !== stored) {
    await safeRm(path.join(dir, path.basename(oldStored)), { force: true }).catch(() => {});
  }
  return stored;
}

// ---- Trash moves -------------------------------------------------------------
// (Moving a deleted item's files in: see ../trashMoves.js — it may have to wait.)
// Put a trashed folder back, replacing anything at the destination. Restoring
// must bring the files back, so a folder that stays locked is copied instead.
export async function restoreFromTrash(from, to) {
  if (!fs.existsSync(from)) return; // nothing on disk, or its files never left their place
  await safeRm(to, { recursive: true, force: true }).catch(() => {});
  await moveFile(from, to, { copyIfLocked: true });
}
/** Pairs { from, to } for specific files/folders (paths relative to `fromBase`) at the same relative paths under `toBase`. */
export const relPairs = (fromBase, toBase, rels) => (rels || []).filter(Boolean)
  .map((rel) => ({ from: path.join(fromBase, rel), to: path.join(toBase, rel) }));
// Move specific files/folders (paths relative to `fromBase`) to the same
// relative paths under `toBase`, so restoring is a plain move back.
export async function moveRelPaths(fromBase, toBase, rels, { ignoreMissing = true, copyIfLocked = false } = {}) {
  for (const { from, to } of relPairs(fromBase, toBase, rels)) {
    assertInside(from); assertInside(to);
    if (!fs.existsSync(from)) continue;
    await moveFile(from, to, { ignoreMissing, copyIfLocked });
  }
}
// Remove now-empty folders from `dir` up to (not including) `stopAt`.
export async function pruneEmptyDirs(dir, stopAt) {
  let d = path.resolve(dir);
  const stop = path.resolve(stopAt);
  while (d.startsWith(stop + path.sep)) {
    try { await fsp.rmdir(d); } catch { return; } // not empty (or gone) — stop here
    d = path.dirname(d);
  }
}

export const trashPath = (trashId) => path.join(TRASH_DIR, trashId);
