import { createHash } from 'node:crypto';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const hash = (text: string) => createHash('sha256').update(text).digest('hex');
const blob = (text: string) => ({
  oid: createHash('sha1')
    .update(`blob ${Buffer.byteLength(text)}\0`)
    .update(text)
    .digest('hex'),
  value: { bytes: Buffer.byteLength(text), text, base64: null },
});
export function inspectorFixture(detail = '') {
  const text =
    '# [TD-SC-1](ctx://trace/entity/TD-SC-1?role=definition)\n\n- [Check](ctx://trace/entity/VAL-1?role=definition) verifies [TD-SC-1](ctx://trace/entity/TD-SC-1?rel=verifies)' +
    (detail ? ` ${detail}` : '') +
    '\n';
  const range = (start: number, end: number) => {
    const point = (offset: number) => ({
      offset,
      line: text.slice(0, offset).split('\n').length,
      column: offset - text.lastIndexOf('\n', offset - 1),
    });
    return { start: point(start), end: point(end) };
  };
  const checkStart = text.indexOf('- [Check]');
  const referenceStart = text.lastIndexOf('[TD-SC-1]');
  const trace = {
    validation: {
      status: 'pass',
      valid: true,
      coverage: 'complete',
      sourceSha256: hash(text),
      analysisId: 'a'.repeat(64),
      interpretationHash: 'b'.repeat(64),
      profileId: 'fixture-v1',
      validationHash: 'c'.repeat(64),
    },
    graph: {
      schemaVersion: 'markdown-trace.document-graph.v1',
      analysisId: 'a'.repeat(64),
      source: {
        documentId: 'fixture.md',
        sha256: hash(text),
        utf8Bytes: Buffer.byteLength(text),
        utf16Length: text.length,
      },
      interpretationHash: 'b'.repeat(64),
      parserVersion: '5.0.0',
      coverage: 'complete',
      identifiers: [
        {
          identifier: 'TD-SC-1',
          entityKind: 'criterion',
          definition: { status: 'resolved', occurrenceId: 'O1' },
        },
        {
          identifier: 'VAL-1',
          entityKind: 'validation',
          definition: { status: 'resolved', occurrenceId: 'O2' },
        },
      ],
      occurrences: [
        {
          id: 'O1',
          identifier: 'TD-SC-1',
          role: 'definition',
          range: range(2, text.indexOf('\n')),
          fragmentId: 'F1',
        },
        {
          id: 'O2',
          identifier: 'VAL-1',
          role: 'definition',
          range: range(checkStart + 2, text.indexOf(' verifies')),
          fragmentId: 'F2',
        },
        {
          id: 'O3',
          identifier: 'TD-SC-1',
          role: 'reference',
          range: range(referenceStart, text.indexOf(')', referenceStart) + 1),
          fragmentId: 'F2',
        },
      ],
      fragments: [
        {
          id: 'F1',
          range: range(0, text.indexOf('\n')),
          owner: { status: 'owned', identifier: 'TD-SC-1' },
          structure: 'heading',
          requiredContext: [],
        },
        {
          id: 'F2',
          range: range(checkStart, text.length - 1),
          owner: { status: 'owned', identifier: 'VAL-1' },
          structure: 'list-item',
          requiredContext: ['F1'],
        },
      ],
      relationships: [
        {
          id: 'R1',
          kind: 'verifies',
          source: { status: 'owned', identifier: 'VAL-1' },
          target: 'TD-SC-1',
          occurrenceId: 'O3',
        },
      ],
    },
  };
  const taskBlob = blob(text);
  const record = {
    checkpointId: '10000000-0000-4000-8000-000000000001',
    runId: 'fixture-run',
    inputCapsule: {
      storeId: '10000000-0000-4000-8000-000000000002',
      capsuleCommit: { hex: '1'.repeat(40) },
    },
    source: { commit: { hex: '3'.repeat(40) } },
  };
  const recordBlob = blob(JSON.stringify(record));
  const taskFile = { path: 'context/task.md', oid: taskBlob.oid, kind: 'blob' };
  const history = {
    kind: 'context-capsules-history',
    schemaVersion: 1,
    producer: {
      name: 'context-capsules-runtime',
      version: '0.5.0',
      sourceCommit: '4'.repeat(40),
      sourceTree: '5'.repeat(40),
      sourceDirty: false,
    },
    history: {
      version: 1,
      source: 'fixture-repository',
      capturedAt: '2026-10-16T12:00:00.000Z',
      warnings: [],
      nodes: [
        {
          id: `context:${'1'.repeat(40)}`,
          oid: '1'.repeat(40),
          track: 'context',
          parents: [],
          time: '2026-10-16T10:00:00Z',
          title: 'Prepared task',
          lane: 'inputs',
          kind: 'prepared',
          files: [taskFile],
        },
        {
          id: `context:${'2'.repeat(40)}`,
          oid: '2'.repeat(40),
          track: 'context',
          parents: [`context:${'1'.repeat(40)}`],
          time: '2026-10-16T11:00:00Z',
          title: 'Captured proof',
          lane: 'fixture-run',
          kind: 'checkpoint',
          sourceWorktree: '/example/project/.worktrees/fixture',
          files: [
            taskFile,
            {
              path: `records/checkpoints/${record.checkpointId}.json`,
              oid: recordBlob.oid,
              kind: 'blob',
            },
          ],
        },
        {
          id: `source:${'3'.repeat(40)}`,
          oid: '3'.repeat(40),
          track: 'source',
          parents: [],
          time: '2026-10-16T10:30:00Z',
          title: 'Code change',
          lane: 'source',
          kind: 'commit',
          files: [],
        },
      ],
      links: [
        { from: `source:${'3'.repeat(40)}`, to: `context:${'2'.repeat(40)}`, kind: 'checkpoint' },
      ],
      blobs: { [taskBlob.oid]: taskBlob.value, [recordBlob.oid]: recordBlob.value },
    },
  };
  const directory = mkdtempSync(join(tmpdir(), 'mdx-inspector-'));
  const files = {
    taskFile: join(directory, 'task.md'),
    traceFile: join(directory, 'trace.json'),
    historyFile: join(directory, 'history.json'),
  };
  const write = () => {
    writeFileSync(files.taskFile, text);
    writeFileSync(files.traceFile, JSON.stringify(trace));
    writeFileSync(files.historyFile, JSON.stringify(history));
  };
  write();
  return {
    text,
    trace,
    history,
    files,
    write,
    remove: () => rmSync(directory, { recursive: true, force: true }),
  };
}
