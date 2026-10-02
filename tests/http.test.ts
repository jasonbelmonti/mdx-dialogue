import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { DialogueStore } from '../server/dialogue-store.js';
import { createHttpApp } from '../server/http.js';

test('local API rejects foreign origins and preserves selection when the real runner boundary fails', async () => {
  const store = new DialogueStore();
  const doc = store.create();
  const selection = {
    documentId: doc.id,
    revision: 1,
    submissionId: randomUUID(),
    selectedId: 'split' as const,
    annotation: 'Preserve this input.',
  };
  store.submit(selection);
  const listener = createServer();
  await new Promise<void>((resolve) => listener.listen(0, '127.0.0.1', resolve));
  const address = listener.address();
  assert.ok(address && typeof address !== 'string');
  const origin = `http://127.0.0.1:${address.port}`;
  const app = createHttpApp(store, origin, async () => {
    throw new Error('Controlled runner failure');
  });
  listener.on('request', app);
  try {
    const payload = {
      documentId: doc.id,
      submissionId: selection.submissionId,
      message: { role: 'user' },
      context: selection,
    };
    const blocked = await fetch(`${origin}/api/respond`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'https://unrelated.example' },
      body: JSON.stringify(payload),
    });
    assert.equal(blocked.status, 403);
    assert.equal(store.submission(doc.id, selection.submissionId).status, 'awaiting-model');
    const accepted = await fetch(`${origin}/api/respond`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: origin },
      body: JSON.stringify(payload),
    });
    assert.equal(accepted.status, 202);
    await new Promise((resolve) => setImmediate(resolve));
    const saved = store.submission(doc.id, selection.submissionId);
    assert.equal(saved.status, 'failed');
    assert.equal(saved.annotation, selection.annotation);
    assert.equal(saved.error, 'Controlled runner failure');
    assert.equal(store.read(doc.id).revision, 1);
  } finally {
    await new Promise<void>((resolve, reject) =>
      listener.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
