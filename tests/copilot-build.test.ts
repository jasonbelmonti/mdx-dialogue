import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

test('Canvas builds and installs from a checkout with URL-encoded path characters', () => {
  const directory = mkdtempSync(join(tmpdir(), 'mdx-build-path-'));
  const checkout = join(directory, 'checkout with spaces # café %');
  try {
    mkdirSync(checkout);
    for (const path of [
      'copilot',
      'server',
      'shared',
      'scripts',
      'cli',
      'package.json',
      'dist/copilot-ui',
    ])
      cpSync(resolve(path), join(checkout, path), { recursive: true });
    symlinkSync(resolve('node_modules'), join(checkout, 'node_modules'), 'dir');
    const build = spawnSync(process.execPath, ['scripts/build-copilot.mjs'], {
      cwd: checkout,
      encoding: 'utf8',
      timeout: 15000,
    });
    assert.equal(build.status, 0, `${build.error ?? ''}\n${build.stderr}`);
    const project = join(directory, 'target project');
    const install = spawnSync(
      process.execPath,
      ['scripts/install-copilot.mjs', `--project=${project}`],
      { cwd: checkout, encoding: 'utf8', timeout: 15000 },
    );
    assert.equal(install.status, 0, `${install.error ?? ''}\n${install.stderr}`);
    for (const name of ['extension.mjs', 'canvas.html', 'package.json']) {
      const built = readFileSync(join(checkout, 'dist/copilot/mdx-dialogue', name));
      assert.ok(built.length > 0);
      assert.deepEqual(readFileSync(join(project, '.github/extensions/mdx-dialogue', name)), built);
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
