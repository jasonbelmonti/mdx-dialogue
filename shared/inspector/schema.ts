import { z } from 'zod';

export const digest = z.string().regex(/^[a-f0-9]{64}$/);
export const oid = z.string().regex(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/);
export const identity = z.string().min(1).max(300);
const path = z.string().min(1).max(4096);
const point = z.object({
  line: z.int().positive(),
  column: z.int().positive(),
  offset: z.int().nonnegative(),
});
export const rangeSchema = z.object({ start: point, end: point });
export const fragmentSchema = z.object({
  id: identity,
  range: rangeSchema,
  text: z.string().max(131072),
  owner: identity.nullable(),
  structure: z.string().max(80),
  requiredContext: z.array(identity).max(2048),
});
export const taskSnapshotSchema = z.object({
  path,
  documentId: path,
  sha256: digest,
  analysisId: digest,
  interpretationHash: digest,
  profileId: identity,
  validationHash: digest,
  parserVersion: identity,
  entities: z
    .array(
      z.object({
        id: identity,
        kind: identity,
        label: z.string().max(300),
        fragmentIds: z.array(identity).max(2048),
      }),
    )
    .min(1)
    .max(128),
  relationships: z
    .array(z.object({ id: identity, source: identity, target: identity, kind: identity }))
    .max(256),
  fragments: z.array(fragmentSchema).max(2048),
});
export const historyNodeSchema = z.object({
  id: identity,
  oid,
  track: z.enum(['source', 'context']),
  parents: z.array(identity).max(100),
  time: z.iso.datetime({ offset: true }),
  title: z.string().max(1000),
  lane: identity,
  kind: identity,
  sourceWorktree: path.optional(),
  attribution: z
    .object({
      runId: identity,
      receiptId: z.uuid(),
      sessionId: z.uuid(),
      inputCapsuleCommit: oid,
      actor: z
        .object({
          actorId: z.uuid(),
          label: z.string().max(300),
          role: identity,
          parentActorId: z.uuid().optional(),
        })
        .optional(),
    })
    .optional(),
  acknowledgmentIds: z.array(identity).max(128).optional(),
  acknowledgmentSessions: z.int().nonnegative().optional(),
  files: z.array(z.object({ path, oid, kind: z.enum(['blob', 'commit']) })).max(2048),
  taskPaths: z.array(path).max(128),
  checkpoint: z
    .object({
      checkpointId: z.uuid(),
      storeId: z.uuid(),
      runId: identity,
      contextCommit: oid,
      sourceCommit: oid,
      inputCommit: oid,
    })
    .optional(),
});
export const historyLinkSchema = z.object({
  from: identity,
  to: identity,
  kind: z.enum(['input', 'checkpoint', 'handoff', 'baseline']),
});
export const historySnapshotSchema = z.object({
  source: identity,
  capturedAt: z.iso.datetime({ offset: true }),
  exportSha256: digest,
  producer: z.object({
    name: identity,
    version: identity,
    sourceCommit: z.string().max(100).nullable(),
    sourceTree: z.string().max(100).nullable(),
    sourceDirty: z.boolean().nullable(),
  }),
  nodes: z.array(historyNodeSchema).min(1).max(128),
  links: z.array(historyLinkSchema).max(256),
  warnings: z.array(z.string().max(2000)).max(100),
});
export const inspectorSchema = z.object({
  id: z.uuid(),
  importedAt: z.iso.datetime(),
  traceExportSha256: digest,
  task: taskSnapshotSchema,
  history: historySnapshotSchema,
});
export const sourceTargetSchema = z.object({
  snapshotId: z.uuid(),
  view: z.enum(['relationships', 'history']),
  itemId: identity,
});
export const inspectorFilesSchema = z.object({
  taskFile: path.describe('Absolute path to the exact Markdown source used for the Trace export.'),
  traceFile: path.describe(
    'Absolute path to markdown-trace --format graph JSON, with an explicit profile and passing complete validation.',
  ),
  historyFile: path.describe(
    'Absolute path to capsule export-history JSON for the task run. Retained context must contain the exact task bytes.',
  ),
});
export type Inspector = z.infer<typeof inspectorSchema>;
export type SourceTarget = z.infer<typeof sourceTargetSchema>;
export type TaskSnapshot = z.infer<typeof taskSnapshotSchema>;
export type HistorySnapshot = z.infer<typeof historySnapshotSchema>;
export type InspectorFiles = z.infer<typeof inspectorFilesSchema>;
