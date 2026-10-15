import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readdir, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { runStructuredCodex } from '../server/codex-process.js';

test('runner rejects stdout overflow even when the child handles termination with exit zero', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'mdx-runner-'));
  const cwd = process.cwd();
  const bin = process.env.CODEX_BIN;
  t.after(async () => {
    process.chdir(cwd);
    if (bin === undefined) delete process.env.CODEX_BIN;
    else process.env.CODEX_BIN = bin;
    await rm(dir, { recursive: true, force: true });
  });
  const script = join(dir, 'codex');
  await writeFile(
    script,
    `#!${process.execPath}\nconst fs = require('node:fs');\nfs.writeFileSync(process.argv[process.argv.indexOf('--output-last-message') + 1], '{"ok":true}');\nprocess.on('SIGTERM', () => process.exit(0));\nprocess.stdout.write('x'.repeat(2100000));\nsetTimeout(() => process.exit(0), 200);\n`,
    { mode: 0o700 },
  );
  process.env.CODEX_BIN = script;
  process.chdir(dir);
  const id = randomUUID();
  await assert.rejects(
    runStructuredCodex(
      'Test',
      {},
      { documentId: randomUUID(), submission: { submissionId: id, revision: 1 } },
      (raw) => raw,
    ),
    /output.*limit/i,
  );
  const [attempt] = await readdir(join(dir, '.data/runs', id));
  const attemptDir = join(dir, '.data/runs', id, attempt);
  assert.ok((await stat(join(attemptDir, 'events.jsonl'))).size <= 2_000_000);
  assert.equal((await stat(join(attemptDir, 'request.json'))).mode & 0o777, 0o600);
  assert.ok((await readFile(join(attemptDir, 'request.json'), 'utf8')).includes('Test'));
});

test('successful exit still requires a bounded valid response and tolerates non-event stdout', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'mdx-result-'));
  const cwd = process.cwd();
  const bin = process.env.CODEX_BIN;
  t.after(async () => {
    process.chdir(cwd);
    if (bin === undefined) delete process.env.CODEX_BIN;
    else process.env.CODEX_BIN = bin;
    await rm(dir, { recursive: true, force: true });
  });
  const script = join(dir, 'codex');
  process.env.CODEX_BIN = script;
  process.chdir(dir);
  const run = async (body: string) => {
    await writeFile(
      script,
      `#!${process.execPath}\nconst fs = require('node:fs');\nconst path = process.argv[process.argv.indexOf('--output-last-message') + 1];\n${body}\n`,
      { mode: 0o700 },
    );
    return runStructuredCodex(
      'Test',
      {},
      { documentId: randomUUID(), submission: { submissionId: randomUUID(), revision: 1 } },
      (raw) => raw,
    );
  };
  assert.deepEqual(
    await run(`fs.writeFileSync(path, '{"ok":true}'); console.log('null\\n{"type":"done"}');`),
    { ok: true },
  );
  await assert.rejects(run(`fs.writeFileSync(path, 'x'.repeat(2000001));`), /response.*limit/i);
  await assert.rejects(run(`fs.writeFileSync(path, '{invalid');`), /JSON|property name/i);
  await assert.rejects(
    run(`process.stderr.write('controlled failure'); process.exit(2);`),
    /status 2/,
  );
});
