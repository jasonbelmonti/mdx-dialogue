import { readFile } from 'node:fs/promises';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  modelReplySchema,
  selectionSchema,
  snapshotSchema,
  vocabulary,
} from '../shared/dialogue.js';
import { DialogueStore } from './dialogue-store.js';

export const widgetUri = 'ui://mdx-dialogue/comparison.html';
export function createMcpServer(store: DialogueStore) {
  const server = new McpServer(
    { name: 'mdx-dialogue', version: '0.1.0' },
    {
      instructions: `Open a comparison with open_dialogue. User interaction creates a submission. Read its exact input with get_dialogue, then use respond_to_selection to return model-authored MDX to the same panel. Never claim the loop is complete until that tool accepts the response. ${vocabulary}`,
    },
  );
  const readOnly = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };
  const mutation = { readOnlyHint: false, destructiveHint: false, openWorldHint: false };
  const answer = (dialogue: ReturnType<DialogueStore['read']>) => ({
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify({
          documentId: dialogue.id,
          revision: dialogue.revision,
          latest: dialogue.submissions.at(-1) ?? null,
        }),
      },
    ],
    structuredContent: { dialogue },
  });
  const guarded = (fn: () => ReturnType<typeof answer>) => {
    try {
      return fn();
    } catch (error) {
      return {
        isError: true,
        content: [
          {
            type: 'text' as const,
            text: error instanceof Error ? error.message : 'Operation failed.',
          },
        ],
      };
    }
  };
  server.registerResource(
    'comparison',
    widgetUri,
    { mimeType: 'text/html;profile=mcp-app' },
    async () => ({
      contents: [
        {
          uri: widgetUri,
          mimeType: 'text/html;profile=mcp-app',
          text: await readFile('dist/widget/widget.html', 'utf8'),
          _meta: { ui: { csp: { connectDomains: [], resourceDomains: [] }, prefersBorder: false } },
        },
      ],
    }),
  );
  server.registerTool(
    'open_dialogue',
    {
      title: 'Open MDX comparison',
      description:
        'Open a new interactive comparison for the user to select a layout and annotate it.',
      inputSchema: {},
      outputSchema: snapshotSchema.shape,
      annotations: mutation,
      _meta: { ui: { resourceUri: widgetUri }, 'openai/ui': { entrypoints: [{ type: 'thread' }] } },
    },
    async () => guarded(() => answer(store.create())),
  );
  server.registerTool(
    'get_dialogue',
    {
      description:
        'Read a comparison, user submissions, response state and accepted model replies.',
      inputSchema: { documentId: z.uuid() },
      outputSchema: snapshotSchema.shape,
      annotations: readOnly,
      _meta: { ui: { visibility: ['app', 'model'] } },
    },
    async ({ documentId }) => guarded(() => answer(store.read(documentId))),
  );
  server.registerTool(
    'submit_selection',
    {
      description:
        'Record a revision-bound user selection. The app next sends a message requesting the model response.',
      inputSchema: selectionSchema.shape,
      outputSchema: snapshotSchema.shape,
      annotations: mutation,
      _meta: { ui: { visibility: ['app'] } },
    },
    async (input) => guarded(() => answer(store.submit(input))),
  );
  server.registerTool(
    'respond_to_selection',
    {
      description: `Return the model's response to a specific submitted selection; this updates the existing panel. ${vocabulary}`,
      inputSchema: { documentId: z.uuid(), submissionId: z.uuid(), ...modelReplySchema.shape },
      outputSchema: snapshotSchema.shape,
      annotations: mutation,
      _meta: { ui: { visibility: ['model'] } },
    },
    async ({ documentId, submissionId, ...reply }) =>
      guarded(() => answer(store.complete(documentId, submissionId, reply, 'host-model'))),
  );
  return server;
}
