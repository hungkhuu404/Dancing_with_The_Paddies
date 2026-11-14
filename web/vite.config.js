import { resolve } from 'node:path';
import { defineConfig } from 'vite';

// Landscape, observation map, hamlet calendar and method reference pages.
export default defineConfig({
  build: {
    rollupOptions: {
      input: { main: resolve(import.meta.dirname, 'index.html'), map: resolve(import.meta.dirname, 'map/index.html'), calendar: resolve(import.meta.dirname, 'calendar/index.html'), method: resolve(import.meta.dirname, 'method/index.html') },
    },
  },
});
