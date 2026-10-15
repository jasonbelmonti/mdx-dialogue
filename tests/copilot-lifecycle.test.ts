import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CanvasDocuments } from '../server/copilot/documents.js';

const identity = { sessionId: 'lifecycle-session', instanceId: 'one' };
const reply = {
  title: 'Restored conversation',
  summary: 'The same document remains writable.',
  mdx: '<FlowGraph id="view" data="loop" interaction="discuss" />',
  graphs: [
    {
      id: 'loop',
      title: 'Loop',
      edges: [],
      nodes: [{ id: 'one', label: 'One', description: 'Ready to continue.', kind: 'concept' }],
    },
  ],
};

for (const completedBeforeFailure of [false, true]) {
  test(`close/reopen preserves the writer during delivery ${completedBeforeFailure ? 'after a reply' : 'failure and retry'}`, async () => {
    const directory = mkdtempSync(join(tmpdir(), 'mdx-canvas-lifecycle-'));
    let rejectDelivery!: (error: Error) => void;
    const pending = new Promise<string>((_, reject) => {
      rejectDelivery = reject;
    });
    let settled: Promise<unknown> | undefined;
    let sends = 0;
    const documents = new CanvasDocuments(directory, () => ({
      sessionId: identity.sessionId,
      send: () => (++sends === 1 ? pending : Promise.resolve('sent')),
    }));
    try {
      const oldToken = documents.open(identity).token;
      const input = {
        documentId: documents.read(identity).id,
        revision: 1,
        submissionId: randomUUID(),
        annotation: 'Continue this saved conversation.',
        target: null,
      };
      settled = documents.submit(identity, input).then(
        () => undefined,
        (error) => error,
      );
      documents.close(identity);
      assert.throws(() => documents.authorize(oldToken), /expired/);
      assert.throws(() => documents.read(identity), /Open this Canvas/);
      const reopenedToken = documents.open(identity).token;
      assert.notEqual(reopenedToken, oldToken);
      assert.throws(() => documents.authorize(oldToken), /expired/);
      assert.equal(documents.authorize(reopenedToken).documentId, input.documentId);
      if (completedBeforeFailure) documents.respond(identity, input.submissionId, reply);
      rejectDelivery(new Error('host unavailable'));
      const error = await settled;
      if (completedBeforeFailure) assert.equal(error, undefined);
      else assert.match(String(error), /host unavailable/);
      if (!completedBeforeFailure) {
        assert.equal(documents.read(identity).submissions[0].status, 'failed');
        await documents.submit(identity, input);
        assert.equal(sends, 2);
        documents.respond(identity, input.submissionId, reply);
      }
      assert.equal(documents.read(identity).revision, 2);
      assert.equal(documents.read(identity).submissions.length, 1);
      assert.equal(documents.read(identity).submissions[0].status, 'complete');
      documents.close(identity);
      documents.open(identity);
      assert.equal(documents.read(identity).id, input.documentId);
      assert.equal(documents.read(identity).revision, 2);
      assert.deepEqual(documents.read(identity).content, reply);
    } finally {
      rejectDelivery(new Error('Test cleanup'));
      await settled;
      rmSync(directory, { recursive: true, force: true });
    }
  });
}
