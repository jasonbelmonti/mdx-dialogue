import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createMcpServer, widgetUri } from '../server/mcp.js';
import { DialogueStore } from '../server/dialogue-store.js';
import { snapshotSchema } from '../shared/dialogue.js';

test('real MCP client discovers widget, records input, accepts model MDX, and observes the updated panel state', async () => {
  const server = createMcpServer(new DialogueStore());
  const client = new Client({ name: 'integration-test', version: '1' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  try {
    const listed = await client.listTools();
    const open = listed.tools.find((t) => t.name === 'open_dialogue')!;
    assert.deepEqual(open._meta?.ui, { resourceUri: widgetUri });
    const widget = await client.readResource({ uri: widgetUri });
    assert.equal(widget.contents[0].mimeType, 'text/html;profile=mcp-app');
    assert.ok('text' in widget.contents[0] && widget.contents[0].text.includes('LayoutPreview'));
    const initial = snapshotSchema.parse(
      (await client.callTool({ name: 'open_dialogue', arguments: {} })).structuredContent,
    ).dialogue;
    const selection = {
      documentId: initial.id,
      revision: 1,
      submissionId: randomUUID(),
      selectedId: 'stacked',
      annotation: 'Use blue and make it compact.',
    };
    await client.callTool({ name: 'submit_selection', arguments: selection });
    const reply = {
      summary: 'Blue compact stacked layout',
      mdx: '# Your revised layout\n\n<LayoutPreview layout="stacked" accent="blue" density="compact" />',
    };
    await client.callTool({
      name: 'respond_to_selection',
      arguments: { documentId: initial.id, submissionId: selection.submissionId, ...reply },
    });
    const result = snapshotSchema.parse(
      (await client.callTool({ name: 'get_dialogue', arguments: { documentId: initial.id } }))
        .structuredContent,
    ).dialogue;
    assert.equal(result.revision, 2);
    assert.deepEqual(result.submissions[0].reply, reply);
    assert.equal(result.submissions[0].annotation, selection.annotation);
    const stale = await client.callTool({
      name: 'submit_selection',
      arguments: { ...selection, submissionId: randomUUID() },
    });
    assert.equal(stale.isError, true);
  } finally {
    await client.close();
    await server.close();
  }
});
