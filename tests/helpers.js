// Test helpers: spawn the real server against a throwaway data folder so the
// tests exercise exactly what `npm start` runs, without touching data/.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Throwaway folders are removed when the test process exits.
const created = [];
process.on('exit', () => { for (const d of created) fs.rmSync(d, { recursive: true, force: true }); });
export async function tempDir(prefix = 'confinium-test-') {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), prefix));
  created.push(dir);
  return dir;
}

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => { const { port } = srv.address(); srv.close(() => resolve(port)); });
  });
}

/**
 * Start the API on a free port. Returns { base, dataDir, api, stop, log }.
 * `api(path, { method, json, body, headers })` sends the same CSRF header the
 * frontend sends, and parses JSON responses.
 */
export async function startServer({ dataDir, env = {} } = {}) {
  const dir = dataDir || await tempDir();
  const port = await freePort();
  const child = spawn(process.execPath, [path.join(ROOT, 'server/index.js')], {
    cwd: ROOT,
    env: { ...process.env, API_PORT: String(port), DATA_DIR: dir, NODE_ENV: 'test', ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  child.stdout.on('data', (d) => { log += d; });
  child.stderr.on('data', (d) => { log += d; });
  const exited = new Promise((resolve) => child.on('exit', (code) => resolve(code)));

  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; ; i += 1) {
    try { const r = await fetch(`${base}/api/plans`, { headers: { 'X-Requested-With': 'confinium' } }); if (r.status < 500) break; } catch { /* not up yet */ }
    if (child.exitCode != null) throw new Error(`server exited early:\n${log}`);
    if (i > 100) throw new Error(`server did not start:\n${log}`);
    await new Promise((r) => setTimeout(r, 100));
  }

  const api = async (p, { method = 'GET', json, body, headers = {} } = {}) => {
    const h = { 'X-Requested-With': 'confinium', ...headers };
    let payload = body;
    if (json !== undefined) { h['Content-Type'] = 'application/json'; payload = JSON.stringify(json); }
    const res = await fetch(`${base}${p}`, { method, headers: h, body: payload });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    return { status: res.status, data, headers: res.headers };
  };

  const stop = async () => {
    if (child.exitCode == null) { child.kill('SIGTERM'); await exited; }
  };
  return { base, dataDir: dir, api, stop, child, exited, log: () => log };
}

export const readJSON = async (p) => JSON.parse(await fsp.readFile(p, 'utf8'));
export const exists = (p) => fs.existsSync(p);
