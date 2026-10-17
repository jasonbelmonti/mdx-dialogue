import type { useGraphDialogue } from './useGraphDialogue.js';

export function GraphComposer({
  state,
  hostName,
  showGraphTargets,
  requireSourceTarget,
}: {
  state: ReturnType<typeof useGraphDialogue>;
  hostName: string;
  showGraphTargets: boolean;
  requireSourceTarget: boolean;
}) {
  const { doc, selected, annotation, busy, waiting, error, retryCurrent } = state;
  if (!doc) return null;
  const content = doc.content;
  const latest = doc.submissions.at(-1);
  const selectedNode = content?.graphs
    .find((g) => g.id === selected?.graphId)
    ?.nodes.find((n) => n.id === selected?.nodeId);
  return (
    <aside className="conversation-card" aria-label="Discuss this document">
      {content && showGraphTargets && (
        <>
          <div className="target-control">
            <label htmlFor="graph-target">Discuss</label>
            <select
              id="graph-target"
              value={selectedNode ? `${selected!.graphId}/${selected!.nodeId}` : ''}
              onChange={(e) => {
                const [graphId, nodeId] = e.target.value.split('/');
                state.setSelected(graphId ? { graphId, nodeId } : null);
              }}
              disabled={busy || waiting}
            >
              <option value="">Whole document</option>
              {content.graphs.flatMap((g) =>
                g.nodes.map((n) => (
                  <option key={`${g.id}/${n.id}`} value={`${g.id}/${n.id}`}>
                    {n.label} · {g.title}
                  </option>
                )),
              )}
            </select>
          </div>
          {selectedNode && (
            <div className="selected-detail">
              <strong>{selectedNode.label}</strong>
              <p>{selectedNode.description}</p>
            </div>
          )}
        </>
      )}
      {doc.inspector && (
        <div className="source-selection">
          <span>Discuss</span>
          <strong>
            {state.sourceSelected
              ? `${state.sourceSelected.view} · ${state.sourceSelected.itemId}`
              : requireSourceTarget
                ? 'Select a source item above'
                : 'Response'}
          </strong>
        </div>
      )}
      <label className="note-label" htmlFor="graph-note">
        {doc.inspector
          ? 'What would you like to understand about this selection?'
          : content
            ? 'What would you like to explore or change?'
            : 'What would you like to understand?'}
      </label>
      <textarea
        id="graph-note"
        value={annotation}
        maxLength={2000}
        rows={3}
        disabled={busy || waiting}
        onChange={(e) => state.setAnnotation(e.target.value)}
        placeholder={
          doc.inspector
            ? 'Ask about this selection…'
            : content
              ? 'Ask a question or describe a change…'
              : 'Describe what you want to explore…'
        }
      />
      <div className="composer-actions">
        {content && (
          <details className="graph-receipt">
            <summary>Activity</summary>
            <pre>
              {JSON.stringify(
                {
                  documentId: doc.id,
                  revision: doc.revision,
                  latest: latest
                    ? {
                        submissionId: latest.submissionId,
                        status: latest.status,
                        target: latest.target,
                        sourceTarget: latest.sourceTarget,
                      }
                    : null,
                },
                null,
                2,
              )}
            </pre>
          </details>
        )}
        {error && state.canRetry && !retryCurrent && (
          <button
            className="graph-retry"
            type="button"
            disabled={busy || waiting}
            onClick={() => void state.send(true)}
          >
            Retry saved request
          </button>
        )}
        <button
          className="graph-submit"
          type="button"
          disabled={
            busy ||
            waiting ||
            (!retryCurrent &&
              (!annotation.trim() || (requireSourceTarget && !state.sourceSelected)))
          }
          onClick={() => void state.send(retryCurrent)}
        >
          {busy
            ? 'Sending…'
            : waiting
              ? 'The model is composing…'
              : retryCurrent
                ? 'Retry saved request'
                : doc.inspector
                  ? 'Ask about selection'
                  : content
                    ? 'Discuss & revise'
                    : 'Create document'}
          <span aria-hidden="true">↗</span>
        </button>
      </div>
      {error && (
        <p role="alert" className="graph-error">
          {error}
        </p>
      )}
      {state.startupError && (
        <p role="alert" className="graph-error">
          {state.startupError}
        </p>
      )}
      {waiting && (
        <p role="status" className="graph-status">
          Sent to {hostName}. You can keep exploring while it responds.
        </p>
      )}
      {!busy && !waiting && !error && latest?.status === 'complete' && (
        <p role="status" className="graph-status graph-completed" title={latest.reply?.summary}>
          Updated to Revision {doc.revision}. {latest.reply?.summary}
        </p>
      )}
    </aside>
  );
}
