import React, { useEffect, useState } from 'react';
import { GraphDocument } from '../../../web/graph/GraphDocument';
import {
  graphDialogueSchema,
  type GraphDialogue,
  type GraphTarget,
} from '../../../shared/graph/schema';
import { validateGraphReply } from '../../../shared/graph/validation';
export default function LiveGraphDocument() {
  const [doc, setDoc] = useState<GraphDialogue | null>(null);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<GraphTarget | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    const id = new URL(location.href).searchParams.get('document');
    if (!id) {
      setError('Open a document from Graph Studio using its Docusaurus link.');
      return;
    }
    void fetch(`/api/graphs/${encodeURIComponent(id)}`, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok)
          throw new Error(
            'Could not load this document. Run the local server and open this page through its /docs address.',
          );
        const next = graphDialogueSchema.parse(await res.json());
        if (next.content) validateGraphReply(next.content);
        setDoc(next);
      })
      .catch((e) => {
        if (e.name !== 'AbortError') setError(e.message);
      });
    return () => controller.abort();
  }, []);
  if (error) return <p role="alert">{error}</p>;
  if (!doc) return <p role="status">Reading the saved document…</p>;
  if (!doc.content)
    return (
      <p>
        This document has no accepted model response yet.{' '}
        <a href={`/graphs?document=${doc.id}`}>Continue in the studio.</a>
      </p>
    );
  const node = doc.content.graphs
    .find((g) => g.id === selected?.graphId)
    ?.nodes.find((n) => n.id === selected?.nodeId);
  return (
    <section>
      <div className="document-origin">
        <strong>{doc.content.title}</strong>
        <span>
          Document {doc.id} · Revision {doc.revision}
        </span>
        <a href={`/graphs?document=${doc.id}`}>Discuss or revise in Graph Studio ↗</a>
      </div>
      <GraphDocument content={doc.content} selected={selected} onSelect={setSelected} />
      {node && (
        <aside className="node-detail" aria-live="polite">
          <strong>{node.label}</strong>
          <p>{node.description}</p>
        </aside>
      )}
      <details>
        <summary>View the document source</summary>
        <pre>{doc.content.mdx}</pre>
      </details>
    </section>
  );
}
