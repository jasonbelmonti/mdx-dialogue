import { useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { GraphTransport } from './transport.js';
import { GraphDocument } from './GraphDocument.js';
import { GraphComposer } from './GraphComposer.js';
import { useGraphDialogue } from './useGraphDialogue.js';
import { Relationships } from '../inspector/Relationships.js';
import { History } from '../inspector/History.js';
import './studio.css';
import '../inspector/inspector.css';
interface Props {
  transport: GraphTransport;
  hostName: string;
  workspaceControl?: ReactNode;
}
type View = 'relationships' | 'history' | 'response';
export function GraphPanel(props: Props) {
  const doc = useSyncExternalStore(props.transport.subscribe, props.transport.snapshot);
  return <GraphSession key={doc?.id ?? 'loading'} {...props} />;
}
function GraphSession({ transport, hostName, workspaceControl }: Props) {
  const state = useGraphDialogue(transport);
  const { doc, selected, sourceSelected } = state;
  const [view, setView] = useState<View>(
    doc?.submissions.at(-1)?.sourceTarget?.view ?? (doc?.inspector ? 'relationships' : 'response'),
  );
  const documentArea = useRef<HTMLDivElement>(null);
  if (!doc)
    return (
      <main className="graph-loading" role="status">
        {state.startupError ?? 'Connecting your graph document…'}
      </main>
    );
  const { content, inspector } = doc;
  const accepted = [...doc.submissions].reverse().find((s) => s.status === 'complete');
  const selectSource = (itemId: string) => {
    if (!inspector || view === 'response') return;
    state.setSelected(null);
    state.setSourceSelected({ snapshotId: inspector.id, view, itemId });
  };
  const changeView = (next: View) => {
    setView(next);
    state.setSelected(null);
    state.setSourceSelected(null);
    documentArea.current?.scrollTo(0, 0);
  };
  return (
    <main className="graph-studio">
      <header className="studio-heading">
        <h1>
          {inspector
            ? `${inspector.history.source} · Task workspace`
            : (content?.title ?? 'New visual document')}
        </h1>
        {workspaceControl}
        <span className="revision">Revision {doc.revision}</span>
      </header>
      {inspector && (
        <>
          <nav className="workspace-tabs" aria-label="Workspace views">
            {(['relationships', 'history', 'response'] as const).map((v) => (
              <button type="button" key={v} aria-pressed={view === v} onClick={() => changeView(v)}>
                {v === 'relationships'
                  ? 'Relationships'
                  : v === 'history'
                    ? 'History'
                    : `Response${content ? ` · ${doc.revision}` : ''}`}
              </button>
            ))}
          </nav>
          <p className="snapshot-note">
            Read-only snapshots · imported {new Date(inspector.importedAt).toLocaleString()} ·
            current files may differ
          </p>
        </>
      )}
      <div className={content || inspector ? 'studio-layout' : 'studio-layout empty'}>
        <div
          ref={documentArea}
          className="document-area"
          tabIndex={0}
          role="region"
          aria-label={inspector ? view : 'Document'}
        >
          {inspector && view === 'relationships' ? (
            <Relationships
              task={inspector.task}
              selected={sourceSelected?.view === view ? sourceSelected.itemId : undefined}
              onSelect={selectSource}
            />
          ) : inspector && view === 'history' ? (
            <History
              history={inspector.history}
              selected={sourceSelected?.view === view ? sourceSelected.itemId : undefined}
              onSelect={selectSource}
            />
          ) : content ? (
            <>
              {inspector && accepted?.sourceTarget && (
                <p className="source-note">
                  Response to {accepted.sourceTarget.view} · {accepted.sourceTarget.itemId}. Source
                  snapshots are unchanged.
                </p>
              )}
              <GraphDocument
                content={content}
                selected={selected}
                onSelect={(target) => {
                  state.setSourceSelected(null);
                  state.setSelected(target);
                }}
              />
            </>
          ) : (
            <section className="empty-document">
              <h2>{inspector ? 'Ask about your project' : 'What are you working on?'}</h2>
              <p>
                {inspector
                  ? 'Select a task entity or history event, then ask a question below. The answer appears here.'
                  : 'Describe a system, process, or question below to build a visual document.'}
              </p>
            </section>
          )}
        </div>
        <GraphComposer
          state={state}
          hostName={hostName}
          showGraphTargets={view === 'response'}
          requireSourceTarget={!!inspector && view !== 'response'}
        />
      </div>
    </main>
  );
}
