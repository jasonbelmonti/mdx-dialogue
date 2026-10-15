import { randomUUID } from 'node:crypto';
import {
  closeSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, resolve } from 'node:path';

function readSnapshot(path: string): string | null {
  try {
    return readFileSync(path, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

// Full snapshots are single-writer state. A stale instance must reopen, never merge or overwrite.
export function snapshotStorage<T>(file: string, parse: (value: unknown) => T[]) {
  const path = resolve(file);
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  let expected = readSnapshot(path);
  const initial = expected === null ? [] : parse(JSON.parse(expected));
  return {
    initial,
    save(docs: T[]) {
      const bytes = JSON.stringify(docs, null, 2);
      const lock = `${path}.lock`;
      let fd: number;
      try {
        fd = openSync(lock, 'wx', 0o600);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'EEXIST')
          throw new Error(
            'Snapshot writer lock exists. Stop competing writers before recovering the lock.',
          );
        throw error;
      }
      const temporary = `${path}.${randomUUID()}.tmp`;
      try {
        if (readSnapshot(path) !== expected)
          throw new Error(
            'Snapshot changed in another writer. Restart this server to reload saved state.',
          );
        writeFileSync(temporary, bytes, { mode: 0o600, flag: 'wx' });
        renameSync(temporary, path);
        expected = bytes;
      } finally {
        // Cleanup must not turn an accepted rename into a reported failed save.
        for (const cleanup of [
          () => closeSync(fd),
          () => unlinkSync(temporary),
          () => unlinkSync(lock),
        ]) {
          try {
            cleanup();
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
              console.error(
                'Snapshot cleanup failed; inspect the writer lock before restarting.',
                error,
              );
          }
        }
      }
    },
  };
}
