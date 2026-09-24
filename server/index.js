/**
 * Confinium Dashboard — local backend.
 *
 *   - Persists metadata in data/db.json (human-readable JSON, crash-safe).
 *   - Stores every uploaded binary under data/<type>/<id>/ so the library
 *     survives app updates, and serves it back (with range support for video).
 *   - In production (npm start) also serves the built frontend.
 *
 * The `data/` directory is the single source of truth and is git-ignored.
 * Code layout: config · db (persistence) · schema (record shapes + migration)
 * · files (fs helpers) · http (guards, errors) · routes/*.
 */
import { DATA_DIR, HOST, PORT, IS_PROD } from './config.js';
import { ensureDirs } from './files.js';
import { emptyDB } from './schema.js';
import { drainWrites } from './db.js';
import { createApp } from './app.js';
import { purgeExpiredTrash } from './routes/trash.js';

ensureDirs(emptyDB());
const app = createApp();

purgeExpiredTrash().catch(() => {}); // clear items older than the TTL on boot

const server = app.listen(PORT, HOST, () => {
  const shown = HOST === '0.0.0.0' || HOST === '::' ? 'localhost' : HOST.includes(':') ? `[${HOST}]` : HOST;
  console.log(`\n  Confinium API     →  http://${shown}:${PORT}`);
  console.log(`  Library folder    →  ${DATA_DIR}`);
  if (IS_PROD) console.log(`  Serving built app →  http://${shown}:${PORT}\n`);
  else console.log('  Frontend (dev)    →  http://localhost:4200\n');
});
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') console.error(`\n  Port ${PORT} is already in use — is the app already running?\n`);
  else console.error(err);
  process.exit(1);
});

// Graceful shutdown: stop taking new requests, let in-flight writes finish, and
// only then exit — so a restart/deploy can't interrupt a db write.
let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n  ${signal} received — finishing pending writes…`);
  const hardExit = setTimeout(() => process.exit(0), 5000);
  hardExit.unref();
  const closed = new Promise((resolve) => server.close(resolve)); // waits for in-flight requests
  server.closeIdleConnections?.(); // …but not for idle keep-alive sockets
  await closed;
  await drainWrites();
  clearTimeout(hardExit);
  process.exit(0);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
