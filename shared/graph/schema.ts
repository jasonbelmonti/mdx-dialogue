import { z } from 'zod';
export const graphId = z.string().regex(/^[a-z][a-z0-9-]{0,63}$/);
export const nodeSchema = z.object({
  id: graphId,
  label: z.string().min(1).max(100),
  description: z.string().max(600),
  kind: z.enum(['concept', 'process', 'decision', 'store']),
});
export const graphSchema = z.object({
  id: graphId,
  title: z.string().min(1).max(140),
  nodes: z.array(nodeSchema).min(1).max(32),
  edges: z
    .array(z.object({ id: graphId, source: graphId, target: graphId, label: z.string().max(120) }))
    .max(64),
});
export const graphReplySchema = z.object({
  title: z.string().min(1).max(140),
  summary: z.string().min(1).max(600),
  mdx: z.string().min(1).max(12000),
  graphs: z.array(graphSchema).min(1).max(3),
});
export const targetSchema = z.object({ graphId, nodeId: graphId });
export const graphInputSchema = z.object({
  documentId: z.uuid(),
  revision: z.number().int().positive(),
  submissionId: z.uuid(),
  annotation: z.string().trim().min(1).max(2000),
  target: targetSchema.nullable(),
});
export const graphSubmissionSchema = graphInputSchema.extend({
  status: z.enum(['awaiting-model', 'running', 'complete', 'failed']),
  createdAt: z.string(),
  completedAt: z.string().optional(),
  error: z.string().optional(),
  reply: graphReplySchema.optional(),
  source: z.enum(['codex-cli', 'host-model']).optional(),
});
export const graphDialogueSchema = z.object({
  id: z.uuid(),
  revision: z.number().int().positive(),
  content: graphReplySchema.nullable(),
  submissions: z.array(graphSubmissionSchema),
});
export const graphSnapshotSchema = z.object({ graphDialogue: graphDialogueSchema });
export type Graph = z.infer<typeof graphSchema>;
export type GraphReply = z.infer<typeof graphReplySchema>;
export type GraphInput = z.infer<typeof graphInputSchema>;
export type GraphTarget = z.infer<typeof targetSchema>;
export type GraphSubmission = z.infer<typeof graphSubmissionSchema>;
export type GraphDialogue = z.infer<typeof graphDialogueSchema>;
