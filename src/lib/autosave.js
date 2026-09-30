// Debounced autosave that never drops an edit.
//
// Pages used to keep a bare setTimeout per save and clear it on unmount, so an
// edit typed less than ~0.5 s before navigating away (or closing the tab) was
// silently lost. A saver instead *runs* pending saves early: when the page
// unmounts, when the tab is hidden, and on page unload (as keepalive requests).
import { useEffect, useRef } from 'react';
import { withKeepalive, loadedRev } from './api.js';
import { onRemoteChange, concerns } from './live.js';

const mounted = new Set();
// Every save on the wire, from any page — so a page that opens next can wait
// for the one it replaced (e.g. storyboard editor ↔ plan) before loading.
const allInflight = new Set();
/** Resolves once every save that has been sent (by any page) has finished —
 *  or after `timeout` ms, so a hanging request never blocks a page. */
export const whenSaved = (timeout = 4000) => Promise.race([
  Promise.all([...allInflight]),
  new Promise((resolve) => { setTimeout(resolve, timeout); }),
]);
let listening = false;
function listen() {
  if (listening || typeof window === 'undefined') return;
  listening = true;
  const flushAll = () => withKeepalive(() => { for (const s of mounted) s.flush(); });
  window.addEventListener('pagehide', flushAll);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushAll(); });
}

function createSaver(defaultDelay) {
  const jobs = new Map();      // key → { timer, run }
  const inflight = new Set();  // promises of saves that have been sent
  const exec = (run) => {
    let p;
    try { p = Promise.resolve(run()); } catch (err) { p = Promise.reject(err); }
    const tracked = p.catch(() => {}).finally(() => { inflight.delete(tracked); allInflight.delete(tracked); });
    inflight.add(tracked);
    allInflight.add(tracked);
    return tracked;
  };
  return {
    /** (Re)start the timer for `key`. `run` performs the save (reading the
     *  latest values itself) and handles its own errors. */
    schedule(key, run, { delay = defaultDelay, immediate = false } = {}) {
      const prev = jobs.get(key);
      if (prev) clearTimeout(prev.timer);
      if (immediate) { jobs.delete(key); exec(run); return; }
      jobs.set(key, { run, timer: setTimeout(() => { jobs.delete(key); exec(run); }, delay) });
    },
    /** Run pending saves now (all, or just `key`); resolves once every save
     *  that is in flight has finished. */
    flush(key) {
      for (const k of key === undefined ? [...jobs.keys()] : [key]) {
        const job = jobs.get(k);
        if (!job) continue;
        clearTimeout(job.timer);
        jobs.delete(k);
        exec(job.run);
      }
      return Promise.all([...inflight]);
    },
    /** Nothing waiting and nothing on the wire. */
    idle: () => jobs.size === 0 && inflight.size === 0,
  };
}

/** One saver per component; flushed on unmount / tab hide / page unload. */
export function useSaver(defaultDelay = 500) {
  const ref = useRef(null);
  if (!ref.current) ref.current = createSaver(defaultDelay);
  useEffect(() => {
    listen();
    const saver = ref.current;
    mounted.add(saver);
    return () => { saver.flush(); mounted.delete(saver); };
  }, []);
  return ref.current;
}

// Load again and show it — unless an edit started meanwhile; then the page's
// copy stays what it was, and so does the revision its next save is based on.
async function reload(fns, saver, live, force) {
  const before = live ? loadedRev.get(live) : undefined;
  try {
    const data = await fns.current.load();
    if (force || !saver || saver.idle()) { fns.current.apply(data); return true; }
  } catch { return true; /* offline or gone — keep what's on screen */ }
  if (live) loadedRev.set(live, before);
  return false;
}

/**
 * Keep a page's data current while it's open on several devices:
 * - reload it when the tab comes back after being hidden for a while;
 * - with `live` (what the page shows, e.g. 'plans/abc'): reload it as soon as
 *   another device or tab saves a change to it, and after "Load theirs" when
 *   an edit clashed with one.
 * Never while this page has unsaved or in-flight edits — it waits until they're
 * saved — and a result is only shown if no edit started meanwhile.
 */
export function useRefreshOnReturn(load, apply, saver, { afterMs = 3000, live = null } = {}) {
  const fns = useRef({ load, apply });
  fns.current = { load, apply };
  useEffect(() => {
    let hiddenAt = 0;
    const onVisibility = async () => {
      if (document.visibilityState === 'hidden') { hiddenAt = Date.now(); return; }
      if (!hiddenAt || Date.now() - hiddenAt < afterMs) return;
      hiddenAt = 0;
      if (saver && !saver.idle()) return;
      await reload(fns, saver, live, false);
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [saver, afterMs, live]);

  useEffect(() => {
    if (!live) return undefined;
    let timer = 0;
    let tries = 0;
    const run = async () => {
      timer = 0;
      if (saver && !saver.idle()) { // this page's own edits first
        tries += 1;
        if (tries < 60) timer = setTimeout(run, 1000);
        return;
      }
      if (!(await reload(fns, saver, live, false)) && tries < 60) { tries += 1; timer = setTimeout(run, 1000); }
    };
    const off = onRemoteChange((ev) => {
      if (!concerns(ev, live)) return;
      clearTimeout(timer);
      tries = 0;
      timer = setTimeout(run, 300); // a burst of saves (typing) → one reload
    });
    const onTheirs = async (e) => {
      const key = e.detail?.key || '';
      if (key !== live && !key.startsWith(`${live}/`) && !live.startsWith(`${key}/`)) return;
      e.detail.handled = true;
      clearTimeout(timer);
      await saver?.flush();
      await reload(fns, saver, live, true);
    };
    window.addEventListener('confinium:theirs', onTheirs);
    return () => { off(); clearTimeout(timer); window.removeEventListener('confinium:theirs', onTheirs); };
  }, [saver, live]);
}
