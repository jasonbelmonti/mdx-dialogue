import { defineConfig } from 'vite';
export default defineConfig({
  build: { outDir: 'dist/host', emptyOutDir: true, rollupOptions: { input: 'index.html' } },
});
