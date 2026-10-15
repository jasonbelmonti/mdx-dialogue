import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { DocumentState } from '../web/bridge/document-state.js';
import { HostDocuments } from '../web/bridge/host-documents.js';
import { documentSelectionKey } from '../shared/document-selection.js';

type Doc = { id: string; revision: number; submissions: string[] };
const a = () => ({ id: randomUUID(), revision: 1, submissions: [] as string[] });
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
const select = (doc: Doc, epoch: string, sequence: number) => ({
  [documentSelectionKey]: { documentId: doc.id, epoch, sequence },
});

test('late polls and host pushes cannot reopen a previous document, including replayed open results', async () => {
  const state = new DocumentState<Doc>();
  const first = a(),
    second = a(),
    epoch = randomUUID();
  const stored = new Map<string, Doc>([
    [first.id, first],
    [second.id, second],
  ]);
  const host = new HostDocuments(state, async (id) => stored.get(id)!);
  await host.receive(first, select(first, epoch, 1));
  const oldRead = state.request(first.id);
  await host.receive(second, select(second, epoch, 2));
  await host.receive(first);
  await host.receive(first, select(first, epoch, 1));
  assert.deepEqual(state.accept(first, oldRead), second);
  assert.deepEqual(state.read(), second);
  assert.throws(() => state.request(first.id), /changed/);
  // An intentional reopen remains supported and is distinguishable from an old notification.
  await host.receive(first, select(first, epoch, 3));
  assert.deepEqual(state.read(), first);
});

test('same-revision stale host payloads cannot erase an accepted pending submission', async () => {
  const state = new DocumentState<Doc>();
  const initial = a();
  let saved = initial;
  const host = new HostDocuments(state, async () => saved);
  await host.receive(initial);
  saved = { ...initial, submissions: ['accepted-pending-request'] };
  await host.save(initial.id, async () => saved);
  await host.receive(initial);
  assert.deepEqual(state.read(), saved);
  assert.equal(state.read()!.submissions.length, 1);
  saved = { ...saved, revision: 2 };
  await host.receive(saved);
  assert.equal(state.read()!.revision, 2);
});

test('notification reads wait for in-flight saves and cannot invalidate the save acknowledgment', async () => {
  const state = new DocumentState<Doc>();
  const initial = a();
  let saved = initial;
  let reads = 0;
  const host = new HostDocuments(state, async () => {
    reads++;
    return saved;
  });
  await host.receive(initial);
  const operation = deferred<Doc>();
  const save = host.save(initial.id, () => operation.promise);
  const notification = host.receive(initial);
  await Promise.resolve();
  assert.equal(reads, 1);
  saved = { ...initial, submissions: ['pending'] };
  operation.resolve(saved);
  await Promise.all([save, notification]);
  assert.deepEqual(state.read(), saved);
  assert.equal(reads, 2);
});

test('failed saves release notification reads; older revisions and superseded reads cannot publish', async () => {
  const state = new DocumentState<Doc>();
  const doc = { ...a(), revision: 2 };
  const host = new HostDocuments(state, async () => doc);
  await host.receive(doc);
  const operation = deferred<Doc>();
  const save = host.save(doc.id, () => operation.promise);
  const failed = assert.rejects(save, /Disk unavailable/);
  const notification = host.receive(doc);
  operation.reject(new Error('Disk unavailable'));
  await Promise.all([failed, notification]);
  const oldRead = state.request(doc.id);
  const latestRead = state.request(doc.id);
  state.accept({ ...doc, revision: 3 }, latestRead);
  assert.equal(state.accept(doc, oldRead).revision, 3);
  assert.equal(state.accept(doc, state.request(doc.id)).revision, 3);
  assert.throws(() => state.accept(a(), state.request(doc.id)), /different/);
});

test('a delayed old selection cannot invalidate a newer selection load', async () => {
  const state = new DocumentState<Doc>();
  const first = a(),
    second = a(),
    epoch = randomUUID();
  const pending = deferred<Doc>();
  const host = new HostDocuments(state, async (id) => (id === first.id ? first : pending.promise));
  await host.receive(first, select(first, epoch, 1));
  const openSecond = host.receive(second, select(second, epoch, 2));
  await host.receive(first, select(first, epoch, 1));
  pending.resolve(second);
  await openSecond;
  assert.deepEqual(state.read(), second);
});

test('a refresh started immediately before a save cannot invalidate the accepted write', async () => {
  const state = new DocumentState<Doc>();
  const initial = a();
  let saved = initial;
  const host = new HostDocuments(state, async () => saved);
  await host.receive(initial);
  const read = host.refresh(initial.id);
  const write = host.save(initial.id, async () => {
    saved = { ...initial, submissions: ['pending'] };
    return saved;
  });
  await Promise.all([read, write]);
  assert.deepEqual(state.read(), saved);
  assert.equal(state.read()!.submissions.length, 1);
});

test('replaying the current selection retries a failed read without selecting an older document', async () => {
  const state = new DocumentState<Doc>();
  const doc = a(),
    epoch = randomUUID();
  let unavailable = true;
  const host = new HostDocuments(state, async () => {
    if (unavailable) throw new Error('Transport unavailable');
    return doc;
  });
  const intent = select(doc, epoch, 1);
  await assert.rejects(host.receive(doc, intent), /Transport unavailable/);
  unavailable = false;
  await host.receive(doc, intent);
  assert.deepEqual(state.read(), doc);
});
