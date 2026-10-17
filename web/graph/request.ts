import type { GraphDialogue, GraphInput } from '../../shared/graph/schema.js';

export type GraphDraft = Pick<GraphInput, 'annotation' | 'target' | 'sourceTarget'>;

/** Editing a question or selection must not silently resend the previous interaction. */
export function matchesRequest(doc: GraphDialogue, draft: GraphDraft, request: GraphInput) {
  return (
    doc.id === request.documentId &&
    doc.revision === request.revision &&
    draft.annotation === request.annotation &&
    draft.target?.graphId === request.target?.graphId &&
    draft.target?.nodeId === request.target?.nodeId &&
    draft.sourceTarget?.snapshotId === request.sourceTarget?.snapshotId &&
    draft.sourceTarget?.view === request.sourceTarget?.view &&
    draft.sourceTarget?.itemId === request.sourceTarget?.itemId
  );
}

/** Resolve replacement requests against saved state; uncertain deliveries keep their retry. */
export async function prepareRequest(
  document: GraphDialogue,
  draft: GraphDraft,
  previous: GraphInput | null,
  retry: boolean,
  refresh: (documentId: string) => Promise<GraphDialogue>,
): Promise<GraphInput> {
  if (retry && previous) return previous;
  const current = previous ? await refresh(document.id) : document;
  if (current.id !== document.id) throw new Error('The selected document changed.');
  if (current.submissions.some((s) => ['awaiting-model', 'running'].includes(s.status)))
    throw new Error(
      'A response is already pending. Retry the saved request or wait for its reply.',
    );
  const target =
    draft.target &&
    current.content?.graphs.some(
      (g) => g.id === draft.target!.graphId && g.nodes.some((n) => n.id === draft.target!.nodeId),
    )
      ? draft.target
      : null;
  return {
    documentId: current.id,
    revision: current.revision,
    submissionId: crypto.randomUUID(),
    annotation: draft.annotation,
    target,
    ...(draft.sourceTarget ? { sourceTarget: draft.sourceTarget } : {}),
  };
}
