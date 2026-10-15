import type { GraphDialogue, GraphInput } from '../../shared/graph/schema.js';

/** Host-owned delivery; rendering and the annotation lifecycle remain shared. */
export interface GraphTransport {
  snapshot(): GraphDialogue | null;
  connectionError(): string | null;
  subscribe(listener: () => void): () => void;
  refresh(documentId: string): Promise<GraphDialogue>;
  deliver(input: GraphInput): Promise<unknown>;
}
