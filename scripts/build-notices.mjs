import { readdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Include the installed build dependency notices as well as runtime notices:
// the frontend and Canvas bundles contain transitive code from both sets.
const root = fileURLToPath(new URL('../', import.meta.url));
const notices = new Map();
async function collect(modules) {
  const entries = await readdir(modules, { withFileTypes: true }).catch((error) => {
    if (error.code === 'ENOENT') return [];
    throw error;
  });
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    const path = join(modules, entry.name);
    if (entry.name.startsWith('@')) {
      await collect(path);
      continue;
    }
    const manifest = JSON.parse(await readFile(join(path, 'package.json'), 'utf8'));
    const identity = `${manifest.name}@${manifest.version}`;
    if (!notices.has(identity)) {
      const names = (await readdir(path))
        .filter((name) => /^(licen[cs]e|copying|notice)([.-].*)?$/i.test(name))
        .sort();
      const contents = [];
      for (const name of names) {
        try {
          contents.push(`${name}\n${await readFile(join(path, name), 'utf8')}`);
        } catch (error) {
          if (error.code !== 'EISDIR') throw error;
        }
      }
      notices.set(
        identity,
        `${identity}\nDeclared license: ${JSON.stringify(manifest.license ?? manifest.licenses ?? 'See upstream package')}\n${contents.join('\n\n')}`,
      );
    }
    await collect(join(path, 'node_modules'));
  }
}
await collect(join(root, 'node_modules'));
const destination = join(root, 'dist/THIRD_PARTY_NOTICES.txt');
await writeFile(
  destination,
  'MDX Dialogue third-party notices\nIncludes installed runtime and build dependencies. Some packages are build-time only.\n\n' +
    [...notices]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, text]) => text)
      .join('\n\n--------------------\n\n'),
);
await copyFile(destination, join(root, 'dist/copilot/mdx-dialogue/THIRD_PARTY_NOTICES.txt'));
console.log(`Collected third-party notices for ${notices.size} dependency versions.`);
