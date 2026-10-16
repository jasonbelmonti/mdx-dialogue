import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

import { runCopilotLoop } from './package/copilot-loop.mjs';

test('relocated Canvas package joins a host session and runs the graph loop without repository dependencies', () => {
  const directory = mkdtempSync(join(tmpdir(), 'mdx-package-'));
  try {
    const extension = join(directory, 'extension');
    cpSync(resolve('dist/copilot/mdx-dialogue'), extension, { recursive: true });
    runCopilotLoop(directory, extension);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('local installer produces a relocatable extension and refuses to overwrite an existing install', () => {
  const project = mkdtempSync(join(tmpdir(), 'mdx-install-'));
  try {
    const command = [resolve('scripts/install-copilot.mjs'), `--project=${project}`];
    const first = spawnSync(process.execPath, command, { encoding: 'utf8' });
    assert.equal(first.status, 0, first.stderr);
    const entry = join(project, '.github/extensions/mdx-dialogue/extension.mjs');
    const bytes = readFileSync(entry);
    const second = spawnSync(process.execPath, command, { encoding: 'utf8' });
    assert.notEqual(second.status, 0);
    assert.deepEqual(readFileSync(entry), bytes);
    assert.match(
      readFileSync(join(project, '.github/extensions/mdx-dialogue/package.json'), 'utf8'),
      /mdx-dialogue-canvas/,
    );
  } finally {
    rmSync(project, { recursive: true, force: true });
  }
});
