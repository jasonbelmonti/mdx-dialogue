import { discardOversizedResponse, readModelResponse } from './model-response.js';
import { runCodexChild } from './codex-child.js';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
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
  await mkdir(runDir, { recursive: true, mode: 0o700 });
  const schemaFile = join(runDir, 'response-schema.json');
  const outputFile = join(runDir, 'response.json');
  await writeFile(schemaFile, JSON.stringify(schema, null, 2), { mode: 0o600 });
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
    { mode: 0o600 },
  );
  const startedAt = new Date().toISOString();
  let events: string;
  try {
    events = await runCodexChild(process.env.CODEX_BIN ?? 'codex', args, runDir, prompt);
  } catch (error) {
    try {
      await discardOversizedResponse(outputFile);
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        `${error instanceof Error ? error.message : String(error)} Oversized-reply cleanup also failed: ${String(cleanupError)}`,
      );
    }
    throw error;
  }
  const reply = validate(await readModelResponse(outputFile));
  const parsedEvents = events
    .split('\n')
    .filter(Boolean)
    .flatMap((line) => {
      try {
        const event = JSON.parse(line);
        return event && typeof event === 'object' && typeof event.type === 'string' ? [event] : [];
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
    { mode: 0o600 },
  );
  return reply;
}
