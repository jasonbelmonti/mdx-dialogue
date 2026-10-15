import { HostDocuments } from './host-documents.js';
import { DocumentState } from './document-state.js';
import { App } from '@modelcontextprotocol/ext-apps';
import { snapshotSchema, type Dialogue, type Selection } from '../../shared/dialogue.js';
import {
  documentStoreEpochKey,
  documentStoreEpochSchema,
} from '../../shared/document-selection.js';

export const app = new App({ name: 'MDX Dialogue', version: '0.1.0' }, {}, { autoResize: true });
const state = new DocumentState<Dialogue>();
let failure: string | null = null;
const listeners = new Set<() => void>();
export const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
export const snapshot = state.read;
export const connectionError = () => failure;
function emit() {
  for (const listener of listeners) listener();
}
function parseResult(result: {
  isError?: boolean;
  content?: unknown;
  structuredContent?: unknown;
}) {
  if (result.isError) {
    const content = result.content as { text?: string }[] | undefined;
    throw new Error(
      content?.find((item) => item.text)?.text ?? 'The host rejected this operation.',
    );
  }
  return snapshotSchema.parse(result.structuredContent).dialogue as Dialogue;
}
const documents = new HostDocuments(state, async (documentId) => {
  await ready;
  const result = await app.callServerTool({ name: 'get_dialogue', arguments: { documentId } });
  return {
    document: parseResult(result),
    epoch: documentStoreEpochSchema.parse(result._meta?.[documentStoreEpochKey]),
  };
});
app.ontoolresult = (result) => {
  try {
    void documents
      .receive(parseResult(result), result._meta)
      .then(() => {
        failure = null;
        emit();
      })
      .catch((e) => {
        failure = String(e);
        emit();
      });
  } catch (e) {
    failure = String(e);
    emit();
  }
};
export const ready = app
  .connect()
  .then(() => {
    const capabilities = app.getHostCapabilities();
    if (!capabilities?.serverTools || !capabilities?.message || !capabilities?.updateModelContext)
      throw new Error(
        'This host needs MCP tool calls, messages and model context updates for this prototype.',
      );
  })
  .catch((error) => {
    failure = error.message;
    emit();
    throw error;
  });
// Connection failures are rendered in the panel; suppress an unobserved startup rejection.
void ready.catch(() => {});
export async function refresh(documentId: string) {
  const next = await documents.refresh(documentId);
  emit();
  return next;
}
export async function submit(selection: Selection) {
  const next = await documents.save(selection.documentId, async () => {
    await ready;
    state.assertSelected(selection.documentId);
    return parseResult(
      await app.callServerTool({ name: 'submit_selection', arguments: selection }),
    );
  });
  emit();
  return next;
}
export async function requestResponse(selection: Selection) {
  await ready;
  state.assertSelected(selection.documentId);
  await app.updateModelContext({
    structuredContent: { ...selection },
    content: [
      {
        type: 'text',
        text: 'The user submitted this layout choice and annotation in the MDX comparison panel.',
      },
    ],
  });
  state.assertSelected(selection.documentId);
  const result = await app.sendMessage({
    role: 'user',
    content: [
      {
        type: 'text',
        text: `Please discuss my submitted layout choice and revise the visual preview according to my annotation. Read get_dialogue for document ${selection.documentId}, then call respond_to_selection for submission ${selection.submissionId} with a summary and MDX using the documented LayoutPreview component.`,
      },
    ],
  });
  if (result.isError)
    throw new Error(
      'The host could not deliver the message. Your selection is saved. Retry to resend it.',
    );
}
