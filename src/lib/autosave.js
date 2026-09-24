// Debounced autosave that never drops an edit.
//
// Pages used to keep a bare setTimeout per save and clear it on unmount, so an
// edit typed less than ~0.5 s before navigating away (or closing the tab) was
// silently lost. A saver instead *runs* pending saves early: when the page
// unmounts, when the tab is hidden, and on page unload (as keepalive requests).
import { useEffect, useRef } from 'react';
import { withKeepalive } from './api.js';

const mounted = new Set();
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
    const tracked = p.catch(() => {}).finally(() => inflight.delete(tracked));
    inflight.add(tracked);
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

/**
 * Reload a page's data when the tab comes back after being hidden for a
 * while, so a tab left open on another device doesn't overwrite newer changes
 * with a stale copy. Skipped while this page has unsaved or in-flight edits,
 * and the result is only applied if no edit started meanwhile.
 */
export function useRefreshOnReturn(load, apply, saver, { afterMs = 3000 } = {}) {
  const fns = useRef({ load, apply });
  fns.current = { load, apply };
  useEffect(() => {
    let hiddenAt = 0;
    const onVisibility = async () => {
      if (document.visibilityState === 'hidden') { hiddenAt = Date.now(); return; }
      if (!hiddenAt || Date.now() - hiddenAt < afterMs) return;
      hiddenAt = 0;
      if (saver && !saver.idle()) return;
      try {
        const data = await fns.current.load();
        if (!saver || saver.idle()) fns.current.apply(data);
      } catch { /* offline or gone — keep what's on screen */ }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [saver, afterMs]);
}
