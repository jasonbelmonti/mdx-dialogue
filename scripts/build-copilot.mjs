import { build } from 'esbuild';
import { copyFile, mkdir, writeFile } from 'node:fs/promises';

const directory = new URL('../dist/copilot/mdx-dialogue/', import.meta.url);
await mkdir(directory, { recursive: true });
await build({
  entryPoints: ['copilot/extension.mjs'],
  outfile: new URL('extension.mjs', directory).pathname,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  external: ['@github/copilot-sdk/extension'],
});
await copyFile(
  new URL('../dist/copilot-ui/copilot-canvas.html', import.meta.url),
  new URL('canvas.html', directory),
);
await writeFile(
  new URL('package.json', directory),
  JSON.stringify(
    {
      name: 'mdx-dialogue-canvas',
      version: '0.1.0',
      private: true,
      type: 'module',
      description: 'Interactive MDX and React Flow documents for GitHub Copilot Canvas.',
    },
    null,
    2,
  ) + '\n',
);
console.log(`Copilot Canvas package: ${directory.pathname}`);
