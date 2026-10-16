import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createGraphCanvas } from '../server/copilot/canvas.js';
import { CanvasDocuments } from '../server/copilot/documents.js';
import type { GraphDialogue, GraphReply } from '../shared/graph/schema.js';
import type { AnnotationMessage } from '../server/copilot/annotation-message.js';
import { graphMdxContract } from '../shared/graph/mdx-contract.js';

const reply: GraphReply = {
  title: 'Canvas test',
  summary: 'A selected node.',
  mdx: '<FlowGraph id="view" data="loop" interaction="discuss" />',
  graphs: [
    {
      id: 'loop',
      title: 'Loop',
      nodes: [
        { id: 'input', label: 'Input', description: 'Original description.', kind: 'concept' },
      ],
      edges: [],
    },
  ],
};
const identity = { sessionId: 'test-session', instanceId: 'test-instance' };

test('Canvas loop saves selected-node input, sends to this session, validates replies and restores after restart', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'mdx-canvas-'));
  const prompts: AnnotationMessage[] = [];
  const options = {
    directory,
    html: '<html>Canvas</html>',
    session: () => ({
      sessionId: identity.sessionId,
      send: async (message: AnnotationMessage) => {
        const disk = JSON.parse(readFileSync(join(directory, readdirSync(directory)[0]), 'utf8'));
        assert.equal(disk[0].submissions[0].status, 'running');
        assert.deepEqual(disk[0].submissions[0].target, { graphId: 'loop', nodeId: 'input' });
        prompts.push(message);
        return 'message-id';
      },
    }),
  };
  let provider = await createGraphCanvas(options);
  try {
    assert.ok(provider.canvas.description.includes(graphMdxContract));
    const openSchema = provider.canvas.inputSchema as any;
    const responseSchema = provider.canvas.actions[1].inputSchema as any;
    for (const description of [
      openSchema.properties.initial.properties.mdx.description,
      responseSchema.properties.reply.properties.mdx.description,
    ]) {
      assert.equal(description, graphMdxContract);
      assert.match(description, /No blockquotes/);
    }
    const example = graphMdxContract.match(/<FlowGraph[^>]+\/>/)![0];
    assert.throws(
      () =>
        provider.canvas.open({
          ...identity,
          input: { initial: { ...reply, mdx: '> Unsupported quote\n\n' + reply.mdx } },
        }),
      /Unsupported MDX syntax: blockquote/,
    );
    const schemaExample = { ...reply, mdx: example.replace('data="system"', 'data="loop"') };
    const opened = provider.canvas.open({ ...identity, input: { initial: schemaExample } });
    const url = new URL(opened.url);
    const headers = {
      Authorization: `Bearer ${url.hash.slice(1)}`,
      'Content-Type': 'application/json',
    };
    const read = () =>
      provider.canvas.actions[0].handler({ ...identity, input: {} }) as GraphDialogue;
    const initial = read();
    const input = {
      documentId: initial.id,
      revision: 1,
      submissionId: randomUUID(),
      annotation: 'Expand the input description.',
      target: { graphId: 'loop', nodeId: 'input' },
    };
    const send = (value: unknown) =>
      fetch(`${url.origin}/annotation`, { method: 'POST', headers, body: JSON.stringify(value) });
    assert.equal((await fetch(`${url.origin}/document`)).status, 401);
    assert.equal(
      (
        await fetch(`${url.origin}/document`, {
          headers: { ...headers, Origin: 'https://unrelated.example' },
        })
      ).status,
      403,
    );
    assert.equal((await send({ ...input, documentId: randomUUID() })).status, 400);
    assert.equal((await send(input)).status, 200);
    assert.equal(prompts.length, 1);
    assert.match(prompts[0].prompt, new RegExp(input.submissionId));
    assert.match(prompts[0].prompt, /get_document/);
    assert.match(prompts[0].prompt, /respond_to_graph/);
    assert.ok(prompts[0].prompt.includes(JSON.stringify(identity.instanceId)));
    assert.equal(prompts[0].displayPrompt, input.annotation + '\n\nMDX Dialogue · Input · Loop');
    assert.doesNotMatch(JSON.stringify(prompts[0]), /Codex/);
    assert.doesNotMatch(prompts[0].displayPrompt, /invoke_canvas_action|submissionId|FlowGraph/);
    assert.equal(read().submissions[0].annotation, input.annotation);
    const respond = (value: unknown) =>
      provider.canvas.actions[1].handler({
        ...identity,
        input: { submissionId: input.submissionId, reply: value },
      });
    assert.throws(() => respond({ ...reply, mdx: '{globalThis.alert(1)}' }));
    assert.equal(read().revision, 1);
    assert.throws(
      () => provider.canvas.actions[0].handler({ ...identity, sessionId: 'other-session' }),
      /Wrong Copilot session/,
    );
    const other = { ...identity, instanceId: 'another-instance' };
    provider.canvas.open(other);
    assert.throws(
      () =>
        provider.canvas.actions[1].handler({
          ...other,
          input: { submissionId: input.submissionId, reply },
        }),
      /outdated/,
    );
    const revised = structuredClone(reply);
    revised.graphs[0].nodes[0].description = 'Expanded description.';
    respond(revised);
    assert.equal(read().id, initial.id);
    assert.equal(read().revision, 2);
    assert.equal(read().submissions[0].source, 'host-model');
    assert.throws(() => respond(reply), /outdated/);
    assert.equal((await send(input)).status, 200); // lost HTTP acknowledgement does not resend a completed request
    assert.equal(prompts.length, 1);
    assert.equal((await send({ ...input, submissionId: randomUUID() })).status, 400);
    provider.canvas.onClose(identity);
    assert.equal((await fetch(`${url.origin}/document`, { headers })).status, 401);
    await provider.close();
    provider = await createGraphCanvas(options);
    const reopened = provider.canvas.open(identity);
    assert.notEqual(reopened.url, opened.url);
    assert.equal(read().id, initial.id);
    assert.equal(read().revision, 2);
    assert.deepEqual(read().content, revised);
  } finally {
    await provider.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test('failed Copilot delivery retains exact input and retry completes without another submission', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'mdx-canvas-failure-'));
  let reject = true;
  let sends = 0;
  const messages: AnnotationMessage[] = [];
  const provider = await createGraphCanvas({
    directory,
    html: '<html />',
    session: () => ({
      sessionId: identity.sessionId,
      send: async (message) => {
        sends++;
        messages.push(message);
        if (reject) throw new Error('offline');
        return 'sent';
      },
    }),
  });
  try {
    const url = new URL(provider.canvas.open(identity).url);
    const headers = {
      Authorization: `Bearer ${url.hash.slice(1)}`,
      'Content-Type': 'application/json',
    };
    const read = () => provider.canvas.actions[0].handler(identity) as GraphDialogue;
    const input = {
      documentId: read().id,
      revision: 1,
      submissionId: randomUUID(),
      annotation: 'Build a graph.',
      target: null,
    };
    const send = () =>
      fetch(`${url.origin}/annotation`, { method: 'POST', headers, body: JSON.stringify(input) });
    assert.equal((await send()).status, 400);
    assert.equal(read().submissions[0].status, 'failed');
    assert.equal(read().submissions[0].submissionId, input.submissionId);
    reject = false;
    assert.equal((await send()).status, 200);
    assert.equal(sends, 2);
    assert.deepEqual(messages[0], messages[1]);
    assert.equal(messages[1].displayPrompt, input.annotation + '\n\nMDX Dialogue · Whole document');
    assert.equal(read().submissions.length, 1);
    provider.canvas.actions[1].handler({
      ...identity,
      input: { submissionId: input.submissionId, reply },
    });
    assert.equal(read().revision, 2);
  } finally {
    await provider.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test('a hung host delivery times out, releases its retry gate and retains the saved submission', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'mdx-canvas-timeout-'));
  let hung = true;
  const documents = new CanvasDocuments(
    directory,
    () => ({
      sessionId: identity.sessionId,
      send: () => (hung ? new Promise<string>(() => {}) : Promise.resolve('sent')),
    }),
    10,
  );
  try {
    documents.open(identity);
    const input = {
      documentId: documents.read(identity).id,
      revision: 1,
      submissionId: randomUUID(),
      annotation: 'Retain this exact request.',
      target: null,
    };
    await assert.rejects(documents.submit(identity, input), /timed out/);
    assert.equal(documents.read(identity).submissions[0].status, 'failed');
    hung = false;
    await documents.submit(identity, input);
    documents.respond(identity, input.submissionId, reply);
    assert.equal(documents.read(identity).revision, 2);
    assert.equal(documents.read(identity).submissions.length, 1);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
