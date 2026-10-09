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
const uri = 'ui://mdx-dialogue/graphs-v1.html';
const mutation = { readOnlyHint: false, destructiveHint: false, openWorldHint: false };
const answer = (graphDialogue: GraphDialogue) => ({
  content: [{ type: 'text' as const, text: JSON.stringify(graphDialogue) }],
  structuredContent: { graphDialogue },
});
const guarded = (fn: () => GraphDialogue) => {
  try {
    return answer(fn());
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
  server.registerResource(
    'graph-document',
    uri,
    { mimeType: 'text/html;profile=mcp-app' },
    async () => ({
      contents: [
        {
          uri,
          mimeType: 'text/html;profile=mcp-app',
          text: await readFile('dist/graph-widget/graph-widget.html', 'utf8'),
          _meta: { ui: { csp: { connectDomains: [], resourceDomains: [] }, prefersBorder: false } },
        },
      ],
    }),
  );
  server.registerTool(
    'open_graph_dialogue',
    {
      title: 'Open an interactive graph document',
      description:
        'Use when explaining relationships, dependencies, processes or concepts benefits from an interactive diagram. Compose an initial explanation in document to express an idea visually, or omit it to let the user enter a prompt. Read later node annotations and use respond_to_graph to revise. ' +
        graphVocabulary,
      inputSchema: { document: graphReplySchema.optional() },
      outputSchema: graphSnapshotSchema.shape,
      annotations: mutation,
      _meta: { ui: { resourceUri: uri }, 'openai/ui': { entrypoints: [{ type: 'thread' }] } },
    },
    async ({ document }) => guarded(() => store.create(document)),
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
