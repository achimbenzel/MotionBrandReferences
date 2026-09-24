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

// Move a file or folder, falling back to copy + delete when a plain rename
// crosses devices (EXDEV). Missing sources are ignored when `ignoreMissing`.
export async function moveFile(from, to, { ignoreMissing = false } = {}) {
  assertInside(from); assertInside(to);
  await fsp.mkdir(path.dirname(to), { recursive: true });
  try {
    await fsp.rename(from, to);
  } catch (err) {
    if (err.code === 'EXDEV') {
      await fsp.cp(from, to, { recursive: true });
      await fsp.rm(from, { recursive: true, force: true });
    } else if (!(ignoreMissing && err.code === 'ENOENT')) {
      throw err;
    }
  }
  invalidateStorage();
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
// Move a whole folder aside (a deleted project / plan / software).
export async function moveToTrash(from, to) {
  if (!fs.existsSync(from)) return; // nothing on disk (e.g. a fileless item)
  await moveFile(from, to, { ignoreMissing: true });
}
// Put a trashed folder back, replacing anything at the destination.
export async function restoreFromTrash(from, to) {
  if (!fs.existsSync(from)) return;
  await safeRm(to, { recursive: true, force: true }).catch(() => {});
  await moveFile(from, to);
}
// Move specific files/folders (paths relative to `fromBase`) to the same
// relative paths under `toBase`, so restoring is a plain move back.
export async function moveRelPaths(fromBase, toBase, rels, { ignoreMissing = true } = {}) {
  for (const rel of rels) {
    if (!rel) continue;
    const from = path.join(fromBase, rel);
    const to = path.join(toBase, rel);
    assertInside(from); assertInside(to);
    if (!fs.existsSync(from)) continue;
    await moveFile(from, to, { ignoreMissing });
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
