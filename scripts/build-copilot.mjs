import { build } from 'esbuild';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const directory = new URL('../dist/copilot/mdx-dialogue/', import.meta.url);
await mkdir(directory, { recursive: true });
await build({
  absWorkingDir: fileURLToPath(new URL('../', import.meta.url)),
  entryPoints: ['copilot/extension.mjs'],
  outfile: fileURLToPath(new URL('extension.mjs', directory)),
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
      version: JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
        .version,
      private: true,
      type: 'module',
      description: 'Interactive MDX and React Flow documents for GitHub Copilot Canvas.',
    },
    null,
    2,
  ) + '\n',
);
console.log(`Copilot Canvas package: ${fileURLToPath(directory)}`);

await import('./build-notices.mjs');
