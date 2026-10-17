import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
export const createCanvas = (options) => options;
export async function joinSession({ canvases }) {
  assert.equal(canvases.length, 1);
  const canvas = canvases[0];
  const ctx = { sessionId: 'isolated-host', instanceId: 'one', input: {} };
  // Native Copilot restores panels during registration, before joinSession resolves.
  const url = new URL((await canvas.open(ctx)).url);
  const before = canvas.actions[0].handler(ctx);
  await assert.rejects(
    () => canvas.open({ ...ctx, sessionId: 'another-host' }),
    /Wrong Copilot session/,
  );
  const reply = {
    title: 'Bundled loop',
    summary: 'Saved',
    mdx: '<FlowGraph id="view" data="graph" interaction="discuss" />',
    graphs: [
      {
        id: 'graph',
        title: 'Graph',
        nodes: [{ id: 'one', label: 'One', description: 'Accepted reply', kind: 'concept' }],
        edges: [],
      },
    ],
  };
  setImmediate(async () => {
    try {
      assert.equal(canvas.id, 'mdx-dialogue');
      assert.equal((await canvas.open(ctx)).url, url.href);
      const page = await fetch(url.origin);
      assert.match(await page.text(), /<html/);
      const input = {
        documentId: before.id,
        revision: 1,
        submissionId: randomUUID(),
        annotation: 'Build this graph',
        target: null,
      };
      const result = await fetch(url.origin + '/annotation', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + url.hash.slice(1),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(input),
      });
      assert.equal(result.status, 200);
      const after = await result.json();
      assert.equal(after.revision, 2);
      assert.equal(after.id, before.id);
      assert.equal(after.content.title, 'Bundled loop');
      console.log('PACKAGED_LOOP_PASS');
      process.exit(0);
    } catch (e) {
      console.error(e);
      process.exit(1);
    }
  });
  return {
    sessionId: ctx.sessionId,
    send: async ({ prompt, displayPrompt }) => {
      const doc = canvas.actions[0].handler(ctx);
      assert.ok(prompt.includes(doc.submissions[0].submissionId));
      assert.equal(displayPrompt, 'Build this graph\n\nMDX Dialogue · Whole document');
      assert.doesNotMatch(prompt, /Codex/);
      assert.match(prompt, /respond_to_graph/);
      canvas.actions[1].handler({
        ...ctx,
        input: { submissionId: doc.submissions[0].submissionId, reply },
      });
      return 'message';
    },
  };
}
