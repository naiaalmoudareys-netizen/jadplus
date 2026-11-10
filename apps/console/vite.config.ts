/**
 * The console's build and local server (ADR 0023). Locally, /api goes to the API on wrangler dev, so the
 * session cookie stays same-origin and the browser's Origin (http://localhost:5173) is the one the API allows
 * (ADR 0022). Production serves the built files with the headers in public/_headers.
 */
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    host: 'localhost',
    port: 5173,
    strictPort: true,
    // changeOrigin stays false: the API must see the console's own Origin header to accept a change.
    proxy: { '/api': { target: 'http://127.0.0.1:8787', changeOrigin: false } },
  },
  build: {
    // No data: URIs for fonts or images: the CSP allows files from this site only.
    assetsInlineLimit: 0,
    sourcemap: false,
  },
});
