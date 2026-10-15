import { randomUUID } from 'node:crypto';
import { documentSelectionKey, documentStoreEpochKey } from '../shared/document-selection.js';

// HTTP creates an MCP server per request; selection order belongs to the shared store.
const selections = new WeakMap<object, { epoch: string; sequence: number }>();
function selectionFor(owner: object) {
  let selection = selections.get(owner);
  if (!selection) {
    selection = { epoch: randomUUID(), sequence: 0 };
    selections.set(owner, selection);
  }
  return selection;
}
export function documentStoreMeta(owner: object) {
  return { [documentStoreEpochKey]: selectionFor(owner).epoch };
}
export function documentSelectionMeta(owner: object, documentId: string) {
  const selection = selectionFor(owner);
  selection.sequence++;
  return { [documentSelectionKey]: { documentId, ...selection } };
}
