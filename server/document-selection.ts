import { randomUUID } from 'node:crypto';
import { documentSelectionKey } from '../shared/document-selection.js';

// HTTP creates an MCP server per request; selection order belongs to the shared store.
const selections = new WeakMap<object, { epoch: string; sequence: number }>();
export function documentSelectionMeta(owner: object, documentId: string) {
  let selection = selections.get(owner);
  if (!selection) {
    selection = { epoch: randomUUID(), sequence: 0 };
    selections.set(owner, selection);
  }
  selection.sequence++;
  return { [documentSelectionKey]: { documentId, ...selection } };
}
