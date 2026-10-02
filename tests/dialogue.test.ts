import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { DialogueStore } from '../server/dialogue-store.js';
import { parseReplyMdx } from '../shared/mdx.js';

const reply = {
  summary: 'Green and compact, as requested.',
  mdx: '# A more compact conversation\n\n<LayoutPreview layout="split" accent="green" density="compact" />\n\nThe controls are closer together.',
};
const setup = () => {
  const store = new DialogueStore();
  const doc = store.create();
  const selection = {
    documentId: doc.id,
    revision: doc.revision,
    submissionId: randomUUID(),
    selectedId: 'split' as const,
    annotation: 'Use green and compact controls.',
  };
  return { store, doc, selection };
};
test('selection identity survives model completion; duplicate and stale responses cannot advance the revision', () => {
  const { store, doc, selection } = setup();
  store.submit(selection);
  store.begin(doc.id, selection.submissionId);
  const result = store.complete(doc.id, selection.submissionId, reply, 'host-model');
  assert.equal(result.revision, 2);
  assert.equal(result.submissions[0].annotation, selection.annotation);
  assert.equal(result.submissions[0].submissionId, selection.submissionId);
  assert.deepEqual(result.submissions[0].reply, reply);
  assert.throws(
    () => store.complete(doc.id, selection.submissionId, reply, 'host-model'),
    /already completed/,
  );
  assert.throws(() => store.submit({ ...selection, submissionId: randomUUID() }), /changed/);
});
test('idempotency preserves exact input and prevents concurrent submissions', () => {
  const { store, doc, selection } = setup();
  store.submit(selection);
  store.submit(selection);
  assert.equal(store.read(doc.id).submissions.length, 1);
  assert.throws(() => store.submit({ ...selection, annotation: 'different' }), /different input/);
  assert.throws(() => store.submit({ ...selection, submissionId: randomUUID() }), /pending/);
});
test('failed model preserves input and can retry without fabricating a new revision', () => {
  const { store, doc, selection } = setup();
  store.submit(selection);
  store.begin(doc.id, selection.submissionId);
  store.fail(doc.id, selection.submissionId, 'Unavailable');
  assert.equal(store.read(doc.id).revision, 1);
  assert.equal(store.submission(doc.id, selection.submissionId).annotation, selection.annotation);
  assert.equal(store.begin(doc.id, selection.submissionId), true);
  assert.equal(store.complete(doc.id, selection.submissionId, reply, 'codex-cli').revision, 2);
});
test('model-authored executable MDX and unregistered components are rejected before state mutation', () => {
  const { store, doc, selection } = setup();
  store.submit(selection);
  for (const mdx of [
    'import X from "x"\n\n' + reply.mdx,
    '{process.exit()}\n\n' + reply.mdx,
    '<script>alert(1)</script>\n\n' + reply.mdx,
    '<LayoutPreview layout={"split"} accent="green" density="compact" />',
    '<LayoutPreview layout="split" accent="green" density="compact" extra="bad" />',
    reply.mdx + '\n\n' + reply.mdx,
  ]) {
    assert.throws(() =>
      store.complete(doc.id, selection.submissionId, { ...reply, mdx }, 'host-model'),
    );
    assert.equal(store.read(doc.id).revision, 1);
  }
  assert.equal(parseReplyMdx(reply.mdx).type, 'root');
});

test('restart restores saved input and marks an interrupted model run retryable', () => {
  const { store, doc, selection } = setup();
  store.submit(selection);
  store.begin(doc.id, selection.submissionId);
  const restored = new DialogueStore([store.read(doc.id)]);
  const saved = restored.submission(doc.id, selection.submissionId);
  assert.equal(saved.status, 'failed');
  assert.equal(saved.annotation, selection.annotation);
  assert.equal(restored.begin(doc.id, selection.submissionId), true);
  assert.equal(restored.complete(doc.id, selection.submissionId, reply, 'codex-cli').revision, 2);
});
