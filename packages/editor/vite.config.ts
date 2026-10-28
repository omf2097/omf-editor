import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  // Relative asset URLs: the built site works from any directory (routing is
  // hash based, so the server needs no rules). VITE_BASE pins an absolute base.
  base: process.env.VITE_BASE ?? './',
  plugins: [vue()],
  build: {
    target: 'es2022',
    // No source maps in the deployed site; the e2e build has none either.
    sourcemap: false,
    // The only remote asset would be a font or icon, and there are none.
    assetsInlineLimit: 0,
    // No inline polyfill script, so a strict CSP works.
    modulePreload: { polyfill: false },
  },
  worker: { format: 'es' },
  server: { port: 5173 },
  preview: { port: 4173 },
});
