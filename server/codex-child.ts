import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

// Owns child pipes, termination and bounded event evidence as one lifecycle.
export function runCodexChild(
  executable: string,
  args: string[],
  runDir: string,
  prompt: string,
): Promise<string> {
  return new Promise<string>((resolveRun, reject) => {
    const child = spawn(executable, args, {
      cwd: runDir,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const chunks: Buffer[] = [];
    let bytes = 0,
      stderr = '',
      timedOut = false,
      overflow = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
    }, 180_000);
    const forceKill = setTimeout(() => child.kill('SIGKILL'), 185_000);
    child.stdout.on('data', (chunk) => {
      if (overflow) return;
      const remaining = 2_000_000 - bytes;
      chunks.push(chunk.subarray(0, remaining));
      bytes += Math.min(chunk.length, remaining);
      if (chunk.length > remaining) {
        overflow = true;
        child.kill('SIGKILL');
      }
    });
    child.stderr.on('data', (chunk) => {
      stderr = (stderr + chunk).slice(-20_000);
    });
    child.on('error', (error) => {
      clearTimeout(timeout);
      clearTimeout(forceKill);
      reject(new Error(`Could not start Codex: ${error.message}`));
    });
    child.on('close', async (code) => {
      clearTimeout(timeout);
      clearTimeout(forceKill);
      const stdout = Buffer.concat(chunks).toString('utf8');
      try {
        await Promise.all([
          writeFile(join(runDir, 'events.jsonl'), Buffer.concat(chunks), { mode: 0o600 }),
          writeFile(join(runDir, 'stderr.log'), stderr, { mode: 0o600 }),
        ]);
      } catch (error) {
        reject(new Error(`Could not save model attempt evidence: ${String(error)}`));
        return;
      }
      if (overflow)
        reject(new Error('Codex output exceeded the 2000000-byte limit. Your input is saved.'));
      else if (timedOut)
        reject(
          new Error(
            'Codex did not respond within three minutes. Your input is saved; retry the response.',
          ),
        );
      else if (code !== 0)
        reject(
          new Error(
            `Codex exited with status ${code}. Check codex login status and ${join(runDir, 'stderr.log')}, then retry.`,
          ),
        );
      else resolveRun(stdout);
    });
    child.stdin.on('error', () => {});
    child.stdin.end(prompt);
  });
}
