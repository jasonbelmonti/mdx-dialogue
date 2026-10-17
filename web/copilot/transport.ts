import { graphDialogueSchema, type GraphInput } from '../../shared/graph/schema.js';
import { DocumentState } from '../bridge/document-state.js';
import type { GraphDialogue } from '../../shared/graph/schema.js';
import type { GraphTransport } from '../graph/transport.js';

export function createCanvasTransport(token: string): GraphTransport & { close(): void } {
  const state = new DocumentState<GraphDialogue>((next, current) => {
    if (next.revision === current.revision) next.content = current.content;
    if (current.inspector) {
      if (next.inspector?.id !== current.inspector.id)
        throw new Error('Source snapshot changed unexpectedly. Reopen this workspace.');
      next.inspector = current.inspector;
    }
    return next;
  });
  const listeners = new Set<() => void>();
  let error: string | null = null;
  let closed = false;
  let timer: ReturnType<typeof setTimeout>;
  const emit = () => listeners.forEach((listener) => listener());
  async function request(path: string, input?: GraphInput) {
    const selected = state.selectedId();
    let ticket = selected ? state.request(selected) : undefined;
    const result = await fetch(path, {
      method: input ? 'POST' : 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        ...(input ? { 'Content-Type': 'application/json' } : {}),
      },
      body: input ? JSON.stringify(input) : undefined,
      signal: AbortSignal.timeout(15000),
    });
    const value = await result.json();
    if (!result.ok) throw new Error(value.error ?? 'Copilot Canvas request failed.');
    const document = graphDialogueSchema.parse(value);
    // This capability addresses one Canvas document. Bind its initial response
    // once; subsequent responses must match that explicit selection.
    if (!ticket) {
      if (!state.selectedId()) state.select(document.id);
      ticket = state.request(state.selectedId()!);
    }
    const next = state.accept(document, ticket);
    error = null;
    emit();
    return next;
  }
  // Also receive revisions initiated from chat while no composer request is pending.
  async function poll() {
    try {
      await request('/document');
    } catch (cause) {
      error = cause instanceof Error ? cause.message : String(cause);
      emit();
    }
    if (!closed) timer = setTimeout(poll, 1200);
  }
  void poll();
  return {
    snapshot: state.read,
    connectionError: () => error,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    async refresh(documentId) {
      state.assertSelected(documentId);
      return request('/document');
    },
    async deliver(input) {
      state.assertSelected(input.documentId);
      return request('/annotation', input);
    },
    close() {
      closed = true;
      clearTimeout(timer);
    },
  };
}
