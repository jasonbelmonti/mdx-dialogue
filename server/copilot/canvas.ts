import { z } from 'zod';
import { graphReplySchema } from '../../shared/graph/schema.js';
import { graphMdxContract } from '../../shared/graph/mdx-contract.js';
import { CanvasDocuments, type CanvasIdentity, type CopilotSession } from './documents.js';
import { startCanvasServer } from './http.js';
import { inspectorFilesSchema } from '../../shared/inspector/schema.js';
import { importInspector } from '../inspector/import.js';

const openSchema = z.object({
  initial: graphReplySchema.optional(),
  inspector: inspectorFilesSchema.optional(),
});
const responseSchema = z.object({ submissionId: z.uuid(), reply: graphReplySchema });
type Request = CanvasIdentity & { input?: unknown };

export async function createGraphCanvas(options: {
  directory: string;
  html: string;
  session: () => CopilotSession;
}) {
  const documents = new CanvasDocuments(options.directory, options.session);
  const http = await startCanvasServer(documents, options.html);
  return {
    close: http.close,
    canvas: {
      id: 'mdx-dialogue',
      displayName: 'MDX Dialogue',
      description: `Discuss systems, concepts and workflows visually with a persistent bottom composer. Open with optional initial document, or inspector paths to an exact task Markdown file, passing Markdown Trace graph JSON and matching Capsule history JSON. Inspector opens read-only Relationships and History snapshots. Reuse the same instance; get_document includes the saved sourceContext for grounded answers in respond_to_graph. ${graphMdxContract}`,
      inputSchema: z.json().parse(z.toJSONSchema(openSchema)),
      open: async (ctx: Request) => {
        const { initial, inspector } = openSchema.parse(ctx.input ?? {});
        if (initial && inspector)
          throw new Error('Open an initial graph or inspector snapshot, not both.');
        const identity = { sessionId: ctx.sessionId, instanceId: ctx.instanceId };
        const instance =
          documents.restore(identity) ??
          documents.open(
            identity,
            initial,
            inspector ? await importInspector(inspector) : undefined,
          );
        return { url: `${http.origin}/#${instance.token}`, title: 'MDX Dialogue' };
      },
      onClose: (ctx: Request) => documents.close(ctx),
      actions: [
        {
          name: 'get_document',
          description:
            'Read the current document and saved user annotations before composing a revision.',
          inputSchema: { type: 'object', properties: {}, additionalProperties: false },
          handler: (ctx: Request) => documents.read(ctx),
        },
        {
          name: 'respond_to_graph',
          description: `Accept a revised document for the latest saved submission. A successful reply updates this same Canvas. After success, briefly tell the user what changed. ${graphMdxContract}`,
          inputSchema: z.json().parse(z.toJSONSchema(responseSchema)),
          handler: (ctx: Request) => {
            const { submissionId, reply } = responseSchema.parse(ctx.input);
            return documents.respond(ctx, submissionId, reply);
          },
        },
      ],
    },
  };
}
