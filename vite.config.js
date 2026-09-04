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
      '/api': { target: `http://localhost:${API_PORT}`, changeOrigin: true },
      '/data': { target: `http://localhost:${API_PORT}`, changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist',
  },
});
