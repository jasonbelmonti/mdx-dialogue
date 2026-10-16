import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export function validateRelease(manifest, plugin, canvas, licenseText, tag) {
  if (manifest.name !== '@jasonbelmonti/mdx-dialogue' || manifest.private)
    throw new Error('Expected the public @jasonbelmonti/mdx-dialogue package.');
  if (!/^\d+\.\d+\.\d+-beta\.\d+$/.test(manifest.version))
    throw new Error('This release workflow accepts beta versions only.');
  if (
    manifest.publishConfig?.access !== 'public' ||
    manifest.publishConfig?.tag !== 'next' ||
    manifest.publishConfig?.registry !== 'https://registry.npmjs.org/'
  )
    throw new Error('Beta releases require the public npm registry and next tag.');
  if (tag !== undefined && tag !== `v${manifest.version}`)
    throw new Error('Git release tag must exactly match the package version.');
  if (plugin.version !== manifest.version || canvas.version !== manifest.version)
    throw new Error('Runtime, plugin and Canvas versions must match.');
  if (!['MIT', 'Apache-2.0'].includes(manifest.license) || !licenseText?.trim())
    throw new Error('Publication blocked: choose an open-source license and include LICENSE.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const read = async (path) => JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'));
  validateRelease(
    await read('../package.json'),
    await read('../plugin/plugin.json'),
    await read('../dist/copilot/mdx-dialogue/package.json'),
    await readFile(new URL('../LICENSE', import.meta.url), 'utf8').catch(() => ''),
    process.env.RELEASE_TAG,
  );
  console.log('Release metadata validated. No publication performed.');
}
