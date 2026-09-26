/**
 * Find files in the library folders that nothing in db.json points at any
 * more — e.g. images left behind by older versions when a banner or avatar
 * was re-uploaded, or the folder of a project whose creation failed halfway.
 *
 * Deliberately conservative: a file counts as used if its path OR its bare
 * file name appears anywhere in its owner's record, or if any record links to
 * it via a /data/… URL. Hidden files and anything modified in the last
 * 10 minutes (an upload in progress) are never reported.
 */
import fsp from 'node:fs/promises';
import path from 'node:path';
import { DATA_DIR, TYPES } from './config.js';
import { readDB } from './db.js';

const MIN_AGE_MS = 10 * 60 * 1000;

function collectStrings(value, out) {
  if (typeof value === 'string') { if (value) out.add(value); return; }
  if (Array.isArray(value)) { for (const v of value) collectStrings(v, out); return; }
  if (value && typeof value === 'object') for (const v of Object.values(value)) collectStrings(v, out);
}
function refSet(obj) {
  const set = new Set();
  collectStrings(obj, set);
  for (const s of [...set]) set.add(path.posix.basename(s));
  return set;
}

// Visit every regular file under `dir` (not following symlinks, skipping
// dot-files such as .DS_Store). `rel` uses forward slashes.
async function walkFiles(dir, visit, base = dir) {
  const entries = await fsp.readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const e of entries) {
    if (e.name.startsWith('.')) continue;
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) await walkFiles(abs, visit, base);
    else if (e.isFile()) {
      const st = await fsp.stat(abs).catch(() => null);
      if (st) await visit(abs, path.relative(base, abs).split(path.sep).join('/'), st);
    }
  }
}

/** Returns [{ rel, size }] — `rel` is relative to data/ (forward slashes). */
export async function scanUnused() {
  const db = await readDB();
  const now = Date.now();

  // Any record may link to another record's file by URL (reference cards).
  const all = new Set();
  collectStrings(db, all);
  const linked = new Set();
  for (const s of all) {
    const i = s.indexOf('/data/');
    if (i !== -1) linked.add(s.slice(i + 6).split(/[?#]/)[0]);
  }

  const owners = new Map();
  for (const p of db.projects) if (p?.type && p?.id) owners.set(`${p.type}/${p.id}`, refSet(p));
  for (const p of db.plans) if (p?.id) owners.set(`plan/${p.id}`, refSet(p));
  for (const s of db.software) if (s?.id) owners.set(`software/${s.id}`, refSet(s));
  for (const it of db.inbox || []) if (it?.id) owners.set(`inbox/${it.id}`, refSet(it));
  owners.set('dashboard', refSet(db.settings));

  const found = [];
  const check = (key, dir) => walkFiles(dir, (_abs, rel, st) => {
    if (now - st.mtimeMs < MIN_AGE_MS) return;
    const refs = owners.get(key);
    if (refs && (refs.has(rel) || refs.has(path.posix.basename(rel)))) return;
    if (linked.has(`${key}/${rel}`)) return;
    found.push({ rel: `${key}/${rel}`, size: st.size });
  });

  for (const root of [...TYPES, 'plan', 'software', 'inbox']) {
    const rootDir = path.join(DATA_DIR, root);
    const entries = await fsp.readdir(rootDir, { withFileTypes: true }).catch(() => []);
    for (const e of entries) {
      if (e.isDirectory() && !e.name.startsWith('.')) await check(`${root}/${e.name}`, path.join(rootDir, e.name));
    }
  }
  await check('dashboard', path.join(DATA_DIR, 'dashboard'));

  found.sort((a, b) => a.rel.localeCompare(b.rel));
  return found;
}
