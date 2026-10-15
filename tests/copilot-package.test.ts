import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

test('relocated Canvas package joins a host session and runs the graph loop without repository dependencies', () => {
  const directory = mkdtempSync(join(tmpdir(), 'mdx-package-'));
  try {
    cpSync(resolve('dist/copilot/mdx-dialogue'), join(directory, 'extension'), { recursive: true });
    writeFileSync(
      join(directory, 'loader.mjs'),
      `export async function resolve(s,c,next) {
      return s === '@github/copilot-sdk/extension' ? { url: new URL('./sdk.mjs', import.meta.url).href, shortCircuit: true } : next(s,c);
    }`,
    );
    writeFileSync(
      join(directory, 'sdk.mjs'),
      `
      import assert from 'node:assert/strict';
      import { randomUUID } from 'node:crypto';
      export const createCanvas = options => options;
      export async function joinSession({canvases}) {
        assert.equal(canvases.length, 1);
        const canvas = canvases[0];
        const ctx = { sessionId:'isolated-host', instanceId:'one', input:{} };
        // Native Copilot restores panels during registration, before joinSession resolves.
        const url = new URL(canvas.open(ctx).url);
        const before = canvas.actions[0].handler(ctx);
        assert.throws(() => canvas.open({...ctx, sessionId:'another-host'}), /Wrong Copilot session/);
        const reply = {title:'Bundled loop',summary:'Saved',mdx:'<FlowGraph id="view" data="graph" interaction="discuss" />',graphs:[{id:'graph',title:'Graph',nodes:[{id:'one',label:'One',description:'Accepted reply',kind:'concept'}],edges:[]}]};
        setImmediate(async () => {
          try {
            assert.equal(canvas.id, 'mdx-dialogue');
            assert.equal(canvas.open(ctx).url, url.href);
            const page = await fetch(url.origin);
            assert.match(await page.text(), /<html/);
            const input = {documentId:before.id,revision:1,submissionId:randomUUID(),annotation:'Build this graph',target:null};
            const result = await fetch(url.origin+'/annotation', {method:'POST',headers:{Authorization:'Bearer '+url.hash.slice(1),'Content-Type':'application/json'},body:JSON.stringify(input)});
            assert.equal(result.status,200);
            const after = await result.json();
            assert.equal(after.revision,2);
            assert.equal(after.id,before.id);
            assert.equal(after.content.title,'Bundled loop');
            console.log('PACKAGED_LOOP_PASS');
            process.exit(0);
          } catch(e) { console.error(e); process.exit(1); }
        });
        return {sessionId:ctx.sessionId, send:async ({prompt})=>{
          const doc=canvas.actions[0].handler(ctx);
          assert.ok(prompt.includes(doc.submissions[0].submissionId));
          canvas.actions[1].handler({...ctx,input:{submissionId:doc.submissions[0].submissionId,reply}});
          return 'message';
        }};
      }
    `,
    );
    writeFileSync(
      join(directory, 'bootstrap.mjs'),
      `import {register} from 'node:module';
      register('./loader.mjs', import.meta.url); await import('./extension/extension.mjs');`,
    );
    const run = spawnSync(process.execPath, [join(directory, 'bootstrap.mjs')], {
      cwd: directory,
      encoding: 'utf8',
      timeout: 15000,
      env: {
        ...process.env,
        SESSION_ID: 'isolated-host',
        MDX_DIALOGUE_DATA_DIR: join(directory, 'data'),
      },
    });
    assert.equal(run.status, 0, `${run.error ?? ''}\n${run.stderr}`);
    assert.match(run.stdout, /PACKAGED_LOOP_PASS/);
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
