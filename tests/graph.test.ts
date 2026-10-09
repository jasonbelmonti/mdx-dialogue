import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { GraphStore } from '../server/graph/store.js';
import type { GraphReply } from '../shared/graph/schema.js';

export const graphReply: GraphReply = {
  title: 'A request lifecycle',
  summary: 'Input produces output.',
  mdx: '# A request lifecycle\n\n<FlowGraph id="overview" data="request" interaction="discuss" />',
  graphs: [
    {
      id: 'request',
      title: 'Request lifecycle',
      nodes: [
        { id: 'input', label: 'Input', description: 'Receive the request.', kind: 'process' },
        { id: 'output', label: 'Output', description: 'Return the result.', kind: 'concept' },
      ],
      edges: [{ id: 'input-output', source: 'input', target: 'output', label: 'produces' }],
    },
  ],
};
const setup = () => {
  const store = new GraphStore();
  const doc = store.create();
  const input = {
    documentId: doc.id,
    revision: 1,
    submissionId: randomUUID(),
    annotation: 'Explain a request.',
    target: null,
  };
  store.submit(input);
  return { store, doc, input };
};
test('node annotation retains identity and rejects duplicate, changed-input and stale updates', () => {
  const { store, doc, input } = setup();
  store.complete(doc.id, input.submissionId, graphReply, 'host-model');
  const selected = {
    ...input,
    revision: 2,
    submissionId: randomUUID(),
    target: { graphId: 'request', nodeId: 'input' },
    annotation: 'Add validation before output.',
  };
  store.submit(selected);
  store.submit(selected);
  assert.equal(store.read(doc.id).submissions.length, 2);
  assert.throws(() => store.submit({ ...selected, annotation: 'different' }), /other input/);
  assert.throws(() => store.submit({ ...selected, submissionId: randomUUID() }), /pending/);
  const revised = structuredClone(graphReply);
  revised.graphs[0].nodes[0].description = 'Validate the request before producing output.';
  store.complete(doc.id, selected.submissionId, revised, 'host-model');
  const result = store.read(doc.id);
  assert.equal(result.id, doc.id);
  assert.equal(result.revision, 3);
  assert.deepEqual(result.submissions[1].target, selected.target);
  assert.equal(result.submissions[1].annotation, selected.annotation);
  assert.throws(
    () => store.complete(doc.id, selected.submissionId, revised, 'host-model'),
    /outdated|completed/,
  );
  assert.throws(() => store.submit({ ...selected, submissionId: randomUUID() }), /changed/);
  assert.throws(
    () =>
      store.submit({
        ...selected,
        revision: 3,
        submissionId: randomUUID(),
        target: { graphId: 'request', nodeId: 'missing' },
      }),
    /does not exist/,
  );
});
test('invalid MDX, duplicate IDs and dangling edges never replace accepted graph content', () => {
  const { store, doc, input } = setup();
  store.complete(doc.id, input.submissionId, graphReply, 'host-model');
  const next = { ...input, revision: 2, submissionId: randomUUID() };
  store.submit(next);
  const invalid: GraphReply[] = [
    ...[
      'import X from "x"\n\n' + graphReply.mdx,
      '{globalThis.alert(1)}\n\n' + graphReply.mdx,
      '<FlowGraph id="overview" data={"request"} interaction="discuss" />',
      '<FlowGraph id="overview" data="missing" interaction="discuss" />',
      '<FlowGraph id="overview" data="request" interaction="discuss" onClick="evil" />',
      '<script>evil</script>',
      graphReply.mdx + '\n\n' + graphReply.mdx,
    ].map((mdx) => ({ ...graphReply, mdx })),
  ];
  const duplicate = structuredClone(graphReply);
  duplicate.graphs[0].nodes.push(duplicate.graphs[0].nodes[0]);
  invalid.push(duplicate);
  const dangling = structuredClone(graphReply);
  dangling.graphs[0].edges[0].target = 'missing';
  invalid.push(dangling);
  for (const reply of invalid) {
    assert.throws(() => store.complete(doc.id, next.submissionId, reply, 'host-model'));
    assert.deepEqual(store.read(doc.id).content, graphReply);
    assert.equal(store.read(doc.id).revision, 2);
  }
});
test('failure and restart retain exact graph input for retry; failed persistence does not advance state', () => {
  const { store, doc, input } = setup();
  store.begin(doc.id, input.submissionId);
  const restored = new GraphStore([store.read(doc.id)]);
  assert.equal(restored.submission(doc.id, input.submissionId).status, 'failed');
  assert.equal(restored.submission(doc.id, input.submissionId).annotation, input.annotation);
  restored.begin(doc.id, input.submissionId);
  restored.fail(doc.id, input.submissionId, 'Unavailable');
  assert.equal(restored.read(doc.id).revision, 1);
  restored.begin(doc.id, input.submissionId);
  restored.complete(doc.id, input.submissionId, graphReply, 'codex-cli');
  const failing = new GraphStore([store.read(doc.id)], () => {
    throw new Error('Disk full');
  });
  assert.throws(
    () => failing.complete(doc.id, input.submissionId, graphReply, 'host-model'),
    /Disk full/,
  );
  assert.equal(failing.read(doc.id).revision, 1);
  assert.equal(failing.read(doc.id).content, null);
});
