# Task relationships and Capsule history

Available in npm beta.3 and later, the inspector adds **Relationships**, **History**, and **Response** views above the same bottom composer. Select an entity or history event, ask a question, then open **Response** when the revision advances. Switching views keeps the draft and clears the selection so the next question cannot silently target the previous view. After an error, editing the question or selection lets you submit the corrected request. **Retry saved request** remains available for the original question and selection; a new request waits until the server confirms that no response is pending.

Relationships use Markdown Trace's authored entities and directed, typed links. The default hides context headings; **Context sections** includes them, and **Focus selection** limits the graph to the selected entity and its immediate neighbors. The entity menu also provides keyboard access. The source inspector shows exact excerpts with line ranges and required enclosing context.

History is a timeline of captured source commits and context events. Select an event to inspect its worktree, parents, typed links, recorded actor/session, retained file identities and checkpoint identities. Missing attribution remains unknown. A task match means those exact bytes occur in that context tree; it does not establish comprehension or successful execution.

## Prepare inputs

Use your installed Markdown Trace and Context Capsules commands. The importer reads files only and does not install or invoke these runtimes. Existing graph conversations need neither runtime.

```sh
inspection_dir=$(mktemp -d)
markdown-trace --file /absolute/task.md \
  --profile /absolute/owned-trace-profile.json --format graph \
  > "$inspection_dir/trace.json"
capsule export-history --source /absolute/project/.worktrees/task \
  --run task-run --output "$inspection_dir/history.json"
```

Require passing, complete Trace validation and the matching exact task bytes. Capsule history must retain those task bytes in at least one captured context tree. For a skill-managed runtime, use its configured executable instead of substituting another command on PATH. The tested formats are Markdown Trace `document-graph.v1` graph/validation JSON and Context Capsules 0.5.0 history export schema 1. An HTML viewer export is not a JSON input.

## Open in a host

[Install the beta](install.md) and start the service used by your Codex plugin, or build and run a source checkout. Ask its model to call `open_project_inspector` with these arguments:

```json
{
  "taskFile": "/absolute/task.md",
  "traceFile": "/absolute/export/trace.json",
  "historyFile": "/absolute/export/history.json"
}
```

The tool opens the usual persistent workspace and returns its document ID. Reopen it through `open_graph_dialogue` with `documentId`. In the local browser harness, use `/graphs?document=DOCUMENT_ID`. After upgrading, restart the service and refresh/reconnect the host to discover the new tool and widget resource.

For the installed Copilot Canvas, pass the same three paths under `inspector` in `open_canvas`'s input. Use a new Canvas instance for a new import; reopening an existing instance preserves its saved snapshot. Copilot uses the current session for replies. The local browser harness uses the authenticated Codex CLI.

After a submission, the host reads the saved document. Its latest submission contains `sourceTarget` (snapshot, view and item IDs) and server-resolved `sourceContext`. The model answers with `respond_to_graph`, or the matching Canvas action, using the existing title/summary/MDX/graphs contract. `graphs: []` supports a prose answer. The answer appears in **Response**; it never replaces the task or history data.

## Snapshot and evidence limits

- These views are captured snapshots. They do not monitor files, repair Capsule runs, edit task Markdown, or create checkpoints. Reimport into a new workspace to inspect newer evidence.
- The task file hash must match the supplied Trace export. Import checks identities, source ranges and relationship ownership. Passing validation is reported from the supplied export; it is not rerun against a profile by MDX Dialogue.
- The reader verifies the Git blob identity of matched task bytes and checkpoint records. History export metadata is supplied evidence, not an authenticated signature or a live Git audit. Source commits and context snapshots remain separate tracks.
- Imported snapshots omit history blobs and diffs. The model receives selected source excerpts or event metadata with bounded file inventory; it cannot infer file contents, uncheckpointed changes, uncaptured conversation, or current acceptance from a historical label. `verifies` and `verified-by` describe authored proof relationships, not completed checks.
- Inputs are limited to a 128 KiB task, 2 MiB Trace export, 16 MiB history export, 128 entities/events, 256 relationships/history links, and a 512 KiB projected workspace. Oversized or incomplete imports fail without creating a document. Selected model context is limited to 48 KB; history context includes at most 40 file identities with an explicit omitted count.
- Docusaurus continues to render accepted response MDX and diagrams. The source inspector lives in the interactive workspace.

Import and dialogue tests exercise both host adapters. Browser and controlled adapter evidence do not establish native desktop acceptance on another machine.
