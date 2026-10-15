import { HostDocuments } from '../bridge/host-documents.js';
import { DocumentState } from '../bridge/document-state.js';
import { App } from '@modelcontextprotocol/ext-apps';
import { createWorkspaceDisplay } from './workspaceDisplay.js';
import { applyHostTheme } from './hostTheme.js';
import {
  graphSnapshotSchema,
  type GraphDialogue,
  type GraphInput,
} from '../../shared/graph/schema.js';
export const app = new App(
  { name: 'MDX Graph Studio', version: '0.3.2' },
  { availableDisplayModes: ['fullscreen'] },
  { autoResize: true },
);
export const workspaceDisplay = createWorkspaceDisplay(app);
app.onhostcontextchanged = (context) => {
  applyHostTheme(context);
  workspaceDisplay.updateContext(context);
};
const state = new DocumentState<GraphDialogue>((next, current) => {
  if (next.revision === current.revision) next.content = current.content;
  return next;
});
let error: string | null = null;
const listeners = new Set<() => void>();
function emit() {
  listeners.forEach((fn) => fn());
}
export function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
export const snapshot = state.read;
export const connectionError = () => error;
function parseResult(result: {
  isError?: boolean;
  content?: unknown;
  structuredContent?: unknown;
}) {
  if (result.isError)
    throw new Error(
      (result.content as { text?: string }[])?.find((x) => x.text)?.text ??
        'Host rejected the request.',
    );
  return graphSnapshotSchema.parse(result.structuredContent).graphDialogue;
}
const documents = new HostDocuments(state, async (documentId) => {
  await ready;
  return parseResult(
    await app.callServerTool({ name: 'get_graph_dialogue', arguments: { documentId } }),
  );
});
app.ontoolresult = (result) => {
  try {
    void documents
      .receive(parseResult(result), result._meta)
      .then(() => {
        error = null;
        emit();
      })
      .catch((e) => {
        error = String(e);
        emit();
      });
  } catch (e) {
    error = String(e);
    emit();
  }
};
const ready = app
  .connect()
  .then(() => {
    applyHostTheme(app.getHostContext() ?? {});
    const caps = app.getHostCapabilities();
    if (!caps?.serverTools || !caps?.message || !caps?.updateModelContext)
      throw new Error('This host requires tool, message and model-context capabilities.');
    // Placement failure must not prevent using the document or sending an annotation.
    void workspaceDisplay.initialize();
  })
  .catch((e) => {
    error = String(e);
    emit();
    throw e;
  });
void ready.catch(() => {});
export async function refresh(documentId: string) {
  const next = await documents.refresh(documentId);
  emit();
  return next;
}
export async function deliver(input: GraphInput) {
  await ready;
  state.assertSelected(input.documentId);
  // Repeating this save is safe even if a previous transport failed after committing it.
  await documents.save(input.documentId, async () =>
    parseResult(await app.callServerTool({ name: 'submit_graph_annotation', arguments: input })),
  );
  emit();
  state.assertSelected(input.documentId);
  await app.updateModelContext({
    structuredContent: { ...input },
    content: [
      {
        type: 'text',
        text: 'The user submitted this prompt or selected-node annotation in the graph document.',
      },
    ],
  });
  state.assertSelected(input.documentId);
  const response = await app.sendMessage({
    role: 'user',
    content: [
      {
        type: 'text',
        text: `Read get_graph_dialogue for document ${input.documentId}, respond to submission ${input.submissionId}, and call respond_to_graph with the revised MDX and graph data. The saved annotation and selected node identify the user's request.`,
      },
    ],
  });
  if (response.isError)
    throw new Error(
      'The host could not deliver this request. Your input is saved; retry to send it.',
    );
}
