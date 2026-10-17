import { open } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  inspectorFilesSchema,
  inspectorSchema,
  type InspectorFiles,
} from '../../shared/inspector/schema.js';
import { importTrace, sha256 } from './trace.js';
import { importHistory } from './history.js';

async function readBounded(path: string, limit: number) {
  if (!isAbsolute(path)) throw new Error('Inspector imports require absolute local file paths.');
  const file = await open(path, 'r');
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.size > limit)
      throw new Error(`Input must be a regular file of at most ${limit} bytes: ${path}`);
    const buffer = Buffer.alloc(limit + 1);
    let bytes = 0;
    while (bytes < buffer.length) {
      const result = await file.read(buffer, bytes, buffer.length - bytes, null);
      if (!result.bytesRead) break;
      bytes += result.bytesRead;
    }
    if (bytes > limit) throw new Error(`Input exceeded ${limit} bytes during reading.`);
    return buffer.subarray(0, bytes);
  } finally {
    await file.close();
  }
}
/** Imports data only: no subprocess, source mutation, URL fetch or capsule operation. */
export async function importInspector(raw: InspectorFiles) {
  const files = inspectorFilesSchema.parse(raw);
  const [taskBytes, traceBytes, historyBytes] = await Promise.all([
    readBounded(files.taskFile, 131072),
    readBounded(files.traceFile, 2 * 1024 * 1024),
    readBounded(files.historyFile, 16 * 1024 * 1024),
  ]);
  const decode = (bytes: Buffer) =>
    JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  const task = importTrace(decode(traceBytes), taskBytes, files.taskFile);
  const history = importHistory(decode(historyBytes), sha256(historyBytes), task);
  const snapshot = inspectorSchema.parse({
    id: randomUUID(),
    importedAt: new Date().toISOString(),
    traceExportSha256: sha256(traceBytes),
    task,
    history,
  });
  if (Buffer.byteLength(JSON.stringify(snapshot)) > 512 * 1024)
    throw new Error('Inspector projection exceeds 512 KiB. Export a smaller run or task.');
  return snapshot;
}
