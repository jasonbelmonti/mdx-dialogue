import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createMcpServer } from '../server/mcp.js';
import { DialogueStore } from '../server/dialogue-store.js';
import { GraphStore } from '../server/graph/store.js';
import { documentSelectionKey, documentSelectionSchema } from '../shared/document-selection.js';

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
    if (graph) {
      const reopened = await call('open_graph_dialogue', { documentId: first.documentId });
      const third = documentSelectionSchema.parse(reopened._meta?.[documentSelectionKey]);
      assert.equal(third.documentId, first.documentId);
      assert.equal(third.sequence, 3);
    }
  }
});
