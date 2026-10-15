import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createCanvas, joinSession } from '@github/copilot-sdk/extension';
import { createGraphCanvas } from '../server/copilot/canvas.ts';

const sessionId = process.env.SESSION_ID;
if (!sessionId) throw new Error('MDX Dialogue must run inside a Copilot session.');
let session;
// The host can restore a Canvas while joinSession is still registering it.
// Identity is available at launch; sending requires the completed connection.
const connection = {
  sessionId,
  async send(options) {
    if (!session) throw new Error('Copilot is still connecting. Retry the saved request.');
    return session.send(options);
  },
};
const provider = await createGraphCanvas({
  directory: process.env.MDX_DIALOGUE_DATA_DIR ?? join(homedir(), '.mdx-dialogue', 'copilot'),
  html: await readFile(new URL('./canvas.html', import.meta.url), 'utf8'),
  session: () => connection,
});
try {
  session = await joinSession({ canvases: [createCanvas(provider.canvas)] });
} catch (error) {
  await provider.close();
  throw error;
}
for (const signal of ['SIGINT', 'SIGTERM'])
  process.once(signal, () => void provider.close().finally(() => process.exit(0)));
