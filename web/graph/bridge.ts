import { App } from '@modelcontextprotocol/ext-apps';
import {
  graphSnapshotSchema,
  type GraphDialogue,
  type GraphInput,
} from '../../shared/graph/schema.js';
export const app = new App(
  { name: 'MDX Graph Studio', version: '0.2.0' },
  {},
  { autoResize: true },
);
let current: GraphDialogue | null = null;
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
export const snapshot = () => current;
export const connectionError = () => error;
function accept(result: { isError?: boolean; content?: unknown; structuredContent?: unknown }) {
  if (result.isError)
    throw new Error(
      (result.content as { text?: string }[])?.find((x) => x.text)?.text ??
        'Host rejected the request.',
    );
  const next = graphSnapshotSchema.parse(result.structuredContent).graphDialogue;
  if (current?.id === next.id && next.revision < current.revision) return current;
  if (current?.id === next.id && current.revision === next.revision) next.content = current.content;
  current = next;
  emit();
  return next;
}
app.ontoolresult = (result) => {
  try {
    accept(result);
  } catch (e) {
    error = String(e);
    emit();
  }
};
const ready = app
  .connect()
  .then(() => {
    const caps = app.getHostCapabilities();
    if (!caps?.serverTools || !caps?.message || !caps?.updateModelContext)
      throw new Error('This host requires tool, message and model-context capabilities.');
  })
  .catch((e) => {
    error = String(e);
    emit();
    throw e;
  });
void ready.catch(() => {});
export async function refresh(documentId: string) {
  await ready;
  return accept(
    await app.callServerTool({ name: 'get_graph_dialogue', arguments: { documentId } }),
  );
}
export async function deliver(input: GraphInput) {
  await ready;
  // Repeating this save is safe even if a previous transport failed after committing it.
  accept(await app.callServerTool({ name: 'submit_graph_annotation', arguments: input }));
  await app.updateModelContext({
    structuredContent: { ...input },
    content: [
      {
        type: 'text',
        text: 'The user submitted this prompt or selected-node annotation in the graph document.',
      },
    ],
  });
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
