import { z } from 'zod';

export const layouts = ['split', 'stacked'] as const;
export const accents = ['violet', 'blue', 'green'] as const;
export const densities = ['comfortable', 'compact'] as const;
export const options = [
  {
    id: 'split',
    title: 'Side by side',
    description: 'Keep the explanation and interactive controls visible together.',
  },
  {
    id: 'stacked',
    title: 'One continuous page',
    description: 'Read the explanation first, then explore the controls below.',
  },
] as const;

export const selectionSchema = z.object({
  documentId: z.uuid(),
  revision: z.number().int().positive(),
  submissionId: z.uuid(),
  selectedId: z.enum(layouts),
  annotation: z.string().trim().min(1).max(1500),
});
export const modelReplySchema = z.object({
  summary: z.string().min(1).max(500),
  mdx: z.string().min(1).max(5000),
});
export type Selection = z.infer<typeof selectionSchema>;
export type ModelReply = z.infer<typeof modelReplySchema>;
export type Layout = (typeof layouts)[number];
export type Accent = (typeof accents)[number];
export type Density = (typeof densities)[number];
export type Submission = Selection & {
  status: 'awaiting-model' | 'running' | 'complete' | 'failed';
  createdAt: string;
  completedAt?: string;
  error?: string;
  reply?: ModelReply;
  source?: 'codex-cli' | 'host-model';
};
export type Dialogue = {
  id: string;
  revision: number;
  options: readonly { id: Layout; title: string; description: string }[];
  submissions: Submission[];
};
export type Snapshot = { dialogue: Dialogue };
export const snapshotSchema = z.object({
  dialogue: z.object({
    id: z.uuid(),
    revision: z.number().int(),
    options: z.array(z.object({ id: z.enum(layouts), title: z.string(), description: z.string() })),
    submissions: z.array(
      selectionSchema.extend({
        status: z.enum(['awaiting-model', 'running', 'complete', 'failed']),
        createdAt: z.string(),
        completedAt: z.string().optional(),
        error: z.string().optional(),
        reply: modelReplySchema.optional(),
        source: z.enum(['codex-cli', 'host-model']).optional(),
      }),
    ),
  }),
});

export const vocabulary = `Write a short MDX response (not a code fence). Allowed Markdown: headings, paragraphs, bold, italic, bullet/numbered lists and inline code. Include exactly one self-closing component:
<LayoutPreview layout="split" accent="violet" density="comfortable" />
Allowed layout: split|stacked. Allowed accent: violet|blue|green. Allowed density: comfortable|compact.
All three attributes must be literal strings. No imports, exports, JavaScript expressions, HTML, links or other components. Explain how the user's comment affected the proposed layout. You may choose different supported attributes to satisfy their request.`;
