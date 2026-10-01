/**
 * Several devices (or tabs) on one library.
 *
 * - Each saved change gets a revision number, and what it changed remembers
 *   who changed it and when: a record (`plans/abc`) or a part of it
 *   (`plans/abc/blocks/xyz`), field by field for an edit (`…#title`), as a
 *   whole (`…#*`) for anything else. Kept in memory: after a restart nothing
 *   is known yet, and nothing counts as a conflict.
 * - Every API answer carries `X-Rev`, the revision the library was at when the
 *   request came in. A page remembers it for what it loaded and sends it back
 *   with its edits (`X-Base-Rev`). An edit of a field someone else (another
 *   tab or device) has changed since — or a save of the whole board over a
 *   card someone changed — is refused with 409 `conflict` instead of silently
 *   overwriting theirs; `X-Force: 1` saves it anyway ("keep mine").
 * - Open pages hear about every change over one stream, `GET /api/events`,
 *   and load again what someone else changed.
 * Tabs name themselves with `X-Client-Id`.
 */
import { AsyncLocalStorage } from 'node:async_hooks';

const context = new AsyncLocalStorage();
let rev = Date.now(); // above every revision handed out before a restart
const changed = new Map(); // key → { rev, by }
const streams = new Set();

// What a request is about: the most specific thing it can change.
const KEYS = [
  /^\/api\/(plans\/[\w-]+\/blocks\/[\w-]+)/,
  /^\/api\/(board\/cards\/[\w-]+)/,
  /^\/api\/(time\/(?:entries\/[\w-]+|activities))/,
  /^\/api\/((?:plans|notes|content|content-library|software|mockups|mockup-models|mockup-hdris|clients|projects|galleries|expenses|income|achievements|presentations)\/[\w-]+)/,
  /^\/api\/(board|settings)(?:\/|$)/,
];
export const keyOf = (path) => { for (const re of KEYS) { const m = re.exec(path); if (m) return m[1]; } return null; };

const CLIENT = /^[\w-]{6,40}$/;
/** Middleware: the request's context, and the revision it starts at. */
export function liveContext(req, res, next) {
  const path = `${req.baseUrl}${req.path}`; // mounted at /api
  const key = req.method === 'GET' ? null : keyOf(path);
  const exact = !!key && path === `/api/${key}`; // the record itself, not something inside it (a list item, an upload)
  const base = Number(req.get('X-Base-Rev'));
  const ctx = {
    by: CLIENT.test(req.get('X-Client-Id') || '') ? req.get('X-Client-Id') : null,
    key,
    method: req.method,
    // Field edits of the record itself are checked against what the page loaded.
    fields: exact && req.method === 'PATCH' && req.body && typeof req.body === 'object' ? Object.keys(req.body) : null,
    base: exact && (req.method === 'PATCH' || req.method === 'PUT') && Number.isFinite(base) && base > 0 ? base : null,
    force: req.get('X-Force') === '1',
    path,
  };
  res.setHeader('X-Rev', String(rev));
  req.live = ctx;
  context.run(ctx, next);
}
/** Run `fn` in the request's context again — after a stream (an upload) has lost it. */
export const inContext = (req, fn) => (req.live ? context.run(req.live, fn) : fn());

export class ConflictError extends Error {
  constructor() {
    super('This was changed on another device or in another tab since you opened it.');
    this.status = 409;
    this.code = 'conflict';
  }
}

/** Before a write (under the write lock): refuse an edit of what someone else has changed since it was loaded. */
export function checkConflict() {
  const ctx = context.getStore();
  if (!ctx?.base || ctx.force) return;
  const { key } = ctx;
  const clashes = ctx.method === 'PUT'
    ? (k) => k.startsWith(`${key}#`) || k.startsWith(`${key}/`)   // the whole thing: any change in it
    : (k) => k === `${key}#*` || ctx.fields?.some((f) => k === `${key}#${f}`); // these fields
  for (const [k, c] of changed) if (c.rev > ctx.base && c.by !== ctx.by && clashes(k)) throw new ConflictError();
}

/** After a write: a new revision, remembered for what was changed, and told to every open page. */
export function recordChange() {
  const ctx = context.getStore();
  rev += 1;
  if (ctx?.key) {
    for (const k of ctx.fields?.length ? ctx.fields.map((f) => `${ctx.key}#${f}`) : [`${ctx.key}#*`]) {
      changed.delete(k); // re-inserted as the newest
      changed.set(k, { rev, by: ctx.by });
    }
    while (changed.size > 5000) changed.delete(changed.keys().next().value); // the oldest
  }
  const event = `data: ${JSON.stringify({ rev, by: ctx?.by || null, key: ctx?.key || null, path: ctx?.path || null })}\n\n`;
  for (const res of streams) res.write(event);
}

/** GET /api/events — a server-sent event per saved change. */
export function eventStream(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write(`retry: 3000\ndata: ${JSON.stringify({ rev, hello: true })}\n\n`);
  streams.add(res);
  const ping = setInterval(() => res.write(': ping\n\n'), 25000);
  req.on('close', () => { clearInterval(ping); streams.delete(res); });
}

/** On shutdown: end the streams (pages reconnect by themselves), so the server can close. */
export function closeStreams() {
  for (const res of streams) res.end();
  streams.clear();
}
