# MDX Dialogue

A local proof of a model composing an interactive explanation, receiving an annotation about a selected graph node, and revising the same document. React Flow draws the graph; Docusaurus displays the same accepted MDX and graph data through the shared renderer.

The MCP Apps `App` and `AppBridge` SDKs carry tool calls, structured model context and follow-up messages. The local host invokes the authenticated Codex CLI. Graph content and replies come from actual model calls.

## Run

Requires Node 22.20+ and an authenticated `codex` executable on PATH.

```sh
npm ci
npm run build
npm run docs:build
npm start
```

Open **http://127.0.0.1:4317/graphs**. Describe a system, process, learning map or concept, then choose **Create document**. Select a graph node (or use the **Discuss a node** menu), enter a question or change, and choose **Discuss & revise**. The accepted revision replaces the document in place. Dragging nodes and zooming remain local presentation state.

The host's **Read in Docusaurus** link opens the same document at `/docs/graph?document=…`, with its ID and revision. The Docusaurus page reads the accepted document from the local API when opened; reload it after a later revision. Its **Discuss or revise in Graph Studio** link returns to the same conversation.

The original layout proof remains at **http://127.0.0.1:4317/**. Bookmark a document's full URL to reopen it. **View the round trip** exposes the saved request and accepted response.

`CODEX_BIN` selects the CLI executable. `PORT` changes the loopback port. The CLI uses the account's authentication with user configuration omitted, read-only sandboxing, shell/apps/multi-agent/web search disabled, and schema-constrained output. Each submission uses the signed-in account's model allowance.

State is saved in `.data/graphs.json` and `.data/dialogues.json`. Each attempt retains request, events, stderr and response receipt under `.data/runs/`. These are ignored by Git. Failures retain the exact annotation, target and submission ID; **Retry saved request** retries that request. Interrupted runs become retryable on server restart.

## A reusable graph vocabulary

The model tool `open_graph_dialogue` describes when a diagram helps: relationships, dependencies, processes and concepts. It accepts an optional `document` so a model can compose an interactive explanation directly, or can open a blank prompt surface. Subsequent node annotations use `respond_to_graph` to update the existing document.

A graph document contains `title`, `summary`, `mdx` and a `graphs` array. MDX combines prose with literal component references:

```mdx
## How the pieces connect

A short explanation can introduce the important relationship.

<FlowGraph id="overview" data="request-path" interaction="discuss" />
```

`data` refers to a graph ID. Each graph contains semantic nodes (`id`, `label`, `description`, `kind`) and edges (`id`, `source`, `target`, `label`). Node kinds are `concept`, `process`, `decision` and `store`. Dagre supplies initial positions. Stable graph/node IDs let an annotation refer to meaning rather than screen coordinates.

The interaction carries `documentId`, `revision`, `submissionId`, `annotation`, and either a `{graphId, nodeId}` target or `null` for the whole document. Duplicate saves are idempotent. Stale responses, missing targets and invalid replies cannot advance the accepted revision.

This is one reusable component family. It does not install a global model skill or automatically make every assistant conversation use visual tools.

## MDX and Docusaurus boundary

Model-authored MDX is parsed as a restricted syntax tree and rendered as React elements. It is never evaluated as JavaScript. Headings, paragraphs, emphasis, lists and inline code are supported. Imports, expressions, scripts, arbitrary HTML, unknown components and nonliteral attributes are rejected. Graph IDs and edge endpoints are validated before persistence. Each graph must appear once in its MDX.

`site/src/pages/graph.mdx` is trusted project MDX. Its browser-only viewer uses the same `web/graph/GraphDocument.tsx` and `FlowGraph.tsx` as the MCP widget, plus the accepted document loaded by ID. The browser boundary avoids executing React Flow during Docusaurus server rendering. Generated responses never enter the Docusaurus compiler.

The standalone `site/package.json` intentionally omits `type`: Docusaurus-generated modules mix ESM imports with webpack `require.resolveWeak`. The webpack extension alias resolves shared TypeScript imports written with `.js` specifiers.

## MCP integration

Graph tools: `open_graph_dialogue`, `get_graph_dialogue`, `submit_graph_annotation` (app visibility), and `respond_to_graph` (model visibility). The existing layout tools remain available. Each flow has a self-contained MCP App resource with conversation-panel metadata.

```sh
npm run build
npm run mcp:stdio
```

`scripts/start-mcp.sh` starts the stdio server from any working directory. A compatible native host can use the tools directly, with its model calling `respond_to_graph`; it does not use the local CLI runner. The stdio server keeps state for its process lifetime; HTTP mode persists local state.

`plugin/` remains a development scaffold for a host that can reach `http://127.0.0.1:4317/mcp`. Native ChatGPT/Codex panel installation and same-thread model continuity remain unverified. The local host binds to loopback and rejects foreign hosts/origins. Public hosting, authentication and distribution are outside this prototype.

## Development

```sh
npm run check
npm run build
npm test
npm run docs:build
```

Build before the MCP resource tests on a fresh checkout. `npm run dev` builds the web bundles and watches server changes. Rebuild and reload after frontend edits. Rebuild Docusaurus separately after site/shared-renderer edits. Use the production site through the local `/docs` route to exercise its API connection; `docs:dev` on port 4318 is for site development only.

Ownership:

- `shared/graph/`: semantic schemas, graph/MDX validation and model vocabulary.
- `shared/mdx-syntax.ts`: shared restricted syntax parser.
- `server/graph/`: graph state transitions, persistence, MCP tools and HTTP dispatch.
- `server/codex-process.ts`: isolated model invocation and attempt receipts.
- `web/host.ts`: local MCP Apps harness.
- `web/graph/`: studio, interaction state, bridge and shared graph renderer.
- `site/`: Docusaurus MDX pages and browser-only saved-document view.
- Existing `web/components/`, `server/dialogue-store.ts` and layout tools retain the original proof.

Limits: one active local model run per flow, 100 documents and 20 submissions per document, up to three graphs with 32 nodes each, a three-minute model timeout, and no multi-user authentication. Pan/zoom is needed for larger graphs. Editing edges, arbitrary component code, bundle optimization and additional vocabulary families are follow-up work.

Docusaurus is a build dependency. Scoped dependency overrides update its worker pool and serialization package to patched releases; production builds verify compatibility. Other upstream build-tool audit findings are retained as a prototype limitation rather than applying incompatible forced downgrades.
