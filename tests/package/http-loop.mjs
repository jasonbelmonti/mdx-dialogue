import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';

export async function serve(binary, cwd, env, extra = []) {
  const socket = createServer();
  socket.listen(0, '127.0.0.1');
  await once(socket, 'listening');
  const port = socket.address().port;
  await new Promise((resolve) => socket.close(resolve));
  const child = spawn(binary, ['serve', '--port', String(port), ...extra], {
    cwd,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', (c) => {
    output += c;
  });
  child.stderr.on('data', (c) => {
    output += c;
  });
  const stopped = once(child, 'exit');
  const stop = async () => {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
    await stopped;
  };
  try {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(
        () => finish(new Error(`Service startup timed out: ${output}`)),
        15000,
      );
      const onData = () => {
        if (output.includes('MCP endpoint:')) finish();
      };
      const onExit = () => finish(new Error(`Service exited: ${output}`));
      function finish(error) {
        clearTimeout(timeout);
        child.stdout.off('data', onData);
        child.off('exit', onExit);
        child.off('error', finish);
        error ? reject(error) : resolve();
      }
      child.stdout.on('data', onData);
      child.once('exit', onExit);
      child.once('error', finish);
    });
  } catch (error) {
    await stop();
    throw error;
  }
  const origin = `http://127.0.0.1:${port}`;
  const rpc = async (method, params = {}) => {
    const response = await fetch(`${origin}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: randomUUID(), method, params }),
    });
    assert.equal(response.status, 200, await response.clone().text());
    const message = await response.json();
    assert.equal(message.error, undefined, JSON.stringify(message));
    return message.result;
  };
  const call = async (name, args) => {
    const result = await rpc('tools/call', { name, arguments: args });
    assert.notEqual(result.isError, true, JSON.stringify(result));
    return result.structuredContent.graphDialogue;
  };
  return { origin, rpc, call, stop };
}

export async function reviseGraph(service) {
  const initial = {
    title: 'Installed package',
    summary: 'Selected node loop',
    mdx: '<FlowGraph id="view" data="flow" interaction="discuss" />',
    graphs: [
      {
        id: 'flow',
        title: 'Flow',
        nodes: [{ id: 'one', label: 'One', description: 'Before', kind: 'concept' }],
        edges: [],
      },
    ],
  };
  const before = await service.call('open_graph_dialogue', { document: initial });
  const target = { graphId: 'flow', nodeId: 'one' };
  const submissionId = randomUUID();
  await service.call('submit_graph_annotation', {
    documentId: before.id,
    revision: before.revision,
    submissionId,
    target,
    annotation: 'Explain the selected node.',
  });
  const saved = await service.call('get_graph_dialogue', { documentId: before.id });
  assert.deepEqual(saved.submissions.at(-1).target, target);
  const revised = structuredClone(initial);
  revised.graphs[0].nodes[0].description = 'After: accepted from the host model';
  const after = await service.call('respond_to_graph', {
    documentId: before.id,
    submissionId,
    ...revised,
  });
  assert.equal(after.id, before.id);
  assert.equal(after.revision, 2);
  assert.equal(after.submissions.at(-1).source, 'host-model');
  assert.equal(after.submissions.at(-1).status, 'complete');
  assert.equal(after.submissions.at(-1).submissionId, submissionId);
  assert.deepEqual(after.content, revised);
  return after;
}
