import { z } from 'zod';
import { graphReplySchema } from '../../shared/graph/schema.js';
import { CanvasDocuments, type CanvasIdentity, type CopilotSession } from './documents.js';
import { startCanvasServer } from './http.js';

const openSchema = z.object({ initial: graphReplySchema.optional() });
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
      description:
        'Discuss systems, concepts and workflows visually with interactive graphs and a persistent annotation composer. Open with optional initial document, read annotations, then respond in this Canvas.',
      inputSchema: z.json().parse(z.toJSONSchema(openSchema)),
      open: (ctx: Request) => {
        const { initial } = openSchema.parse(ctx.input ?? {});
        const instance = documents.open(
          { sessionId: ctx.sessionId, instanceId: ctx.instanceId },
          initial,
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
          description:
            'Accept a revised document for the latest saved submission. Use restricted Markdown with literal FlowGraph components; never executable MDX. A successful reply updates this same Canvas.',
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
