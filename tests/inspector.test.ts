import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { importInspector } from '../server/inspector/import.js';
import { GraphStore } from '../server/graph/store.js';
import { entityFragments } from '../shared/inspector/selection.js';
import { inspectorFixture } from './fixtures/inspector.js';

test('snapshot import retains typed links, exact source context and verified checkpoint provenance without blobs', async () => {
  const f = inspectorFixture();
  try {
    const snapshot = await importInspector(f.files);
    assert.deepEqual(snapshot.task.relationships, [
      { id: 'R1', source: 'VAL-1', target: 'TD-SC-1', kind: 'verifies' },
    ]);
    assert.deepEqual(
      entityFragments(snapshot.task, 'VAL-1').map((x) => x.text),
      [f.text.split('\n')[0], f.text.split('\n')[2]],
    );
    assert.equal(snapshot.history.nodes[1].checkpoint?.contextCommit, '2'.repeat(40));
    assert.equal(snapshot.history.nodes[1].checkpoint?.sourceCommit, '3'.repeat(40));
    assert.equal(snapshot.history.source, 'fixture-repository');
    assert.equal(snapshot.history.nodes[1].checkpoint?.runId, 'fixture-run');
    assert.deepEqual(snapshot.history.nodes[1].taskPaths, ['context/task.md']);
    assert.equal(snapshot.history.nodes[1].attribution, undefined);
    assert.equal('blobs' in snapshot.history, false);
  } finally {
    f.remove();
  }
});

test('a task blob must occur in a captured context tree, not only the source inventory', async () => {
  const f = inspectorFixture();
  try {
    const taskFile = f.history.history.nodes[0].files[0];
    for (const node of f.history.history.nodes)
      node.files =
        node.track === 'source'
          ? [taskFile]
          : node.files.filter((file) => file.path !== taskFile.path);
    f.write();
    await assert.rejects(importInspector(f.files), /captured history does not retain/);
  } finally {
    f.remove();
  }
});

test('invalid exports, mismatched bytes and excessive input fail closed', async () => {
  const corruptions = [
    (f: ReturnType<typeof inspectorFixture>) => {
      writeFileSync(f.files.taskFile, f.text + 'changed');
    },
    (f: ReturnType<typeof inspectorFixture>) => {
      f.trace.graph.relationships[0].target = 'missing';
      f.write();
    },
    (f: ReturnType<typeof inspectorFixture>) => {
      f.trace.graph.relationships[0].source.identifier = 'TD-SC-1';
      f.write();
    },
    (f: ReturnType<typeof inspectorFixture>) => {
      f.trace.graph.fragments[0].range.start.offset = 1;
      f.write();
    },
    (f: ReturnType<typeof inspectorFixture>) => {
      f.trace.graph.identifiers.push(f.trace.graph.identifiers[0]);
      f.write();
    },
    (f: ReturnType<typeof inspectorFixture>) => {
      f.trace.validation.status = 'fail';
      f.write();
    },
    (f: ReturnType<typeof inspectorFixture>) => {
      f.history.history.links[0].to = `context:${'9'.repeat(40)}`;
      f.write();
    },
    (f: ReturnType<typeof inspectorFixture>) => {
      f.history.history.nodes[0].oid = '9'.repeat(40);
      f.write();
    },
    (f: ReturnType<typeof inspectorFixture>) => {
      Object.values(f.history.history.blobs)[0].text = 'Different task';
      f.write();
    },
    (f: ReturnType<typeof inspectorFixture>) => {
      Object.values(f.history.history.blobs)[1].text += ' ';
      f.write();
    },
    (f: ReturnType<typeof inspectorFixture>) => {
      writeFileSync(f.files.taskFile, 'x'.repeat(131073));
    },
  ];
  for (const corrupt of corruptions) {
    const f = inspectorFixture();
    try {
      corrupt(f);
      await assert.rejects(importInspector(f.files));
    } finally {
      f.remove();
    }
  }
});

test('source selections are server-resolved, survive exact retry and cannot mutate source snapshots', async () => {
  const f = inspectorFixture();
  try {
    const snapshot = await importInspector(f.files);
    const store = new GraphStore();
    const doc = store.create(undefined, snapshot);
    const input = {
      documentId: doc.id,
      revision: 1,
      submissionId: randomUUID(),
      annotation: 'What proof is required?',
      target: null,
      sourceTarget: { snapshotId: snapshot.id, view: 'relationships' as const, itemId: 'TD-SC-1' },
    };
    assert.throws(
      () =>
        store.submit({
          ...input,
          sourceTarget: { ...input.sourceTarget, snapshotId: randomUUID() },
        }),
      /changed/,
    );
    assert.throws(
      () => store.submit({ ...input, sourceTarget: { ...input.sourceTarget, itemId: 'missing' } }),
      /does not exist/,
    );
    const saved = store.submit({ ...input, sourceContext: 'forged' } as typeof input);
    const context = JSON.parse(saved.submissions[0].sourceContext!);
    assert.equal(context.task.sha256, snapshot.task.sha256);
    assert.equal(context.fragments[0].text, f.text.split('\n')[0]);
    store.begin(doc.id, input.submissionId);
    const restored = new GraphStore([store.read(doc.id)]);
    assert.equal(restored.read(doc.id).submissions[0].status, 'failed');
    restored.submit(input);
    assert.throws(
      () => restored.submit({ ...input, sourceTarget: { ...input.sourceTarget, itemId: 'VAL-1' } }),
      /other input/,
    );
    restored.complete(
      doc.id,
      input.submissionId,
      {
        title: 'Required proof',
        summary: 'A planned verification link.',
        mdx: 'VAL-1 verifies TD-SC-1. Completion is not established.',
        graphs: [],
      },
      'host-model',
    );
    assert.deepEqual(restored.read(doc.id).inspector, snapshot);
    assert.equal(restored.read(doc.id).revision, 2);
    assert.throws(() => restored.submit({ ...input, submissionId: randomUUID() }), /changed/);
    const next = {
      ...input,
      revision: 2,
      submissionId: randomUUID(),
      sourceTarget: {
        snapshotId: snapshot.id,
        view: 'history' as const,
        itemId: snapshot.history.nodes[1].id,
      },
    };
    const historyContext = JSON.parse(restored.submit(next).submissions[1].sourceContext!);
    assert.equal(historyContext.event.checkpoint.contextCommit, '2'.repeat(40));
    assert.equal(historyContext.event.attribution, undefined);
    assert.match(historyContext.boundary, /uncheckpointed/);
    assert.equal(restored.read(doc.id).submissions.length, 2);
  } finally {
    f.remove();
  }
});
