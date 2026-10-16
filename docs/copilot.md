# MDX Dialogue in GitHub Copilot desktop

The Copilot version is a **Canvas extension**: a persistent visual document beside your conversation. It uses the same compact graph panel, restricted MDX and React Flow renderer as the Codex version. Your annotation goes to the current Copilot session; Copilot updates the document through Canvas actions.

For the npm beta, follow [the package installation guide](install.md). The instructions below retain the source-checkout workflow.

## Install from this checkout

Requires Node 22.20+ to build and a Copilot desktop version that supports Canvas extensions.

```sh
npm ci
npm run copilot:build
npm run copilot:install -- --user
```

The installer copies the self-contained entry point, Canvas HTML, package manifest, MIT license and dependency notices into `~/.copilot/extensions/mdx-dialogue/`. Copilot supplies `@github/copilot-sdk` when it launches the extension; do not install a second SDK there. The package needs no repository `node_modules`, Codex CLI, fixed port, API key, or running MCP service.

For one project's scope instead:

```sh
npm run copilot:install -- --project=/absolute/path/to/project
```

This uses that project's `.github/extensions/mdx-dialogue/`. Use a trusted project you intend to open in Copilot. The installer refuses an existing destination. To upgrade, close sessions using the extension, move the old extension folder outside the discovery directory as a backup, and install the new build. Saved documents live separately.

Open a new Copilot session after installation. Check **Customize → Canvas** for **MDX Dialogue**, then ask:

> Open the MDX Dialogue Canvas and map how a request moves through a web application.

If discovery has not refreshed, restart Copilot and open a new session. Installation alone is not proof that the host loaded the extension.

## Work in the panel

1. Ask Copilot to open the Canvas with a composed document, or open a blank Canvas and describe what you want in **Create document**.
2. Click a node, or choose **Whole document** in the Discuss menu.
3. Enter a question or change, then click **Discuss & revise**.
4. Copilot reads the saved annotation with `get_document` and calls `respond_to_graph`. The same document advances its revision; the panel refreshes automatically.

The composer stays below the document at all window widths. Chat displays your annotation and selected-node context; the SDK's `displayPrompt` keeps model routing instructions out of the visible message. When the saved response completes, the panel shows its updated revision and summary. Canvas discovery and input schemas describe the supported Markdown subset and exact `FlowGraph` attributes before authoring; blockquotes remain unsupported.

**Activity** exposes the document ID, revision, submission ID, selected node and response status. A completed native response records `source: host-model`. **Retry saved request** retains the exact input and submission ID. A delivery retry may send another Copilot message, but only one valid reply can advance that submission's revision.

## Data and boundaries

Each Copilot session/Canvas instance has a separate snapshot under `~/.mdx-dialogue/copilot/`. An optional `MDX_DIALOGUE_DATA_DIR` environment variable changes this location. The same host session and instance ID restore their saved document; a new instance creates a new document. A closed panel revokes its browser access token but retains its snapshot. Interrupted responses become retryable on extension restart.

The extension starts an ephemeral HTTP listener on `127.0.0.1`. Its panel URL contains an instance-specific capability in the URL fragment; do not share that URL. Document requests require the capability and reject foreign Host/Origin headers. No remote scripts or generated JavaScript are executed. Snapshots use the same atomic single-writer storage as the Codex implementation; see the root README for lock recovery and durability limits.

The core vocabulary is shared; saved documents are currently separate between Codex and Copilot. This adapter covers graph documents, not the earlier comparison-card experiment or the Docusaurus publication route. npm distribution packages this adapter; cross-host synchronization remains separate work.

## Compatibility and verification

The Canvas contract was checked against the SDK bundled with Copilot desktop **1.1.25**. Native testing on that version on **2026-10-15** verified discovery, rendering, document creation through the panel, and a selected-node revision through the actual Copilot session. The same document advanced from Revision 1 to 3, both responses recorded `source: host-model`, and the requested node description changed while node IDs and links stayed unchanged. This test also exposed and verified the fix for Canvas restoration occurring before session registration completes.

GitHub marks Canvas APIs experimental. Controlled tests additionally cover the built, relocated extension entry point, valid/invalid/stale replies, retries, session/instance separation, close/reopen and persistence after restart. Native verification is bounded to the version and interaction above; it does not establish compatibility with every host version or release readiness.

For native acceptance, observe the panel in Copilot, submit a selected-node annotation, and confirm that the same document ID advances revision with the matching submission and `source: host-model`. Record actual desktop results separately from the automated checks.

Sources: [Copilot customization](https://docs.github.com/en/copilot/how-tos/github-copilot-app/customize-github-copilot-app), [working with Canvas extensions](https://docs.github.com/en/copilot/how-tos/github-copilot-app/working-with-canvas-extensions), and [Copilot SDK extensions](https://github.com/github/copilot-sdk/blob/main/nodejs/docs/extensions.md).
