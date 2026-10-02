# MDX Dialogue

A working proof of a visual conversation: choose a document layout, add a note, and receive a real model-authored MDX reply with a revised visual preview in the same panel.

The local harness uses the official MCP Apps `App` and `AppBridge` SDKs. The embedded panel sends `tools/call`, `ui/update-model-context`, and `ui/message`. The host runs the authenticated Codex CLI, validates its response, and exposes the updated document through MCP. No model response is hardcoded.

## Run

Requires Node 22.20+ and an authenticated `codex` executable on PATH.

```sh
npm ci
npm run build
npm start
```

Open **http://127.0.0.1:4317**. Select a layout, enter a note such as “use a green accent and compact controls,” and click **Discuss & revise**. The response includes a new preview and a **View the round trip** disclosure with the exact input, submission ID, and generated MDX. Each opened page has its own document ID in the URL; bookmark that URL to reopen it.

`CODEX_BIN` can select an installed Codex executable. `PORT` changes the loopback port. The local runner uses the CLI's default model with user configuration omitted for an isolated invocation; it keeps the existing account authentication. It uses read-only sandboxing, disables shell/apps/multi-agent/web-search features, and requests schema-constrained output. This is an actual model call using the signed-in account.

The server saves dialogue state in `.data/dialogues.json`. Each model attempt retains its request, events, stderr, and response receipt under `.data/runs/`. These files are ignored by Git. Interrupted runs become retryable when the server restarts. A failing response leaves the selection and annotation available.

## What is proven

- The initial document in `content/comparison.mdx` is compiled as MDX with React components.
- The embedded panel uses the actual MCP Apps bridge, including structured context and a follow-up message.
- A real Codex CLI response returns restricted MDX and changes the layout, accent, and spacing rendered by `LayoutPreview`.
- MCP protocol tests exercise real tool discovery, resource retrieval, submission and response calls.

The local host is a small custom harness. Native ChatGPT/Codex conversation-panel installation has not been verified. A successful local bridge test does not establish native host feature availability.

## Native MCP integration

The server exposes `open_dialogue`, `get_dialogue`, `submit_selection` (app visibility), and `respond_to_selection` (model visibility), plus a self-contained MCP App HTML resource. Tool metadata declares a conversation-panel entrypoint. In a native host, the host's model calls `respond_to_selection` directly; the local Codex runner is not involved.

For a local stdio MCP client:

```sh
npm run build
npm run mcp:stdio
```

`scripts/start-mcp.sh` runs this server from any working directory. For a Codex CLI tool-only check, register it using `codex mcp add mdx-dialogue -- /absolute/path/to/mdx-dialogue/scripts/start-mcp.sh`. Registration changes your Codex configuration; it is not performed by this project. CLI tool availability alone does not prove UI support.

`plugin/` contains a portable plugin manifest and MCP configuration for a local host that can reach `http://127.0.0.1:4317/mcp`. Start the HTTP server first. The manifest is a development scaffold; it is not published or installed. A remote ChatGPT service cannot reach your loopback URL directly. Native testing needs a supported private MCP tunnel or a properly configured endpoint and host registration. The current server intentionally rejects foreign origins/hosts; do not expose it publicly without adding the appropriate transport/authentication configuration.

Once connected in a compatible host, ask: “Open an MDX comparison.” Submit a choice in the panel. The host model should read the saved submission and call `respond_to_selection` with the documented component vocabulary. The panel polls `get_dialogue` while waiting and displays the accepted response.

## MDX boundary

The initial application MDX is trusted project source. Model-authored MDX is parsed with `remark-mdx` and rendered from a validated syntax tree; it is never evaluated as JavaScript. Supported reply content is headings, paragraphs, emphasis, lists, inline code, and exactly one component:

```mdx
<LayoutPreview layout="split" accent="green" density="compact" />
```

Supported values: `layout="split|stacked"`, `accent="violet|blue|green"`, `density="comfortable|compact"`. Attributes must be literal strings. Imports, expressions, scripts, arbitrary HTML, unknown components, and duplicate attributes are rejected before state mutation.

This vocabulary can be registered through Docusaurus's MDX component mapping. A full Docusaurus site, navigation, publishing, and arbitrary MDX execution are outside this prototype.

## Development

```sh
npm run check
npm test
npm run build
```

`npm run dev` builds the web bundles and watches server code. Run `npm run build` after frontend or MDX edits, then reload the page. Browser checks were performed with Playwright CLI because the Browser plugin was not available in the build session.

Code ownership:

- `shared/`: wire schemas and the restricted MDX language.
- `server/dialogue-store.ts`: revision and submission state transitions.
- `server/codex-runner.ts`: isolated model subprocess and attempt evidence.
- `server/mcp.ts`: tools and UI resource.
- `server/http.ts`: loopback HTTP host and model request dispatch.
- `web/host.ts`: local MCP Apps host.
- `web/bridge/`: embedded app bridge.
- `web/components/`: comparison, form, preview, and model reply.

Local prototype limits: one active model run at a time, 100 saved documents, 20 submissions per document, a three-minute model timeout, and no multi-user authentication. The built UI bundles include SDKs and an MDX parser; bundle optimization is deferred.
