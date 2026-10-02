import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import mdx from '@mdx-js/rollup';
import { viteSingleFile } from 'vite-plugin-singlefile';
export default defineConfig({
  plugins: [mdx({ providerImportSource: '@mdx-js/react' }), react(), viteSingleFile()],
  build: { outDir: 'dist/widget', emptyOutDir: true, rollupOptions: { input: 'widget.html' } },
});
