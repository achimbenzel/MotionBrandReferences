import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Frontend dev server runs on 4200 (kept clear of your 5173/3000/3333/8000).
// The backend API + uploaded files live on 4300 and are proxied through here
// so the app is reachable from a single origin during development.
const API_PORT = process.env.API_PORT || 4300;

// When the API can't be reached for a moment (it restarts after an update, or
// is still starting) Vite would answer with an empty "500 Internal Server
// Error". Say what happened instead, and whether the request got through at
// all — the app retries requests that didn't.
const explainProxyErrors = (proxy) => proxy.on('error', (err, _req, res) => {
  if (!res || typeof res.writeHead !== 'function' || res.headersSent || res.writableEnded) return;
  const delivered = err.code !== 'ECONNREFUSED';
  res.writeHead(502, { 'Content-Type': 'application/json' }).end(JSON.stringify({
    error: 'backend_unreachable',
    delivered,
    message: delivered ? 'The connection to the server broke off.' : 'The server isn’t running right now (restarting?).',
  }));
});

export default defineConfig({
  plugins: [react()],
  server: {
    port: 4200,
    strictPort: true,
    proxy: {
      // 127.0.0.1, not "localhost": the API listens on IPv4 loopback only, and
      // "localhost" may resolve to ::1 first.
      '/api': { target: `http://127.0.0.1:${API_PORT}`, changeOrigin: true, configure: explainProxyErrors },
      '/data': { target: `http://127.0.0.1:${API_PORT}`, changeOrigin: true, configure: explainProxyErrors },
    },
  },
  build: {
    outDir: 'dist',
  },
});
