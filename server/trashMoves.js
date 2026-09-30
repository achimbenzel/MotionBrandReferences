/**
 * Moving a deleted item's files into the Trash.
 *
 * A delete saves first (the item goes to `db.trash`), then moves its files to
 * data/trash/<trashId>/. On Windows a folder can't be moved while a file in it
 * is open — a video the page is still playing, a virus scan — so the move may
 * have to wait. The delete still succeeds: the entry remembers what's left to
 * move (`pending`: [{ from, to }], paths relative to data/) and it's tried
 * again a little later, and at start-up. While pending the files simply stay
 * where they were: restoring leaves them there, emptying the Trash deletes
 * them, and the Trash shows them from there.
 */
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from './config.js';
import { readDB, mutateDB } from './db.js';
import { moveFile, safeRm } from './files.js';

const rel = (abs) => path.relative(DATA_DIR, abs).split(path.sep).join('/');
const abs = (r) => path.join(DATA_DIR, ...String(r).split('/'));

/** Move pairs [{ from, to }] (absolute) now → the ones that couldn't be moved yet, relative to data/. */
async function tryMoves(pairs) {
  const left = [];
  for (const { from, to } of pairs) {
    if (!fs.existsSync(from)) continue; // nothing on disk (a fileless item) — nothing to move
    try {
      await moveFile(from, to, { ignoreMissing: true });
    } catch (err) {
      console.warn(`  Could not move ${rel(from)} to the Trash yet (${err.code || err.message}) — it's tried again shortly.`);
      left.push({ from: rel(from), to: rel(to) });
    }
  }
  return left;
}

/**
 * The files of trash entry `trashId` into the Trash: [{ from, to }] (absolute).
 * Never throws — the delete is saved already; what can't move now waits.
 * → true when everything moved.
 */
export async function trashFiles(trashId, pairs) {
  let left;
  try { left = await tryMoves(pairs.filter(Boolean)); } catch (err) {
    console.warn(`  Moving files to the Trash failed: ${err.message}`);
    return false;
  }
  if (!left.length) return true;
  await mutateDB((db) => {
    const t = db.trash.find((x) => x.trashId === trashId);
    if (t) t.pending = [...(t.pending || []), ...left];
  }).catch(() => {});
  scheduleRetry();
  return false;
}

/**
 * Try every waiting move again. Runs under the database's write lock, so it
 * can't cross a restore or an emptied Trash: only entries still in the Trash
 * are moved.
 */
export async function retryPending() {
  if (!(await readDB()).trash.some((t) => t.pending?.length)) return 0;
  return mutateDB(async (db) => {
    let waiting = 0;
    for (const t of db.trash) {
      if (!t.pending?.length) continue;
      const left = await tryMoves(t.pending.map((p) => ({ from: abs(p.from), to: abs(p.to) })));
      if (left.length) { t.pending = left; waiting += left.length; } else delete t.pending;
    }
    return waiting;
  });
}

// Again after 3 s, 15 s, 1 min, 5 min, then every 30 min while something waits.
const BASE = Number(process.env.TRASH_RETRY_MS) || 3000;
const STEPS = [1, 5, 20, 100, 600];
let timer = null;
function scheduleRetry(step = 0) {
  if (timer) return;
  timer = setTimeout(async () => {
    timer = null;
    const waiting = await retryPending().catch(() => 1);
    if (waiting) scheduleRetry(Math.min(step + 1, STEPS.length - 1));
  }, STEPS[step] * BASE);
  timer.unref?.();
}
/** At start-up: whatever still waits from before. */
export function resumePending() { retryPending().then((n) => { if (n) scheduleRetry(); }).catch(() => {}); }

/** The files of an entry that never reached the Trash — deleted with it when the Trash is emptied. */
export async function removePending(entry) {
  for (const p of entry?.pending || []) await safeRm(abs(p.from), { recursive: true, force: true }).catch(() => {});
}

/** Where a trashed file is right now: in the Trash, or (still waiting) where it was → a /data/ URL path. */
export function trashedFileUrl(entry, inner) {
  const at = `trash/${entry.trashId}/${inner}`;
  for (const p of entry.pending || []) {
    if (at === p.to || at.startsWith(`${p.to}/`)) return `/data/${p.from}${at.slice(p.to.length)}`;
  }
  return `/data/${at}`;
}
