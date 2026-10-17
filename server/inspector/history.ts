import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  historySnapshotSchema,
  historyNodeSchema,
  oid,
  type TaskSnapshot,
} from '../../shared/inspector/schema.js';
import { sha256, uniqueIds } from './trace.js';

const exportSchema = z.object({
  kind: z.literal('context-capsules-history'),
  schemaVersion: z.literal(1),
  producer: historySnapshotSchema.shape.producer,
  history: historySnapshotSchema.omit({ producer: true, exportSha256: true }).extend({
    version: z.literal(1),
    nodes: z
      .array(historyNodeSchema.omit({ taskPaths: true, checkpoint: true }))
      .min(1)
      .max(128),
    blobs: z.record(
      oid,
      z.object({
        bytes: z.int().nonnegative(),
        text: z.string().nullable(),
        base64: z.string().nullable(),
      }),
    ),
  }),
});
const checkpointSchema = z.object({
  checkpointId: z.uuid(),
  runId: z.string(),
  inputCapsule: z.object({ storeId: z.uuid(), capsuleCommit: z.object({ hex: oid }) }),
  source: z.object({ commit: z.object({ hex: oid }) }),
});
export function importHistory(raw: unknown, exportSha256: string, task: TaskSnapshot) {
  const { history, producer } = exportSchema.parse(raw);
  uniqueIds(history.nodes.map((n) => n.id));
  const byId = new Map(history.nodes.map((n) => [n.id, n]));
  const blobText = (id: string) => {
    const blob = history.blobs[id];
    if (!blob || blob.text === null) throw new Error('Required retained text blob is missing.');
    const bytes = Buffer.from(blob.text, 'utf8');
    const actual = createHash(id.length === 40 ? 'sha1' : 'sha256')
      .update(`blob ${bytes.length}\0`)
      .update(bytes)
      .digest('hex');
    if (bytes.length !== blob.bytes || actual !== id)
      throw new Error('Retained blob does not match its Git object identity.');
    return blob.text;
  };
  for (const link of history.links)
    if (!byId.has(link.from) || !byId.has(link.to))
      throw new Error('History link has an unresolved endpoint.');
  const nodes = history.nodes.map((node) => {
    if (
      node.id !== `${node.track}:${node.oid}` ||
      node.parents.some((p) => !new RegExp(`^${node.track}:(?:[a-f0-9]{40}|[a-f0-9]{64})$`).test(p))
    )
      throw new Error('History node identity or parent track is inconsistent.');
    uniqueIds(node.files.map((f) => f.path));
    if (node.attribution && node.attribution.runId !== node.lane)
      throw new Error('History attribution disagrees with the event run.');
    if (node.acknowledgmentIds?.some((id) => !byId.has(id)))
      throw new Error('History acknowledgment is unresolved.');
    const taskPaths =
      node.track === 'context'
        ? node.files
            .filter((f) => {
              const blob = history.blobs[f.oid];
              return (
                f.kind === 'blob' &&
                blob?.text !== null &&
                blob?.text !== undefined &&
                sha256(blob.text) === task.sha256
              );
            })
            .map((f) => {
              blobText(f.oid);
              return f.path;
            })
        : [];
    let checkpoint;
    if (node.kind === 'checkpoint' && node.track === 'context') {
      const parentPaths = new Set(
        node.parents.flatMap((id) => byId.get(id)?.files.map((f) => f.path) ?? []),
      );
      const records = node.files.filter(
        (f) => /^records\/checkpoints\/[^/]+\.json$/.test(f.path) && !parentPaths.has(f.path),
      );
      if (records.length !== 1)
        throw new Error('Checkpoint record cannot be uniquely identified in captured ancestry.');
      const record = checkpointSchema.parse(JSON.parse(blobText(records[0].oid)));
      if (
        record.runId !== node.lane ||
        !byId.has(`context:${record.inputCapsule.capsuleCommit.hex}`) ||
        records[0].path !== `records/checkpoints/${record.checkpointId}.json` ||
        !history.links.some(
          (l) =>
            l.kind === 'checkpoint' &&
            l.from === `source:${record.source.commit.hex}` &&
            l.to === node.id,
        )
      )
        throw new Error('Checkpoint record disagrees with captured history.');
      checkpoint = {
        checkpointId: record.checkpointId,
        storeId: record.inputCapsule.storeId,
        runId: record.runId,
        contextCommit: node.oid,
        sourceCommit: record.source.commit.hex,
        inputCommit: record.inputCapsule.capsuleCommit.hex,
      };
    }
    return { ...node, taskPaths, ...(checkpoint ? { checkpoint } : {}) };
  });
  // `source` is a directory display name; run identities live on the captured nodes.
  if (!nodes.some((n) => n.taskPaths.length))
    throw new Error(
      'The captured history does not retain the exact task bytes. Export the matching task run with --run.',
    );
  return historySnapshotSchema.parse({ ...history, producer, exportSha256, nodes });
}
