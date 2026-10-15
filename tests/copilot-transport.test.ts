import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createCanvasTransport } from '../web/copilot/transport.js';

test('Canvas transport binds its first document and rejects later responses for another document', async (t) => {
  const original = { id: randomUUID(), revision: 1, content: null, submissions: [] };
  let response = original;
  t.mock.method(globalThis, 'fetch', async () => Response.json(response));
  const transport = createCanvasTransport('test-capability');
  try {
    await new Promise<void>((resolve, reject) => {
      const unsubscribe = transport.subscribe(() => {
        unsubscribe();
        const error = transport.connectionError();
        if (error) reject(new Error(error));
        else resolve();
      });
    });
    assert.deepEqual(transport.snapshot(), original);
    response = { ...original, revision: 2 };
    assert.equal((await transport.refresh(original.id)).revision, 2);
    response = { ...original, id: randomUUID() };
    await assert.rejects(transport.refresh(original.id), /different document/);
    assert.equal(transport.snapshot()?.id, original.id);
    assert.equal(transport.snapshot()?.revision, 2);
    await assert.rejects(transport.refresh(response.id), /selected document changed/);
  } finally {
    transport.close();
  }
});
