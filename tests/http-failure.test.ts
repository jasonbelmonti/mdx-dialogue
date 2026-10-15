import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { DialogueStore } from '../server/dialogue-store.js';
import { GraphStore } from '../server/graph/store.js';
import { createHttpApp } from '../server/http.js';
import { registerGraphRoutes } from '../server/graph/http.js';

for (const graph of [false, true]) {
  test(`${graph ? 'graph' : 'comparison'} jobs settle synchronous runner and failure-save exceptions`, async (t) => {
    let rejectSave = false;
    const save = () => {
      if (rejectSave) throw new Error('Disk unavailable');
    };
    const store = graph ? new GraphStore([], save) : new DialogueStore([], save);
    const create = () => {
      const doc = store.create();
      const input = {
        documentId: doc.id,
        revision: 1,
        submissionId: randomUUID(),
        annotation: 'Test failure',
        selectedId: 'split' as const,
        target: null,
      };
      store.submit(input);
      return input;
    };
    const first = create();
    const second = create();
    const third = create();
    let calls = 0;
    const runner = () => {
      calls++;
      if (calls === 2) rejectSave = true;
      throw new Error('Controlled synchronous failure');
    };
    const listener = createServer();
    await new Promise<void>((resolve) => listener.listen(0, '127.0.0.1', resolve));
    t.after(
      () =>
        new Promise<void>((resolve, reject) => listener.close((e) => (e ? reject(e) : resolve()))),
    );
    const address = listener.address();
    assert.ok(address && typeof address !== 'string');
    const origin = `http://127.0.0.1:${address.port}`;
    if (graph) {
      const app = express();
      app.use(express.json());
      registerGraphRoutes(app, store as GraphStore, runner);
      listener.on('request', app);
    } else listener.on('request', createHttpApp(store as DialogueStore, origin, runner));
    const post = async (input: typeof first) => {
      const res = await fetch(origin + (graph ? '/api/graphs/respond' : '/api/respond'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...input, message: {}, context: {} }),
      });
      await res.text();
      await new Promise((resolve) => setImmediate(resolve));
      return res.status;
    };
    assert.equal(await post(first), 202);
    assert.equal(store.submission(first.documentId, first.submissionId).status, 'failed');
    const logged: unknown[][] = [];
    const log = t.mock.method(console, 'error', (...args: unknown[]) => logged.push(args));
    assert.equal(await post(second), 202);
    assert.equal(store.submission(second.documentId, second.submissionId).status, 'running');
    assert.equal(logged.length, 1);
    log.mock.restore();
    rejectSave = false;
    assert.equal(await post(third), 202);
    assert.equal(calls, 3);
    assert.equal(store.submission(third.documentId, third.submissionId).status, 'failed');
  });
}
