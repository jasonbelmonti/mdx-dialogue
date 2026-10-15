import { useSyncExternalStore, type ReactNode } from 'react';
import type { GraphTransport } from './transport.js';
import { GraphDocument } from './GraphDocument.js';
import { useGraphDialogue } from './useGraphDialogue.js';
import './studio.css';
interface Props {
  transport: GraphTransport;
  hostName: string;
  workspaceControl?: ReactNode;
}
export function GraphPanel(props: Props) {
  const doc = useSyncExternalStore(props.transport.subscribe, props.transport.snapshot);
  return <GraphSession key={doc?.id ?? 'loading'} {...props} />;
}
function GraphSession({ transport, hostName, workspaceControl }: Props) {
  const state = useGraphDialogue(transport);
  const { doc, selected, annotation, busy, waiting, error } = state;
  if (!doc)
    return (
      <main className="graph-loading" role="status">
        {state.startupError ?? 'Connecting your graph document…'}
      </main>
    );
  const content = doc.content;
  const selectedNode = content?.graphs
    .find((g) => g.id === selected?.graphId)
    ?.nodes.find((n) => n.id === selected?.nodeId);
  return (
    <main className="graph-studio">
      <header className="studio-heading">
        <h1>{content?.title ?? 'New visual document'}</h1>
        {workspaceControl}
        <span className="revision">Revision {doc.revision}</span>
      </header>
      <div className={content ? 'studio-layout' : 'studio-layout empty'}>
        <div className="document-area" tabIndex={0} role="region" aria-label="Document">
          {content ? (
            <GraphDocument
              content={content}
              selected={selectedNode ? selected : null}
              onSelect={state.setSelected}
            />
          ) : (
            <section className="empty-document">
              <h2>What are you working on?</h2>
              <p>Describe a system, process, or question below to build a visual document.</p>
            </section>
          )}
        </div>
        <aside className="conversation-card" aria-label="Discuss this document">
          {content && (
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
          <label className="note-label" htmlFor="graph-note">
            {content
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
              content
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
                    { documentId: doc.id, revision: doc.revision, latest: doc.submissions.at(-1) },
                    null,
                    2,
                  )}
                </pre>
              </details>
            )}
            <button
              className="graph-submit"
              type="button"
              disabled={busy || waiting || !annotation.trim()}
              onClick={() => void state.send(!!error && state.canRetry)}
            >
              {busy
                ? 'Sending…'
                : waiting
                  ? 'The model is composing…'
                  : error && state.canRetry
                    ? 'Retry saved request'
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
        </aside>
      </div>
    </main>
  );
}
