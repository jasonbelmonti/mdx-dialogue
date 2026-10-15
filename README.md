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

`plugin/` is a local development package. The repository marketplace at `.agents/plugins/marketplace.json` exposes it as `mdx-dialogue@mdx-dialogue-local`. It connects to `http://127.0.0.1:4319/mcp`, keeping the native test separate from the original demo on port 4317.

### Native Codex test

Build the web bundles, then keep the local service running in a terminal:

```sh
PORT=4319 npm start
```

From this worktree, register and install the package using a Codex CLI that supports plugins:

```sh
codex plugin marketplace add "$PWD"
codex plugin add mdx-dialogue@mdx-dialogue-local
codex plugin list --marketplace mdx-dialogue-local --json
```

Refresh the desktop client after installation and return to the same conversation. Ask its model to call `open_graph_dialogue`, composing a document or supplying `documentId` to reopen a saved one. Passing both `document` and `documentId` is rejected. Select a node, enter an annotation, and choose **Discuss & revise** in the native panel. The host model should read the saved request and call `respond_to_graph`; that tool updates the same document while the panel refreshes. The native route does not invoke the local CLI model runner.

The graph requests a persistent workspace using the MCP Apps `fullscreen` display mode. It declares that mode on both the UI resource and initialization, and requests it once when the host advertises support. If the host keeps it inline, **Open beside chat** retries the request. Hosts that do not advertise expansion keep the inline document usable. Collapsing the workspace does not trigger repeated automatic expansion. This applies to the active conversation; restoration after quitting Codex is not implemented.

Widget resources use versioned URIs because native hosts can cache them. After a widget update, refresh the desktop client and reopen the same `documentId` to pick up the new tool/resource metadata. Previously advertised resource URIs remain readable. The header's workspace status distinguishes the new widget from older cached cards. Actual side-panel placement must still be verified in the target host; passing protocol tests does not prove it.

Verify the actual native panel and incoming message in the same chat, then inspect **View the round trip**: the document ID must stay unchanged, revision must advance, the selected node and submission must match, and the completed submission must report `source: host-model`. A successful install, protocol test, or the standalone `/graphs` browser harness does not establish native host support. Native rendering and same-chat delivery remain unverified until this observation succeeds. If the service stopped during the desktop refresh, restart it using the command above.

The local host binds to loopback and rejects foreign hosts/origins. Public hosting, authentication and distribution are outside this prototype.

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
