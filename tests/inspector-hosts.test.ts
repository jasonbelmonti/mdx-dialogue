import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createMcpServer } from '../server/mcp.js';
import { DialogueStore } from '../server/dialogue-store.js';
import { GraphStore } from '../server/graph/store.js';
import { graphSnapshotSchema, type GraphDialogue } from '../shared/graph/schema.js';
import { createGraphCanvas } from '../server/copilot/canvas.js';
import { inspectorFixture } from './fixtures/inspector.js';

const reply = {
  title: 'Captured proof',
  summary: 'This snapshot records a checkpoint.',
  mdx: 'The captured checkpoint references the source commit. Current working files are outside this evidence.',
  graphs: [],
};

test('MCP imports a real file boundary, saves selected history context and replies in the same workspace', async () => {
  const f = inspectorFixture();
  const store = new GraphStore();
  const server = createMcpServer(new DialogueStore(), store);
  const client = new Client({ name: 'inspector-test', version: '1' });
  const [ct, st] = InMemoryTransport.createLinkedPair();
  await server.connect(st);
  await client.connect(ct);
  try {
    const tool = (await client.listTools()).tools.find((t) => t.name === 'open_project_inspector')!;
    assert.match(tool.description!, /read-only|Read-only/);
    const opened = await client.callTool({ name: tool.name, arguments: f.files });
    assert.notEqual(opened.isError, true);
    const doc = graphSnapshotSchema.parse(opened.structuredContent).graphDialogue;
    const inspector = doc.inspector!;
    const input = {
      documentId: doc.id,
      revision: 1,
      submissionId: randomUUID(),
      annotation: 'What does this checkpoint establish?',
      target: null,
      sourceTarget: {
        snapshotId: inspector.id,
        view: 'history',
        itemId: inspector.history.nodes[1].id,
      },
    };
    await client.callTool({ name: 'submit_graph_annotation', arguments: input });
    const saved = graphSnapshotSchema.parse(
      (await client.callTool({ name: 'get_graph_dialogue', arguments: { documentId: doc.id } }))
        .structuredContent,
    ).graphDialogue;
    assert.equal(
      JSON.parse(saved.submissions[0].sourceContext!).event.checkpoint.contextCommit,
      '2'.repeat(40),
    );
    const answered = graphSnapshotSchema.parse(
      (
        await client.callTool({
          name: 'respond_to_graph',
          arguments: { documentId: doc.id, submissionId: input.submissionId, ...reply },
        })
      ).structuredContent,
    ).graphDialogue;
    assert.equal(answered.id, doc.id);
    assert.equal(answered.revision, 2);
    assert.deepEqual(answered.inspector, inspector);
    writeFileSync(f.files.taskFile, 'changed source');
    assert.equal((await client.callTool({ name: tool.name, arguments: f.files })).isError, true);
    const reopened = graphSnapshotSchema.parse(
      (await client.callTool({ name: 'open_graph_dialogue', arguments: { documentId: doc.id } }))
        .structuredContent,
    ).graphDialogue;
    assert.deepEqual(reopened, answered); // immutable import remains usable after external files change
  } finally {
    await client.close();
    await server.close();
    f.remove();
  }
});

test('Copilot inspector uses the shared authenticated composer, readable delivery, exact retry and persisted response', async () => {
  const f = inspectorFixture();
  const directory = mkdtempSync(join(tmpdir(), 'inspector-canvas-'));
  const identity = { sessionId: 'inspector-session', instanceId: 'task-workspace' };
  let offline = true;
  const messages: { prompt: string; displayPrompt: string }[] = [];
  const options = {
    directory,
    html: '<html>Inspector</html>',
    session: () => ({
      sessionId: identity.sessionId,
      send: async (message: { prompt: string; displayPrompt: string }) => {
        messages.push(message);
        if (offline) throw new Error('offline');
        return 'message';
      },
    }),
  };
  let provider = await createGraphCanvas(options);
  try {
    const opened = await provider.canvas.open({ ...identity, input: { inspector: f.files } });
    const url = new URL(opened.url);
    const headers = {
      Authorization: `Bearer ${url.hash.slice(1)}`,
      'Content-Type': 'application/json',
    };
    const read = () => provider.canvas.actions[0].handler(identity) as GraphDialogue;
    const doc = read();
    const input = {
      documentId: doc.id,
      revision: 1,
      submissionId: randomUUID(),
      annotation: 'What does this criterion require?',
      target: null,
      sourceTarget: { snapshotId: doc.inspector!.id, view: 'relationships', itemId: 'TD-SC-1' },
    };
    const send = () =>
      fetch(`${url.origin}/annotation`, { method: 'POST', headers, body: JSON.stringify(input) });
    assert.equal((await send()).status, 400);
    offline = false;
    assert.equal((await send()).status, 200);
    assert.deepEqual(messages[0], messages[1]);
    assert.equal(
      messages[1].displayPrompt,
      input.annotation + '\n\nMDX Dialogue · relationships · TD-SC-1',
    );
    assert.doesNotMatch(messages[1].displayPrompt, /sourceContext|invoke_canvas_action|Codex/);
    assert.match(messages[1].prompt, /sourceContext/);
    assert.equal(read().submissions.length, 1);
    const context = read().submissions[0].sourceContext;
    assert.ok(context?.includes(doc.inspector!.task.sha256));
    provider.canvas.actions[1].handler({
      ...identity,
      input: { submissionId: input.submissionId, reply },
    });
    assert.equal(read().revision, 2);
    assert.deepEqual(read().inspector, doc.inspector);
    provider.canvas.onClose(identity);
    await provider.close();
    provider = await createGraphCanvas(options);
    f.remove();
    await provider.canvas.open({ ...identity, input: { inspector: f.files } });
    assert.equal(read().id, doc.id);
    assert.equal(read().submissions[0].sourceContext, context);
    assert.deepEqual(read().inspector, doc.inspector);
  } finally {
    await provider.close();
    f.remove();
    rmSync(directory, { recursive: true, force: true });
  }
});
