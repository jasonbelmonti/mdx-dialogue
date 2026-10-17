import type { HistorySnapshot } from '../../shared/inspector/schema.js';

export function History({
  history,
  selected,
  onSelect,
}: {
  history: HistorySnapshot;
  selected?: string;
  onSelect: (id: string) => void;
}) {
  const node = history.nodes.find((n) => n.id === selected);
  const nodes = [...history.nodes].sort(
    (a, b) => Date.parse(b.time) - Date.parse(a.time) || a.id.localeCompare(b.id),
  );
  return (
    <section className="source-view" aria-label="Capsule history">
      <p className="source-note">
        Captured {new Date(history.capturedAt).toLocaleString()} · {history.source}. Uncheckpointed
        edits and conversation are excluded. Historical labels are recorded claims.
      </p>
      {history.warnings.map((warning, i) => (
        <p className="graph-error" key={i}>
          {warning}
        </p>
      ))}
      <ol className="history-timeline">
        {nodes.map((n) => (
          <li key={n.id} className={n.track}>
            <button
              type="button"
              className={selected === n.id ? 'active' : ''}
              aria-pressed={selected === n.id}
              onClick={() => onSelect(n.id)}
            >
              <span className="history-type">
                {n.track} · {n.kind}
              </span>
              <strong>{n.title}</strong>
              <span>
                {n.oid.slice(0, 10)} · {new Date(n.time).toLocaleString()}
              </span>
            </button>
          </li>
        ))}
      </ol>
      {node && (
        <section className="source-detail" aria-label="Selected history source">
          <h2>{node.title}</h2>
          <dl>
            <dt>Identity</dt>
            <dd>{node.id}</dd>
            <dt>Track / lane</dt>
            <dd>
              {node.track} / {node.lane}
            </dd>
            <dt>Bound worktree</dt>
            <dd>{node.sourceWorktree ?? 'Not recorded on this event'}</dd>
            <dt>Actor</dt>
            <dd>
              {node.attribution?.actor
                ? `${node.attribution.actor.label} · ${node.attribution.actor.actorId} (${node.attribution.actor.role})`
                : 'Unknown — no actor recorded'}
            </dd>
            <dt>Session</dt>
            <dd>{node.attribution?.sessionId ?? 'Unknown — no session recorded'}</dd>
            <dt>Receipt</dt>
            <dd>{node.attribution?.receiptId ?? 'Not recorded'}</dd>
            <dt>Input</dt>
            <dd>{node.attribution?.inputCapsuleCommit ?? 'Not recorded on this event'}</dd>
            <dt>Task bytes</dt>
            <dd>
              {node.taskPaths.length
                ? `Exact SHA256 match retained at: ${node.taskPaths.join(', ')}`
                : 'No exact task match in this captured tree'}
            </dd>
          </dl>
          {node.acknowledgmentIds && (
            <p>
              Prepared input consumed by {node.acknowledgmentSessions ?? 'unknown'} sessions.
              Consumption is distinct from creation.
            </p>
          )}
          {node.checkpoint && (
            <details>
              <summary>Checkpoint identities</summary>
              <pre>{JSON.stringify(node.checkpoint, null, 2)}</pre>
            </details>
          )}
          <h3>Lineage</h3>
          <ul className="source-links">
            {node.parents.map((p) => (
              <li key={p}>
                Parent:{' '}
                {history.nodes.some((n) => n.id === p) ? (
                  <button className="text-button" type="button" onClick={() => onSelect(p)}>
                    {p}
                  </button>
                ) : (
                  `${p} (outside captured history)`
                )}
              </li>
            ))}
            {history.links
              .filter((l) => l.from === node.id || l.to === node.id)
              .map((l, i) => (
                <li key={i}>
                  {l.from} <strong>→ {l.kind} →</strong> {l.to}
                </li>
              ))}
          </ul>
          <details>
            <summary>{node.files.length} captured file identities</summary>
            <ul className="source-files">
              {node.files.map((f) => (
                <li key={f.path}>
                  {f.path} <code>{f.oid.slice(0, 12)}</code>
                </li>
              ))}
            </ul>
          </details>
          <p className="source-note">
            File inventory only; contents are not sent to the model. Actor and session attribution
            is caller-declared.
          </p>
        </section>
      )}
      <details className="source-provenance">
        <summary>History provenance · {history.exportSha256.slice(0, 12)}</summary>
        <dl>
          <dt>Producer</dt>
          <dd>
            {history.producer.name} {history.producer.version}
          </dd>
          <dt>Producer commit</dt>
          <dd>{history.producer.sourceCommit ?? 'Unknown'}</dd>
          <dt>Export SHA256</dt>
          <dd>{history.exportSha256}</dd>
        </dl>
      </details>
    </section>
  );
}
