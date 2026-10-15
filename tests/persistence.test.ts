import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DialogueStore } from '../server/dialogue-store.js';
import { persistentStore } from '../server/snapshot-file.js';
import { persistentGraphStore } from '../server/graph/persistence.js';

const reply = {
  summary: 'Updated.',
  mdx: '<LayoutPreview layout="split" accent="green" density="compact" />',
};
const input = (id: string) => ({
  documentId: id,
  revision: 1,
  submissionId: randomUUID(),
  selectedId: 'split' as const,
  annotation: 'Compact please',
});

test('comparison transitions publish only after a successful save', () => {
  let reject = false;
  let disk: unknown;
  const store = new DialogueStore([], (docs) => {
    if (reject) throw new Error('Disk unavailable');
    disk = structuredClone(docs);
  });
  const doc = store.create();
  const selection = input(doc.id);
  const steps = [
    () => store.submit(selection),
    () => store.begin(doc.id, selection.submissionId),
    () => store.fail(doc.id, selection.submissionId, 'Runner failed'),
    () => store.complete(doc.id, selection.submissionId, reply, 'host-model'),
  ];
  for (const step of steps) {
    const before = store.read(doc.id);
    const saved = structuredClone(disk);
    reject = true;
    assert.throws(step, /Disk unavailable/);
    assert.deepEqual(store.read(doc.id), before);
    assert.deepEqual(disk, saved);
    reject = false;
    step();
  }
});

test('failed create does not leave a ghost document for the next save', () => {
  let reject = true;
  let saved: unknown[] = [];
  const store = new DialogueStore([], (docs) => {
    if (reject) throw new Error('Disk unavailable');
    saved = docs;
  });
  assert.throws(() => store.create(), /Disk unavailable/);
  reject = false;
  store.create();
  assert.equal(saved.length, 1);
});

test('a superseded comparison request cannot resume, fail or complete', () => {
  const store = new DialogueStore();
  const doc = store.create();
  const old = input(doc.id);
  store.submit(old);
  store.fail(doc.id, old.submissionId, 'Try again');
  store.submit(input(doc.id));
  const before = store.read(doc.id);
  for (const action of [
    () => store.begin(doc.id, old.submissionId),
    () => store.fail(doc.id, old.submissionId, 'Late error'),
    () => store.complete(doc.id, old.submissionId, reply, 'host-model'),
  ])
    assert.throws(action, /outdated/);
  assert.deepEqual(store.read(doc.id), before);
});

for (const [name, open] of [
  ['comparison', persistentStore],
  ['graph', persistentGraphStore],
] as const) {
  test(`${name} snapshots reject competing writers without erasing the winning save`, (t) => {
    const dir = mkdtempSync(join(tmpdir(), 'mdx-snapshot-'));
    t.after(() => rmSync(dir, { recursive: true, force: true }));
    const path = join(dir, 'documents.json');
    const first = open(path);
    const second = open(path);
    const doc = first.create();
    const bytes = readFileSync(path, 'utf8');
    assert.throws(() => second.create(), /changed|writer|conflict/i);
    assert.equal(readFileSync(path, 'utf8'), bytes);
    assert.deepEqual(open(path).read(doc.id), doc);
    first.create();
    assert.equal(JSON.parse(readFileSync(path, 'utf8')).length, 2);
  });
}

test('writer lock refuses a save, preserves bytes and permits retry after the owner releases it', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'mdx-lock-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, 'documents.json');
  const store = persistentStore(path);
  const doc = store.create();
  const before = readFileSync(path, 'utf8');
  const selection = input(doc.id);
  writeFileSync(`${path}.lock`, 'controlled writer');
  assert.throws(() => store.submit(selection), /writer lock/);
  assert.equal(readFileSync(path, 'utf8'), before);
  assert.deepEqual(store.read(doc.id), doc);
  unlinkSync(`${path}.lock`);
  store.submit(selection);
  assert.deepEqual(persistentStore(path).read(doc.id), store.read(doc.id));
});

test('malformed snapshots are rejected without replacing their bytes', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'mdx-invalid-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, 'documents.json');
  for (const bytes of ['{bad', '[{"id":"bad"}]']) {
    writeFileSync(path, bytes);
    assert.throws(() => persistentStore(path));
    assert.throws(() => persistentGraphStore(path));
    assert.equal(readFileSync(path, 'utf8'), bytes);
  }
});
