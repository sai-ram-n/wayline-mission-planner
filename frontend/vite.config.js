import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// version.js lives at the repo root and is the single source of truth for the
// app version, so it is aliased in and the root is added to the fs allow-list.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@version': fileURLToPath(new URL('../version.js', import.meta.url)),
    },
  },
  server: {
    // Bind IPv4 loopback explicitly: with only the default binding, Vite can end
    // up listening on [::1] alone and browsers that resolve localhost to
    // 127.0.0.1 then fail to connect. Set VITE_HOST to expose it more widely
    // (e.g. 0.0.0.0 when the browser lives outside this host's network namespace).
    host: process.env.VITE_HOST || '127.0.0.1',
    port: 5173,
    fs: { allow: ['..'] },
    proxy: {
      '/api': { target: 'http://localhost:3001', changeOrigin: true },
    },
  },
});
