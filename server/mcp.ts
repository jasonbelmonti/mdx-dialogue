import { packagePath, packageVersion } from './package-paths.js';
import { documentSelectionMeta, documentStoreMeta } from './document-selection.js';
import { GraphStore } from './graph/store.js';
import { registerGraphTools } from './graph/mcp.js';
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

export const widgetUri = 'ui://mdx-dialogue/comparison-v4.html';
export function createMcpServer(store: DialogueStore, graphs = new GraphStore()) {
  const server = new McpServer(
    { name: 'mdx-dialogue', version: packageVersion },
    {
      instructions:
        'Use prose when sufficient. When an interactive graph clarifies relationships, dependencies, processes or concepts, use open_graph_dialogue with a composed document. Read graph annotations with get_graph_dialogue and revise through respond_to_graph. Each tool documents its component vocabulary. The separate layout demonstration uses open_dialogue, get_dialogue and respond_to_selection. Read the exact saved submission before responding. Never claim a revision is accepted until its response tool succeeds.',
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
  for (const resourceUri of [
    widgetUri,
    'ui://mdx-dialogue/comparison-v3.html',
    'ui://mdx-dialogue/comparison-v2.html',
    'ui://mdx-dialogue/comparison.html',
  ])
    server.registerResource(
      resourceUri === widgetUri ? 'comparison' : 'comparison-legacy',
      resourceUri,
      { mimeType: 'text/html;profile=mcp-app' },
      async () => ({
        contents: [
          {
            uri: resourceUri,
            mimeType: 'text/html;profile=mcp-app',
            text: await readFile(packagePath('dist/widget/widget.html'), 'utf8'),
            _meta: {
              ui: { csp: { connectDomains: [], resourceDomains: [] }, prefersBorder: false },
            },
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
    async () =>
      guarded(() => {
        const doc = store.create();
        return { ...answer(doc), _meta: documentSelectionMeta(store, doc.id) };
      }),
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
    async ({ documentId }) =>
      guarded(() => ({ ...answer(store.read(documentId)), _meta: documentStoreMeta(store) })),
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
  registerGraphTools(server, graphs);
  return server;
}
