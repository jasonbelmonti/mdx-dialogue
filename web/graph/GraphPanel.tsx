import { GraphDocument } from './GraphDocument.js';
import { useGraphDialogue } from './useGraphDialogue.js';
import './studio.css';
export function GraphPanel() {
  const state = useGraphDialogue();
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
        <div>
          <span className="eyebrow">MDX + REACT FLOW</span>
          <h1>{content?.title ?? 'Give an idea some shape.'}</h1>
          <p>
            {content
              ? 'Explore the relationships. Select a node and continue the conversation.'
              : 'Describe a system, process, or concept. The model will compose an explanation and an interactive graph.'}
          </p>
        </div>
        <span className="revision">Revision {doc.revision}</span>
      </header>
      <div className={content ? 'studio-layout' : 'studio-layout empty'}>
        <div className="document-area">
          {content ? (
            <GraphDocument
              content={content}
              selected={selectedNode ? selected : null}
              onSelect={state.setSelected}
            />
          ) : (
            <section className="empty-document">
              <span className="empty-symbol">↗</span>
              <h2>A document built around your question.</h2>
              <p>
                Try an architecture, a learning map, a decision process, or an explanation of how
                something works.
              </p>
              <p>The graph and prose are generated from your prompt.</p>
            </section>
          )}
        </div>
        <aside className="conversation-card" aria-label="Discuss this document">
          <span className="eyebrow">
            {content ? 'CONTINUE THE CONVERSATION' : 'START WITH A QUESTION'}
          </span>
          {content && (
            <>
              <label htmlFor="graph-target">Discuss a node</label>
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
                      {g.title} · {n.label}
                    </option>
                  )),
                )}
              </select>
              {selectedNode && (
                <div className="selected-detail">
                  <strong>{selectedNode.label}</strong>
                  <p>{selectedNode.description}</p>
                </div>
              )}
            </>
          )}
          <label htmlFor="graph-note">
            {content
              ? 'What would you like to explore or change?'
              : 'What would you like to understand?'}
          </label>
          <textarea
            id="graph-note"
            value={annotation}
            maxLength={2000}
            rows={7}
            disabled={busy || waiting}
            onChange={(e) => state.setAnnotation(e.target.value)}
            placeholder="Explain how a request moves through a background job system, including retries and failure handling."
          />
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
          {error && (
            <p role="alert" className="graph-error">
              {error}
            </p>
          )}
          {waiting && (
            <p role="status" className="graph-status">
              Your exact prompt and selected node are with Codex. You can keep exploring the graph.
            </p>
          )}
          <p className="privacy-note">
            Saved locally. Each submission requests a real model response.
          </p>
        </aside>
      </div>
      {content && (
        <details className="graph-receipt">
          <summary>View the round trip</summary>
          <pre>
            {JSON.stringify(
              { documentId: doc.id, revision: doc.revision, latest: doc.submissions.at(-1) },
              null,
              2,
            )}
          </pre>
        </details>
      )}
    </main>
  );
}
