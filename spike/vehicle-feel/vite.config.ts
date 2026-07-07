import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base so the built spike can be served from any static folder.
  base: './',
  build: {
    target: 'es2022',
    // rapier3d-compat inlines its ~2 MB wasm as base64 — silence the size nag.
    chunkSizeWarningLimit: 4096,
  },
});
