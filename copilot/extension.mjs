import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createCanvas, joinSession } from '@github/copilot-sdk/extension';
import { createGraphCanvas } from '../server/copilot/canvas.ts';

let session;
const provider = await createGraphCanvas({
  directory: process.env.MDX_DIALOGUE_DATA_DIR ?? join(homedir(), '.mdx-dialogue', 'copilot'),
  html: await readFile(new URL('./canvas.html', import.meta.url), 'utf8'),
  session: () => session,
});
try {
  session = await joinSession({ canvases: [createCanvas(provider.canvas)] });
} catch (error) {
  await provider.close();
  throw error;
}
for (const signal of ['SIGINT', 'SIGTERM'])
  process.once(signal, () => void provider.close().finally(() => process.exit(0)));
