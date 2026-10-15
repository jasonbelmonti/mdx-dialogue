import { open, unlink } from 'node:fs/promises';

// Do not read arbitrarily large CLI output into memory, even if it exited successfully.
export async function readModelResponse(path: string): Promise<unknown> {
  const file = await open(path, 'r');
  const buffer = Buffer.alloc(2_000_001);
  let length = 0;
  try {
    while (length < buffer.length) {
      const { bytesRead } = await file.read(buffer, length, buffer.length - length, null);
      if (!bytesRead) break;
      length += bytesRead;
    }
  } finally {
    await file.close();
  }
  if (length > 2_000_000) {
    await unlink(path);
    throw new Error('Codex response exceeded the 2000000-byte limit; oversized response removed.');
  }
  return JSON.parse(buffer.subarray(0, length).toString('utf8'));
}
