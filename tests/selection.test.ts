import test from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { persistentStore } from '../server/snapshot-file.js';
import { persistentGraphStore } from '../server/graph/persistence.js';
import { DocumentState } from '../web/bridge/document-state.js';
import { HostDocuments } from '../web/bridge/host-documents.js';
import { snapshotSchema } from '../shared/dialogue.js';
import { graphSnapshotSchema } from '../shared/graph/schema.js';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createMcpServer } from '../server/mcp.js';
import { DialogueStore } from '../server/dialogue-store.js';
import { GraphStore } from '../server/graph/store.js';
import {
  documentSelectionKey,
  documentSelectionSchema,
  documentStoreEpochKey,
  documentStoreEpochSchema,
} from '../shared/document-selection.js';

test('only opening tools select documents; selection order survives per-request MCP servers', async () => {
  const store = new DialogueStore();
  const graphs = new GraphStore();
  async function call(name: string, args: Record<string, unknown> = {}) {
    const server = createMcpServer(store, graphs);
    const client = new Client({ name: 'selection-protocol-test', version: '1' });
    const [ct, st] = InMemoryTransport.createLinkedPair();
    await server.connect(st);
    await client.connect(ct);
    try {
      return await client.callTool({ name, arguments: args });
    } finally {
      await client.close();
      await server.close();
    }
  }
  for (const graph of [false, true]) {
    const opened = await call(graph ? 'open_graph_dialogue' : 'open_dialogue');
    const first = documentSelectionSchema.parse(opened._meta?.[documentSelectionKey]);
    assert.equal(first.sequence, 1);
    const next = await call(graph ? 'open_graph_dialogue' : 'open_dialogue');
    const second = documentSelectionSchema.parse(next._meta?.[documentSelectionKey]);
    assert.equal(second.epoch, first.epoch);
    assert.equal(second.sequence, 2);
    assert.notEqual(second.documentId, first.documentId);
    const read = await call(graph ? 'get_graph_dialogue' : 'get_dialogue', {
      documentId: first.documentId,
    });
    assert.equal(read._meta?.[documentSelectionKey], undefined);
    assert.equal(documentStoreEpochSchema.parse(read._meta?.[documentStoreEpochKey]), first.epoch);
    if (graph) {
      const reopened = await call('open_graph_dialogue', { documentId: first.documentId });
      const third = documentSelectionSchema.parse(reopened._meta?.[documentSelectionKey]);
      assert.equal(third.documentId, first.documentId);
      assert.equal(third.sequence, 3);
    }
  }
});

for (const graph of [false, true]) {
  test(`${graph ? 'graph' : 'comparison'} rejects a delayed opening from before a persisted-store restart`, async (t) => {
    const dir = await mkdtemp(join(tmpdir(), 'mdx-selection-restart-'));
    t.after(() => rm(dir, { recursive: true, force: true }));
    const comparisons = join(dir, 'comparisons.json'),
      graphs = join(dir, 'graphs.json');
    let store = persistentStore(comparisons),
      graphStore = persistentGraphStore(graphs);
    async function call(name: string, args: Record<string, unknown> = {}) {
      const server = createMcpServer(store, graphStore);
      const client = new Client({ name: 'restart-order-test', version: '1' });
      const [ct, st] = InMemoryTransport.createLinkedPair();
      await server.connect(st);
      await client.connect(ct);
      try {
        return await client.callTool({ name, arguments: args });
      } finally {
        await client.close();
        await server.close();
      }
    }
    const parse = (result: Record<string, unknown>) =>
      graph
        ? graphSnapshotSchema.parse(result.structuredContent).graphDialogue
        : snapshotSchema.parse(result.structuredContent).dialogue;
    const open = graph ? 'open_graph_dialogue' : 'open_dialogue';
    const get = graph ? 'get_graph_dialogue' : 'get_dialogue';
    const held = await call(open);
    store = persistentStore(comparisons);
    graphStore = persistentGraphStore(graphs);
    const recent = await call(open);
    const state = new DocumentState<ReturnType<typeof parse>>();
    const host = new HostDocuments(state, async (documentId) => {
      const result = await call(get, { documentId });
      return {
        document: parse(result),
        epoch: documentStoreEpochSchema.parse(result._meta?.[documentStoreEpochKey]),
      };
    });
    await host.receive(parse(recent), recent._meta);
    await host.receive(parse(held), held._meta);
    assert.equal(state.read()!.id, parse(recent).id);
    if (graph) {
      const reopen = await call(open, { documentId: parse(held).id });
      await host.receive(parse(reopen), reopen._meta);
      assert.equal(state.read()!.id, parse(held).id, 'a fresh intentional reopen still works');
    }
  });
}
