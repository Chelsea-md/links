import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dashboard lives under /admin on the same domain as the short links.
export default defineConfig({
  root: 'web',
  base: '/admin/',
  plugins: [react()],
  build: {
    outDir: '../dist/admin',
    emptyOutDir: true,
  },
  server: {
    // `npm run dev:web` proxies the API to a running `wrangler dev`
    proxy: { '/api': 'http://localhost:8787' },
  },
});
