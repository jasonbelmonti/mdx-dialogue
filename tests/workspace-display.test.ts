import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorkspaceDisplay } from '../web/graph/workspaceDisplay.js';

test('workspace opens once, respects later collapse and can be explicitly reopened', async () => {
  let requests = 0;
  const display = createWorkspaceDisplay({
    getHostContext: () => ({
      displayMode: 'inline',
      availableDisplayModes: ['inline', 'fullscreen'],
    }),
    requestDisplayMode: async () => {
      requests++;
      return { mode: 'fullscreen' };
    },
  });
  await display.initialize();
  assert.equal(display.snapshot().mode, 'fullscreen');
  assert.equal(requests, 1);
  display.updateContext({ displayMode: 'inline' });
  assert.equal(requests, 1);
  await display.open();
  assert.equal(requests, 2);
});

test('inline-only hosts remain usable without unsupported display requests', async () => {
  const display = createWorkspaceDisplay({
    getHostContext: () => ({ displayMode: 'inline' }),
    requestDisplayMode: async () => {
      assert.fail('Unsupported host must not receive display requests');
    },
  });
  await display.initialize();
  assert.equal(display.snapshot().mode, 'inline');
  assert.equal(display.snapshot().canExpand, false);
  assert.equal(display.snapshot().error, '');
});

test('display refusal and transport failure stay recoverable without blocking the document', async () => {
  let attempt = 0;
  const display = createWorkspaceDisplay({
    getHostContext: () => ({ displayMode: 'inline', availableDisplayModes: ['fullscreen'] }),
    requestDisplayMode: async () => {
      if (++attempt === 1) return { mode: 'inline' };
      if (attempt === 2) throw new Error('Disconnected');
      return { mode: 'fullscreen' };
    },
  });
  await display.initialize();
  assert.match(display.snapshot().error, /kept this view inline/);
  await display.open();
  assert.match(display.snapshot().error, /retry/);
  assert.equal(display.snapshot().pending, false);
  await display.open();
  assert.equal(display.snapshot().error, '');
  assert.equal(display.snapshot().mode, 'fullscreen');
});
