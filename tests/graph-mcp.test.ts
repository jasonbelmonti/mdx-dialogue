import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createMcpServer } from '../server/mcp.js';
import { DialogueStore } from '../server/dialogue-store.js';
import { GraphStore } from '../server/graph/store.js';
import { graphSnapshotSchema } from '../shared/graph/schema.js';

test('MCP graph tools expose a widget and round-trip prompt, node annotation and accepted MDX', async () => {
  const server = createMcpServer(new DialogueStore(), new GraphStore());
  const client = new Client({ name: 'graph-protocol-test', version: '1' });
  const [ct, st] = InMemoryTransport.createLinkedPair();
  await server.connect(st);
  await client.connect(ct);
  try {
    const tools = await client.listTools();
    const open = tools.tools.find((t) => t.name === 'open_graph_dialogue')!;
    const uri = (open._meta?.ui as { resourceUri: string }).resourceUri;
    const resource = await client.readResource({ uri });
    assert.equal(resource.contents[0].mimeType, 'text/html;profile=mcp-app');
    assert.deepEqual(resource.contents[0]._meta?.['openai/ui'], {
      availableDisplayModes: ['fullscreen'],
    });
    for (const legacyUri of [
      'ui://mdx-dialogue/graphs-v1.html',
      'ui://mdx-dialogue/graph-workspace-v4.html',
    ]) {
      assert.notEqual(uri, legacyUri);
      const legacy = await client.readResource({ uri: legacyUri });
      assert.deepEqual(legacy.contents[0]._meta, resource.contents[0]._meta);
      assert.ok('text' in legacy.contents[0] && 'text' in resource.contents[0]);
      assert.equal(legacy.contents[0].text, resource.contents[0].text);
    }
    assert.ok('text' in resource.contents[0] && resource.contents[0].text.includes('react-flow'));
    const doc = graphSnapshotSchema.parse(
      (await client.callTool({ name: 'open_graph_dialogue', arguments: {} })).structuredContent,
    ).graphDialogue;
    const input = {
      documentId: doc.id,
      revision: 1,
      submissionId: randomUUID(),
      annotation: 'Explain clouds.',
      target: null,
    };
    const saved = await client.callTool({ name: 'submit_graph_annotation', arguments: input });
    assert.notEqual(saved.isError, true);
    const reply = {
      title: 'Clouds',
      summary: 'Condensation forms clouds.',
      mdx: '<FlowGraph id="cloud-view" data="clouds" interaction="discuss" />',
      graphs: [
        {
          id: 'clouds',
          title: 'Cloud formation',
          nodes: [
            {
              id: 'condensation',
              label: 'Condensation',
              description: 'Vapor becomes liquid droplets.',
              kind: 'process',
            },
          ],
          edges: [],
        },
      ],
    };
    const result = await client.callTool({
      name: 'respond_to_graph',
      arguments: { documentId: doc.id, submissionId: input.submissionId, ...reply },
    });
    assert.notEqual(result.isError, true);
    const composed = graphSnapshotSchema.parse(
      (await client.callTool({ name: 'open_graph_dialogue', arguments: { document: reply } }))
        .structuredContent,
    ).graphDialogue;
    assert.deepEqual(composed.content, reply);
    assert.equal(composed.revision, 1);
    const target = { graphId: 'clouds', nodeId: 'condensation' };
    const annotation = {
      ...input,
      revision: 2,
      submissionId: randomUUID(),
      annotation: 'Explain the temperature change here.',
      target,
    };
    await client.callTool({ name: 'submit_graph_annotation', arguments: annotation });
    const read = graphSnapshotSchema.parse(
      (await client.callTool({ name: 'get_graph_dialogue', arguments: { documentId: doc.id } }))
        .structuredContent,
    ).graphDialogue;
    assert.deepEqual(read.content, reply);
    assert.deepEqual(read.submissions.at(-1)?.target, target);
    const reopened = graphSnapshotSchema.parse(
      (await client.callTool({ name: 'open_graph_dialogue', arguments: { documentId: doc.id } }))
        .structuredContent,
    ).graphDialogue;
    assert.deepEqual(reopened, read);
    assert.equal(
      (
        await client.callTool({
          name: 'open_graph_dialogue',
          arguments: { documentId: doc.id, document: reply },
        })
      ).isError,
      true,
    );
    assert.equal(
      (
        await client.callTool({
          name: 'open_graph_dialogue',
          arguments: { documentId: randomUUID() },
        })
      ).isError,
      true,
    );
    const invalid = await client.callTool({
      name: 'respond_to_graph',
      arguments: {
        documentId: doc.id,
        submissionId: annotation.submissionId,
        ...reply,
        mdx: '{alert(1)}',
      },
    });
    assert.equal(invalid.isError, true);
    assert.equal(
      (
        await client.callTool({
          name: 'respond_to_graph',
          arguments: { documentId: doc.id, submissionId: annotation.submissionId, ...reply },
        })
      ).isError,
      undefined,
    );
  } finally {
    await client.close();
    await server.close();
  }
});
