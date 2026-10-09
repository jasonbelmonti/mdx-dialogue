import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

type RecordInput = {
  documentId: string;
  submission: { submissionId: string; revision: number };
  [key: string]: unknown;
};
export async function runStructuredCodex<T>(
  prompt: string,
  schema: unknown,
  record: RecordInput,
  validate: (raw: unknown) => T,
): Promise<T> {
  const runDir = resolve('.data/runs', record.submission.submissionId, randomUUID());
  await mkdir(runDir, { recursive: true });
  const schemaFile = join(runDir, 'response-schema.json');
  const outputFile = join(runDir, 'response.json');
  await writeFile(schemaFile, JSON.stringify(schema, null, 2));
  const args = [
    'exec',
    '--ignore-user-config',
    '--ephemeral',
    '--sandbox',
    'read-only',
    '--skip-git-repo-check',
    '-c',
    'features.shell_tool=false',
    '-c',
    'features.apps=false',
    '-c',
    'features.multi_agent=false',
    '-c',
    'web_search="disabled"',
    '-c',
    'project_doc_max_bytes=0',
    '--json',
    '--output-schema',
    schemaFile,
    '--output-last-message',
    outputFile,
    '-',
  ];
  await writeFile(
    join(runDir, 'request.json'),
    JSON.stringify({ args, ...record, prompt }, null, 2),
  );
  const startedAt = new Date().toISOString();
  const events = await new Promise<string>((resolveRun, reject) => {
    const child = spawn(process.env.CODEX_BIN ?? 'codex', args, {
      cwd: runDir,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '',
      stderr = '',
      timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
    }, 180_000);
    const forceKill = setTimeout(() => child.kill('SIGKILL'), 185_000);
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
      if (stdout.length > 2_000_000) child.kill('SIGTERM');
    });
    child.stderr.on('data', (chunk) => {
      stderr = (stderr + chunk).slice(-20_000);
    });
    child.on('error', (error) => {
      clearTimeout(timeout);
      clearTimeout(forceKill);
      reject(new Error(`Could not start Codex: ${error.message}`));
    });
    child.on('close', async (code) => {
      clearTimeout(timeout);
      clearTimeout(forceKill);
      try {
        await Promise.all([
          writeFile(join(runDir, 'events.jsonl'), stdout),
          writeFile(join(runDir, 'stderr.log'), stderr),
        ]);
      } catch (error) {
        reject(new Error(`Could not save model attempt evidence: ${String(error)}`));
        return;
      }
      if (timedOut)
        reject(
          new Error(
            'Codex did not respond within three minutes. Your input is saved; retry the response.',
          ),
        );
      else if (code !== 0)
        reject(
          new Error(
            `Codex exited with status ${code}. Check codex login status and ${join(runDir, 'stderr.log')}, then retry.`,
          ),
        );
      else resolveRun(stdout);
    });
    child.stdin.on('error', () => {});
    child.stdin.end(prompt);
  });
  const reply = validate(JSON.parse(await readFile(outputFile, 'utf8')));
  const parsedEvents = events
    .split('\n')
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line)];
      } catch {
        return [];
      }
    });
  await writeFile(
    join(runDir, 'receipt.json'),
    JSON.stringify(
      {
        source: 'codex-cli',
        startedAt,
        completedAt: new Date().toISOString(),
        documentId: record.documentId,
        submissionId: record.submission.submissionId,
        revision: record.submission.revision,
        eventTypes: parsedEvents.map((e) => e.type),
        response: reply,
      },
      null,
      2,
    ),
  );
  return reply;
}
