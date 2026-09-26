/**
 * HTTP plumbing: async-safe routers, the JSON error handler and the request
 * guards that keep a login-less app safe to run on a shared network.
 */
import net from 'node:net';
import path from 'node:path';
import express from 'express';
import multer from 'multer';
import { ALLOWED_HOSTS, ENTITY_ROOTS, MAX_UPLOAD_BYTES } from './config.js';

// ---- Async routes ---------------------------------------------------------------
// Express 4 doesn't catch a rejected promise from an async handler: the request
// hangs and Node treats it as an unhandled rejection, which kills the process.
// Forward those errors to the error handler instead.
export function asyncRoute(fn) {
  if (typeof fn !== 'function' || fn.length >= 4) return fn; // error middleware as-is
  return function wrapped(req, res, next) {
    try {
      const out = fn(req, res, next);
      if (out && typeof out.catch === 'function') out.catch(next);
    } catch (err) { next(err); }
  };
}

// An express.Router whose route handlers are all wrapped with asyncRoute.
export function createRouter() {
  const router = express.Router();
  for (const m of ['get', 'post', 'put', 'patch', 'delete']) {
    const orig = router[m].bind(router);
    router[m] = (p, ...handlers) => orig(p, ...handlers.map(asyncRoute));
  }
  return router;
}

// Throw from a handler to answer with a specific status + error code.
export class HttpError extends Error {
  constructor(status, code, message) { super(message || code); this.status = status; this.code = code; }
}

const GB = 1024 * 1024 * 1024;

// Last middleware: every error becomes a JSON answer the frontend can show.
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  let status = Number(err.status || err.statusCode) || 500;
  let code = typeof err.code === 'string' ? err.code : 'server_error';
  let message = String(err.message || err);

  if (err instanceof multer.MulterError) {
    status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    code = err.code.toLowerCase();
    if (err.code === 'LIMIT_FILE_SIZE') {
      const limit = MAX_UPLOAD_BYTES >= GB ? `${+(MAX_UPLOAD_BYTES / GB).toFixed(1)} GB` : `${Math.round(MAX_UPLOAD_BYTES / (1024 * 1024))} MB`;
      message = `File is too large (max ${limit} per file).`;
    }
  } else if (err.type === 'entity.too.large') {
    status = 413; code = 'payload_too_large'; message = 'That change is too large to save in one go.';
  } else if (err.type === 'entity.parse.failed') {
    status = 400; code = 'invalid_json';
  } else if (err.code === 'ENOSPC') {
    status = 507; code = 'disk_full'; message = 'The disk is full — free up some space and try again.';
  } else if (status >= 500 && /^E[A-Z]+$/.test(code)) {
    code = 'server_error'; // don't surface raw errno codes as API codes
  }
  if (status >= 500) console.error(`  ${req.method} ${req.originalUrl} failed:`, err);
  if (res.headersSent) { res.destroy(err); return; }
  res.status(status).json({ error: code, message });
}

// ---- Guards ------------------------------------------------------------------------
// Host allowlist — defeats DNS rebinding (a web page that re-points its own
// domain at your machine to read the API as "same origin"). IP addresses,
// localhost, single-label names (Tailscale MagicDNS short names), *.ts.net and
// typical LAN suffixes are allowed; add custom domains via ALLOWED_HOSTS.
const LAN_SUFFIXES = ['.localhost', '.ts.net', '.local', '.lan', '.home.arpa', '.fritz.box', '.internal'];
export function isAllowedHost(hostHeader) {
  if (ALLOWED_HOSTS.includes('*') || !hostHeader) return true;
  let host = String(hostHeader).trim().toLowerCase();
  if (host.startsWith('[')) host = host.slice(1, host.indexOf(']') === -1 ? undefined : host.indexOf(']'));
  else host = host.replace(/:\d+$/, '');
  host = host.replace(/\.$/, '');
  if (host === 'localhost' || net.isIP(host)) return true;
  if (!host.includes('.')) return true;
  if (LAN_SUFFIXES.some((s) => host.endsWith(s))) return true;
  return ALLOWED_HOSTS.some((a) => host === a || (a.startsWith('.') && host.endsWith(a)));
}
export function hostGuard(req, res, next) {
  if (isAllowedHost(req.headers.host)) return next();
  res.status(403).type('text/plain').send(
    `Host "${req.headers.host}" is not allowed.\n`
    + 'If you reach the app through your own domain, start the server with ALLOWED_HOSTS=<that domain>.\n',
  );
}

// CSRF guard — every state-changing API call must carry a custom header. A
// browser only lets another site send custom headers after a CORS preflight,
// which this server never approves, so other web pages can't POST/DELETE here.
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
export const CSRF_HEADER = 'x-requested-with';
// The one exception is the phone's share sheet ("Share → Confinium"): it can
// only send a plain form POST. It's accepted when the browser says it didn't
// come from another site (Sec-Fetch-Site: none / same-origin; absent on
// browsers too old to send it) — and all it can do is add to the Inbox.
const SHARE_PATH = '/api/inbox/share';
const SHARE_SITES = new Set(['none', 'same-origin', undefined]);
export function csrfGuard(req, res, next) {
  if (SAFE_METHODS.has(req.method) || req.get(CSRF_HEADER)) return next();
  if (req.method === 'POST' && `${req.baseUrl}${req.path}` === SHARE_PATH && SHARE_SITES.has(req.get('sec-fetch-site'))) return next();
  res.status(403).json({ error: 'csrf', message: `Missing ${CSRF_HEADER} header.` });
}

// Only library folders are served from /data — never db.json (license keys!),
// its .bak, backups/ or tmp/.
const DATA_PUBLIC = new Set([...ENTITY_ROOTS, 'trash']);
export function dataGuard(req, res, next) {
  let p;
  try { p = decodeURIComponent(req.path); } catch { return res.status(400).end(); }
  if (p.includes('\\') || p.includes('\0')) return res.status(400).end();
  const first = path.posix.normalize(p).split('/').filter(Boolean)[0];
  if (!first || !DATA_PUBLIC.has(first)) return res.status(404).end();
  next();
}

// Headers for files under /data. Uploaded SVG/HTML/XML files are same-origin
// documents; if one is opened directly, `sandbox` stops any script inside it.
const ACTIVE_EXT = /\.(svgz?|html?|xhtml|xml)$/i;
export function dataHeaders(res, filePath) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (ACTIVE_EXT.test(filePath)) res.setHeader('Content-Security-Policy', 'sandbox');
  // Plan block files (moodboard/files/pdf) carry unique names and never change
  // under a URL → long immutable cache. Everything else gets a short cache.
  if (/[\\/]blocks[\\/]/.test(filePath)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  else res.setHeader('Cache-Control', 'public, max-age=300');
}
