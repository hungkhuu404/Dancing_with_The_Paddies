import { resolve } from 'node:path';
import { defineConfig } from 'vite';

// Two pages: / (3D scene) and /map/ (the map tool, QUOC-1).
export default defineConfig({
  build: {
    rollupOptions: {
      input: { main: resolve(import.meta.dirname, 'index.html'), map: resolve(import.meta.dirname, 'map/index.html') },
    },
  },
});
