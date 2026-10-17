import { useEffect, useId, useRef } from 'react';
import type { Graph } from '../../shared/graph/schema.js';
import './node-details.css';

export function NodeDetails({
  node,
  onClose,
}: {
  node: Pick<Graph['nodes'][number], 'label' | 'description' | 'kind'>;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const element = dialog.current!;
    element.showModal();
    return () => element.close();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="node-details nodrag nopan nowheel"
      aria-labelledby={titleId}
      onClose={(event) => {
        // Ignore a queued cleanup event if Strict Mode has already reopened the dialog.
        if (!event.currentTarget.open) onClose();
      }}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <header className="node-details-toolbar">
        <span>{node.kind} · Full node text</span>
        <button type="button" autoFocus onClick={() => dialog.current?.close()}>
          Close
        </button>
      </header>
      <div className="node-details-content" tabIndex={0}>
        <h2 id={titleId}>{node.label}</h2>
        <p>{node.description || 'No description provided.'}</p>
      </div>
    </dialog>
  );
}
