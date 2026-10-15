import { z } from 'zod';

// Host-visible intent, independent of the content revision and submission lifecycle.
export const documentSelectionKey = 'mdx-dialogue/selection';
export const documentSelectionSchema = z.object({
  documentId: z.uuid(),
  epoch: z.uuid(),
  sequence: z.number().int().positive(),
});
export type DocumentSelection = z.infer<typeof documentSelectionSchema>;
