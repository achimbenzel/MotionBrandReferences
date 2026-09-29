/**
 * Pictures already in the library, made smaller afterwards: find the big ones
 * (and whose they are), swap one for its smaller version — its name changes
 * (a new format, and no stale cached copy), so every place that names it is
 * rewritten — and put the originals in the Trash as one item that restores
 * them all (files and names).
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { DATA_DIR, TRASH_DIR, TYPES } from './config.js';

export const RASTER = /\.(jpe?g|png|webp)$/i;

// Where stored pictures can be made smaller. Not logos (they stay exact), not
// mockups (their screens are fitted to the pixel), not clients (logos too).
export const PICTURE_AREAS = [
  { key: 'refs', label: 'References', roots: [...TYPES].filter((t) => t !== 'logo') },
  { key: 'plan', label: 'Projects', roots: ['plan'] },
  { key: 'note', label: 'Notes', roots: ['note'] },
  { key: 'content', label: 'Content', roots: ['content'] },
  { key: 'inbox', label: 'Inbox', roots: ['inbox'] },
  { key: 'other', label: 'Software, achievements, dashboard', roots: ['software', 'achievement', 'dashboard'] },
];
const AREA_OF = Object.fromEntries(PICTURE_AREAS.flatMap((a) => a.roots.map((r) => [r, a.key])));

/** The record a stored file belongs to → { record, inner, label } (inner: its path inside the record's folder), or null. */
export function ownerOf(db, rel) {
  const parts = String(rel).split('/');
  const root = parts[0];
  if (root === 'dashboard') return { record: db.settings, inner: parts.slice(1).join('/'), label: 'Dashboard banner' };
  const id = parts[1];
  const inner = parts.slice(2).join('/');
  if (!id || !inner) return null;
  let record = null; let label = '';
  if (TYPES.has(root)) { record = db.projects.find((p) => p.type === root && p.id === id); label = record?.title || 'Reference'; }
  else if (root === 'plan') { record = db.plans.find((p) => p.id === id); label = record?.name || 'Project'; }
  else if (root === 'note') { record = (db.notes || []).find((n) => n.id === id); label = record?.title || 'Note'; }
  else if (root === 'content') { record = (db.content || []).find((c) => c.id === id); label = record?.title || 'Post'; }
  else if (root === 'inbox') { record = (db.inbox || []).find((x) => x.id === id); label = record?.title || record?.name || 'Inbox'; }
  else if (root === 'software') { record = (db.software || []).find((x) => x.id === id); label = record?.name || 'Software'; }
  else if (root === 'achievement') { record = (db.achievements || []).find((x) => x.id === id); label = record?.title || 'Achievement'; }
  return record ? { record, inner, label } : null;
}

function strings(value, out) {
  if (typeof value === 'string') out.add(value);
  else if (Array.isArray(value)) value.forEach((v) => strings(v, out));
  else if (value && typeof value === 'object') Object.values(value).forEach((v) => strings(v, out));
  return out;
}
/** Does the record name this file (by its path, its bare name, or a /data/… URL)? */
export function names(record, inner) {
  const base = path.posix.basename(inner);
  for (const s of strings(record, new Set())) if (s === inner || s === base || s.endsWith(`/${inner}`)) return true;
  return false;
}

// Rewrite every string in `value` (in place) that `swap` changes.
function rewrite(value, swap) {
  if (Array.isArray(value)) {
    value.forEach((v, i) => { if (typeof v === 'string') value[i] = swap(v); else rewrite(v, swap); });
  } else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) { if (typeof v === 'string') value[k] = swap(v); else rewrite(v, swap); }
  }
}

/** The file `rel` is now `next`: its record's names for it, and /data/ links to it anywhere, follow. */
export function renameRefs(db, rel, next) {
  const own = ownerOf(db, rel);
  const nextInner = next.split('/').slice(rel.startsWith('dashboard/') ? 1 : 2).join('/');
  if (own) {
    const base = path.posix.basename(own.inner);
    const nextBase = path.posix.basename(nextInner);
    rewrite(own.record, (s) => (s === own.inner ? nextInner
      : s === base ? nextBase
        : s.endsWith(`/${own.inner}`) ? s.slice(0, -own.inner.length) + nextInner : s));
  }
  const url = `/data/${rel}`;
  rewrite(db, (s) => (s.includes(url) ? s.split(url).join(`/data/${next}`) : s));
}

async function walk(dir, visit, base) {
  const entries = await fsp.readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const e of entries) {
    if (e.name.startsWith('.')) continue;
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) await walk(abs, visit, base);
    else if (e.isFile() && RASTER.test(e.name)) {
      const st = await fsp.stat(abs).catch(() => null);
      if (st) visit(path.relative(base, abs).split(path.sep).join('/'), st.size);
    }
  }
}

/** Stored pictures of at least `minBytes` that a record uses → [{ rel, size, area, owner }], biggest first. */
export async function scanPictures(db, minBytes = 500 * 1024) {
  const found = [];
  const roots = PICTURE_AREAS.flatMap((a) => a.roots);
  for (const root of roots) {
    const dir = path.join(DATA_DIR, root);
    await walk(dir, (inner, size) => {
      if (size < minBytes) return;
      const rel = `${root}/${inner}`;
      const own = ownerOf(db, rel);
      if (!own || !names(own.record, own.inner)) return; // unused files are the other cleanup's job
      found.push({ rel, size, area: AREA_OF[root], owner: own.label });
    }, dir);
  }
  return found.sort((a, b) => b.size - a.size);
}

/** A free name for the smaller version next to the original: "cover-s.webp", "cover-s2.webp" … */
export function smallerName(rel, ext) {
  const dir = path.posix.dirname(rel);
  const stem = path.posix.basename(rel).replace(/\.[^.]+$/, '').replace(/-s\d*$/, '');
  for (let i = 1; i < 1000; i += 1) {
    const next = `${dir}/${stem}-s${i === 1 ? '' : i}${ext}`;
    if (!fs.existsSync(path.join(DATA_DIR, next))) return next;
  }
  return `${dir}/${stem}-s${Date.now()}${ext}`;
}

/** Undo a "made smaller" Trash item: the originals back in place, their names back in the records. */
export async function restorePictures(db, entry) {
  const from = path.join(TRASH_DIR, entry.trashId);
  const done = [];
  for (const it of [...(entry.data?.items || [])].reverse()) {
    const src = path.join(from, it.rel);
    if (!fs.existsSync(src)) continue;
    const dst = path.join(DATA_DIR, it.rel);
    await fsp.mkdir(path.dirname(dst), { recursive: true });
    await fsp.rename(src, dst).catch(async () => { await fsp.copyFile(src, dst); await fsp.rm(src, { force: true }); });
    await fsp.rm(path.join(DATA_DIR, it.next), { force: true }).catch(() => {});
    renameRefs(db, it.next, it.rel);
    done.push(it.rel);
  }
  return done;
}
