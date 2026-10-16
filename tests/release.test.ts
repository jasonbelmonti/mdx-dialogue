import test from 'node:test';
import assert from 'node:assert/strict';
import { validateRelease } from '../scripts/check-release.mjs';

const manifest = {
  name: '@jasonbelmonti/mdx-dialogue',
  version: '0.1.0-beta.1',
  license: 'MIT',
  publishConfig: { access: 'public', tag: 'next', registry: 'https://registry.npmjs.org/' },
};
const plugin = { version: manifest.version };

test('release guard accepts matching beta metadata and rejects unsafe publication inputs', () => {
  assert.doesNotThrow(() =>
    validateRelease(manifest, plugin, plugin, 'MIT License', 'v0.1.0-beta.1'),
  );
  for (const bad of [
    { ...manifest, private: true },
    { ...manifest, version: '0.1.0' },
    { ...manifest, license: 'UNLICENSED' },
    { ...manifest, publishConfig: { ...manifest.publishConfig, tag: 'latest' } },
    {
      ...manifest,
      publishConfig: { ...manifest.publishConfig, registry: 'https://elsewhere.invalid/' },
    },
  ])
    assert.throws(() => validateRelease(bad, plugin, plugin, 'MIT License', 'v0.1.0-beta.1'));
  assert.throws(() => validateRelease(manifest, plugin, plugin, '', 'v0.1.0-beta.1'), /license/);
  assert.throws(
    () => validateRelease(manifest, plugin, plugin, 'MIT License', 'v0.1.0-beta.2'),
    /tag/,
  );
  assert.throws(
    () => validateRelease(manifest, plugin, { version: '0.1.0' }, 'MIT License', 'v0.1.0-beta.1'),
    /versions/,
  );
});
