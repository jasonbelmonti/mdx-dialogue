import { copyFile, mkdir, readFile, rename, rm, rmdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

// A fresh destination is required. Existing installations and user files are never overwritten.
const [scope, ...rest] = process.argv.slice(2);
if (rest.length || !scope || (scope !== '--user' && !scope.startsWith('--project=')))
  throw new Error('Usage: npm run copilot:install -- --user | --project=/absolute/project');
if (scope !== '--user' && !isAbsolute(scope.slice('--project='.length)))
  throw new Error('The project directory must be an absolute path.');
const parent =
  scope === '--user'
    ? join(homedir(), '.copilot', 'extensions')
    : join(resolve(scope.slice('--project='.length)), '.github', 'extensions');
const destination = join(parent, 'mdx-dialogue');
const source = new URL('../dist/copilot/mdx-dialogue/', import.meta.url);
const files = ['package.json', 'extension.mjs', 'canvas.html'];
for (const name of files) await readFile(new URL(name, source));
await mkdir(parent, { recursive: true });
const stage = join(dirname(parent), `.mdx-dialogue-install-${randomUUID()}`);
await mkdir(stage);
try {
  for (const name of files) await copyFile(new URL(name, source), join(stage, name));
  // mkdir reserves the destination without replacing any existing install, including symlinks.
  await mkdir(destination);
  try {
    await rename(stage, destination);
  } catch (error) {
    await rmdir(destination).catch(() => {});
    throw error;
  }
} finally {
  await rm(stage, { recursive: true, force: true });
}
console.log(
  `Installed ${destination}. Open a new Copilot session and ask to open the MDX Dialogue Canvas.`,
);
