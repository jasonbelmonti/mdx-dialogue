import { documentSelectionMeta } from '../document-selection.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import {
  graphInputSchema,
  graphReplySchema,
  graphSnapshotSchema,
  type GraphDialogue,
} from '../../shared/graph/schema.js';
import { graphVocabulary } from '../../shared/graph/vocabulary.js';
import { GraphStore } from './store.js';
const uri = 'ui://mdx-dialogue/graph-workspace-v6.html';
const mutation = { readOnlyHint: false, destructiveHint: false, openWorldHint: false };
const answer = (graphDialogue: GraphDialogue) => ({
  content: [{ type: 'text' as const, text: JSON.stringify(graphDialogue) }],
  structuredContent: { graphDialogue },
});
const guarded = (fn: () => GraphDialogue, selectionOwner?: object) => {
  try {
    const doc = fn();
    return {
      ...answer(doc),
      ...(selectionOwner ? { _meta: documentSelectionMeta(selectionOwner, doc.id) } : {}),
    };
  } catch (error) {
    return {
      isError: true,
      content: [
        { type: 'text' as const, text: error instanceof Error ? error.message : String(error) },
      ],
    };
  }
};
export function registerGraphTools(server: McpServer, store: GraphStore) {
  // Keep previously advertised resource URIs readable for connected clients.
  for (const resourceUri of [
    uri,
    'ui://mdx-dialogue/graphs-v1.html',
    'ui://mdx-dialogue/graph-workspace-v2.html',
    'ui://mdx-dialogue/graph-workspace-v3.html',
    'ui://mdx-dialogue/graph-workspace-v4.html',
    'ui://mdx-dialogue/graph-workspace-v5.html',
  ])
    server.registerResource(
      resourceUri === uri ? 'graph-document' : `graph-document-${resourceUri.split('/').at(-1)}`,
      resourceUri,
      { mimeType: 'text/html;profile=mcp-app' },
      async () => ({
        contents: [
          {
            uri: resourceUri,
            mimeType: 'text/html;profile=mcp-app',
            text: await readFile('dist/graph-widget/graph-widget.html', 'utf8'),
            _meta: {
              ui: { csp: { connectDomains: [], resourceDomains: [] }, prefersBorder: false },
              'openai/ui': { availableDisplayModes: ['fullscreen'] },
            },
          },
        ],
      }),
    );
  server.registerTool(
    'open_graph_dialogue',
    {
      title: 'Open an interactive graph document',
      description:
        'Use when explaining relationships, dependencies, processes or concepts benefits from an interactive diagram. Pass documentId to reopen an existing document without creating another one. Otherwise compose an initial explanation in document, or omit both to let the user enter a prompt. Never pass both document and documentId. Read later node annotations and use respond_to_graph to revise the same document. ' +
        graphVocabulary,
      inputSchema: { document: graphReplySchema.optional(), documentId: z.uuid().optional() },
      outputSchema: graphSnapshotSchema.shape,
      annotations: mutation,
      _meta: { ui: { resourceUri: uri }, 'openai/ui': { entrypoints: [{ type: 'thread' }] } },
    },
    async ({ document, documentId }) =>
      guarded(() => {
        if (document && documentId) throw new Error('Pass document or documentId, not both.');
        return documentId ? store.read(documentId) : store.create(document);
      }, store),
  );
  server.registerTool(
    'get_graph_dialogue',
    {
      description: 'Read the accepted MDX graph document and exact user node annotation.',
      inputSchema: { documentId: z.uuid() },
      outputSchema: graphSnapshotSchema.shape,
      annotations: { ...mutation, readOnlyHint: true },
      _meta: { ui: { visibility: ['app', 'model'] } },
    },
    async ({ documentId }) => guarded(() => store.read(documentId)),
  );
  server.registerTool(
    'submit_graph_annotation',
    {
      description:
        'Save the user prompt or selected node annotation against its document revision.',
      inputSchema: graphInputSchema.shape,
      outputSchema: graphSnapshotSchema.shape,
      annotations: mutation,
      _meta: { ui: { visibility: ['app'] } },
    },
    async (input) => guarded(() => store.submit(input)),
  );
  server.registerTool(
    'respond_to_graph',
    {
      description:
        'Accept a model-authored explanation and graphs for a saved user request. Updates the same panel. ' +
        graphVocabulary,
      inputSchema: { documentId: z.uuid(), submissionId: z.uuid(), ...graphReplySchema.shape },
      outputSchema: graphSnapshotSchema.shape,
      annotations: mutation,
      _meta: { ui: { visibility: ['model'] } },
    },
    async ({ documentId, submissionId, ...reply }) =>
      guarded(() => store.complete(documentId, submissionId, reply, 'host-model')),
  );
}
