import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { webDist, webRoot } from './server/paths.ts';

export default defineConfig({
  root: webRoot,
  plugins: [react()],
  build: {
    outDir: webDist,
    emptyOutDir: true,
  },
});
