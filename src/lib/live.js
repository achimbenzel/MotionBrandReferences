// Changes saved elsewhere — on another device or in another tab — as they
// happen (the server's /api/events stream, see server/live.js).
//
// One stream per browser, not per tab: a browser allows only six connections
// to a server, and every open tab holding one would soon block the app. The
// tab that holds the lock keeps the stream and passes each event on to the
// other tabs; when it closes, another tab takes over.
import { CLIENT_ID } from './api.js';

const subs = new Set();
let started = false;

function deliver(ev) {
  if (!ev || ev.by === CLIENT_ID) return; // this tab's own saves
  for (const fn of subs) { try { fn(ev); } catch { /* one page's problem */ } }
}

function start() {
  if (started || typeof window === 'undefined' || typeof EventSource === 'undefined') return;
  started = true;
  const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('confinium-live') : null;
  channel?.addEventListener('message', (e) => deliver(e.data));
  let seen = false;
  const open = () => {
    const es = new EventSource('/api/events');
    es.onmessage = (e) => {
      let ev;
      try { ev = JSON.parse(e.data); } catch { return; }
      if (ev.hello) {
        // Back after the server restarted (or the connection dropped): what
        // changed meanwhile is unknown — pages load again.
        if (!seen) { seen = true; return; }
        ev = { rev: ev.rev, by: null, key: null, resync: true };
      }
      deliver(ev);
      channel?.postMessage(ev);
    };
    // A dropped connection comes back by itself — but not after a proxy
    // answered with an error page while the server restarted: try again then.
    es.onerror = () => { if (es.readyState === EventSource.CLOSED) setTimeout(open, 3000); };
  };
  const connect = () => new Promise(() => { open(); }); // held for as long as this tab is open
  if (channel && navigator.locks?.request) navigator.locks.request('confinium-live', connect).catch(() => {});
  else connect();
}

/** fn({ rev, by, key, path }) for every change saved elsewhere; → unsubscribe. */
export function onRemoteChange(fn) {
  start();
  subs.add(fn);
  return () => subs.delete(fn);
}

/** Does a change concern `key` (e.g. 'plans/abc') — it, a part of it, or unknown? */
export const concerns = (ev, key) => !ev.key || ev.key === key || ev.key.startsWith(`${key}/`);
