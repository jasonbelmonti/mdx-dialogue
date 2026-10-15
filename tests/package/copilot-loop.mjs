import assert from 'node:assert/strict';
import { copyFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export function runCopilotLoop(directory, extension) {
  copyFileSync(new URL('../fixtures/copilot-sdk.mjs', import.meta.url), join(directory, 'sdk.mjs'));
  writeFileSync(
    join(directory, 'loader.mjs'),
    `export async function resolve(s,c,next) {
    return s === '@github/copilot-sdk/extension' ? {url:new URL('./sdk.mjs',import.meta.url).href,shortCircuit:true} : next(s,c);
  }`,
  );
  writeFileSync(
    join(directory, 'bootstrap.mjs'),
    `import {register} from 'node:module';
    register('./loader.mjs', import.meta.url);
    await import(${JSON.stringify(pathToFileURL(join(extension, 'extension.mjs')).href)});`,
  );
  const run = spawnSync(process.execPath, [join(directory, 'bootstrap.mjs')], {
    cwd: directory,
    encoding: 'utf8',
    timeout: 15000,
    env: {
      ...process.env,
      SESSION_ID: 'isolated-host',
      MDX_DIALOGUE_DATA_DIR: join(directory, 'canvas-data'),
    },
  });
  assert.equal(run.status, 0, `${run.error ?? ''}\n${run.stderr}`);
  assert.match(run.stdout, /PACKAGED_LOOP_PASS/);
}
