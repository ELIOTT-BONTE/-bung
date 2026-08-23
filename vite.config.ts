import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * Cross-origin isolation. wllama's multi-threaded WebAssembly build needs
 * `SharedArrayBuffer`, which browsers only hand out to a cross-origin isolated
 * document. `credentialless` is used rather than `require-corp` so the model
 * download from Hugging Face still succeeds without that host opting in.
 *
 * These are dev/preview-server headers only; static hosts need their own
 * config (see vercel.json and public/_headers).
 */
const crossOriginIsolation = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'credentialless',
};

export default defineConfig({
  // Relative asset paths keep the build portable across GitHub Pages
  // subpaths, Vercel, Netlify and plain local static servers.
  base: './',
  plugins: [react(), tailwindcss()],
  server: { headers: crossOriginIsolation },
  preview: { headers: crossOriginIsolation },
  worker: { format: 'es' },
  optimizeDeps: {
    // Both engines ship their own workers and WebAssembly. Pre-bundling
    // rewrites the URLs they resolve at runtime, so leave them alone.
    exclude: ['@wllama/wllama/esm/index.js', '@mlc-ai/web-llm'],
  },
  build: {
    // Both engines use top-level await and recent WebAssembly features.
    target: 'esnext',
    // The engine chunks are megabytes by nature and are loaded on demand, so
    // the default warning only trains us to ignore it.
    chunkSizeWarningLimit: 8000,
  },
});
