import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { GraphStore } from '../server/graph/store.js';
import { importInspector } from '../server/inspector/import.js';
import { inspectorFixture } from './fixtures/inspector.js';
import { matchesRequest, prepareRequest, type GraphDraft } from '../web/graph/request.js';

test('a rejected large selection can be replaced with the edited question and smaller selection', async () => {
  const fixture = inspectorFixture('Evidence '.repeat(6000));
  try {
    const snapshot = await importInspector(fixture.files);
    const store = new GraphStore();
    const doc = store.create(undefined, snapshot);
    const draft: GraphDraft = {
      annotation: 'Explain the validation',
      target: null,
      sourceTarget: { snapshotId: snapshot.id, view: 'relationships', itemId: 'VAL-1' },
    };
    const refresh = async (id: string) => store.read(id);
    const rejected = await prepareRequest(doc, draft, null, false, refresh);
    assert.throws(() => store.submit(rejected), /exceeds 48 KB/);
    assert.equal(store.read(doc.id).submissions.length, 0);
    assert.equal(matchesRequest(doc, draft, rejected), true);
    const smaller: GraphDraft = {
      ...draft,
      sourceTarget: { ...draft.sourceTarget!, itemId: 'TD-SC-1' },
    };
    assert.equal(matchesRequest(doc, smaller, rejected), false);
    assert.equal(matchesRequest(doc, { ...draft, annotation: 'A new question' }, rejected), false);
    smaller.annotation = 'Explain the smaller criterion';
    const replacement = await prepareRequest(doc, smaller, rejected, false, refresh);
    assert.notEqual(replacement.submissionId, rejected.submissionId);
    const saved = store.submit(replacement).submissions.at(-1)!;
    assert.equal(saved.sourceTarget?.itemId, 'TD-SC-1');
    assert.equal(saved.annotation, smaller.annotation);
    assert.ok(Buffer.byteLength(saved.sourceContext!) < 48000);
    assert.equal(rejected.sourceTarget?.itemId, 'VAL-1');
  } finally {
    fixture.remove();
  }
});

test('uncertain saved delivery blocks replacement but preserves exact retry and current revisions', async () => {
  const store = new GraphStore();
  const doc = store.create();
  const previous = {
    documentId: doc.id,
    revision: 1,
    submissionId: randomUUID(),
    annotation: 'Original question',
    target: null,
  };
  store.submit(previous); // The save succeeded, but the client missed the acknowledgment.
  const edited = { annotation: 'Edited question', target: null };
  const refresh = async (id: string) => store.read(id);
  await assert.rejects(prepareRequest(doc, edited, previous, false, refresh), /already pending/);
  const retry = await prepareRequest(doc, edited, previous, true, async () => {
    throw new Error('Exact retry must not depend on a successful refresh.');
  });
  assert.deepEqual(retry, previous);
  assert.equal(store.submit(retry).submissions.length, 1);
  store.complete(
    doc.id,
    previous.submissionId,
    {
      title: 'Answer',
      summary: 'Accepted reply',
      mdx: 'Answer',
      graphs: [],
    },
    'host-model',
  );
  const next = await prepareRequest(doc, edited, previous, false, refresh);
  assert.equal(next.revision, 2);
  assert.equal(store.submit(next).submissions.length, 2);
});

test('an unavailable refresh cannot silently discard the original request', async () => {
  const doc = new GraphStore().create();
  const previous = {
    documentId: doc.id,
    revision: 1,
    submissionId: randomUUID(),
    annotation: 'Original question',
    target: null,
  };
  const original = structuredClone(previous);
  const edited = { annotation: 'Edited question', target: null };
  const offline = async () => {
    throw new Error('Offline');
  };
  await assert.rejects(prepareRequest(doc, edited, previous, false, offline), /Offline/);
  assert.deepEqual(await prepareRequest(doc, edited, previous, true, offline), original);
});
