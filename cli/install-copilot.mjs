import { copyFile, mkdir, readFile, rename, rm, rmdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

// A fresh destination is required. Existing installations and user files are never overwritten.
export async function installCopilot(scope) {
  if (!scope || (scope !== '--user' && !scope.startsWith('--project=')))
    throw new Error('Usage: mdx-dialogue install copilot --user | --project=/absolute/project');
  if (scope !== '--user' && !isAbsolute(scope.slice('--project='.length)))
    throw new Error('The project directory must be an absolute path.');
  const parent =
    scope === '--user'
      ? join(homedir(), '.copilot', 'extensions')
      : join(resolve(scope.slice('--project='.length)), '.github', 'extensions');
  const destination = join(parent, 'mdx-dialogue');
  const source = new URL('../dist/copilot/mdx-dialogue/', import.meta.url);
  const files = ['package.json', 'extension.mjs', 'canvas.html', 'THIRD_PARTY_NOTICES.txt'];
  for (const name of files) await readFile(new URL(name, source));
  await mkdir(parent, { recursive: true });
  const stage = join(dirname(parent), `.mdx-dialogue-install-${randomUUID()}`);
  await mkdir(stage);
  try {
    for (const name of files) await copyFile(new URL(name, source), join(stage, name));
    // mkdir reserves the destination without replacing any existing install, including symlinks.
    try {
      await mkdir(destination);
    } catch (error) {
      if (error.code === 'EEXIST')
        throw new Error(
          `Existing installation preserved: ${destination}. Close Copilot sessions and move this folder outside extensions/ as a backup before installing again. See docs/install.md.`,
        );
      throw error;
    }
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
}
