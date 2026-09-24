import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Frontend dev server runs on 4200 (kept clear of your 5173/3000/3333/8000).
// The backend API + uploaded files live on 4300 and are proxied through here
// so the app is reachable from a single origin during development.
const API_PORT = process.env.API_PORT || 4300;

export default defineConfig({
  plugins: [react()],
  server: {
    port: 4200,
    strictPort: true,
    proxy: {
      // 127.0.0.1, not "localhost": the API listens on IPv4 loopback only, and
      // "localhost" may resolve to ::1 first.
      '/api': { target: `http://127.0.0.1:${API_PORT}`, changeOrigin: true },
      '/data': { target: `http://127.0.0.1:${API_PORT}`, changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist',
  },
});
