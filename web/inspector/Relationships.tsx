import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MarkerType,
  Position,
  type Node,
  type ReactFlowInstance,
} from '@xyflow/react';
import dagre from '@dagrejs/dagre';
import type { TaskSnapshot } from '../../shared/inspector/schema.js';
import { entityFragments } from '../../shared/inspector/selection.js';
import '@xyflow/react/dist/style.css';

export function Relationships({
  task,
  selected,
  onSelect,
}: {
  task: TaskSnapshot;
  selected?: string;
  onSelect: (id: string) => void;
}) {
  const [includeContext, setIncludeContext] = useState(false);
  const [focus, setFocus] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const [flow, setFlow] = useState<ReactFlowInstance | null>(null);
  useEffect(() => {
    if (!container.current || !flow) return;
    const observer = new ResizeObserver(() => {
      void flow.fitView({ padding: 0.2, maxZoom: 1.2 });
    });
    observer.observe(container.current);
    return () => observer.disconnect();
  }, [flow]);
  const model = useMemo(() => {
    const neighbors = new Set([selected]);
    task.relationships
      .filter((r) => r.source === selected || r.target === selected)
      .forEach((r) => {
        neighbors.add(r.source);
        neighbors.add(r.target);
      });
    const visible = task.entities.filter(
      (e) =>
        (includeContext || e.kind !== 'context' || e.id === selected) &&
        (!focus || !selected || neighbors.has(e.id)),
    );
    const ids = new Set(visible.map((e) => e.id));
    const edges = task.relationships.filter((r) => ids.has(r.source) && ids.has(r.target));
    const g = new dagre.graphlib.Graph()
      .setGraph({ rankdir: 'LR', nodesep: 18, ranksep: 85 })
      .setDefaultEdgeLabel(() => ({}));
    visible.forEach((e) => g.setNode(e.id, { width: 180, height: 64 }));
    edges.forEach((r) => g.setEdge(r.source, r.target));
    dagre.layout(g);
    const nodes: Node[] = visible.map((e) => ({
      id: e.id,
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
      position: { x: g.node(e.id).x - 90, y: g.node(e.id).y - 32 },
      selected: e.id === selected,
      ariaLabel: `Select ${e.id}`,
      data: {
        label: (
          <>
            <span className="source-kind">{e.kind}</span>
            <strong>{e.id}</strong>
            <span>{e.label === e.id ? '' : e.label}</span>
          </>
        ),
      },
      style: { width: 180, minHeight: 64 },
    }));
    return {
      nodes,
      edges: edges.map((e) => ({
        ...e,
        label: e.kind,
        markerEnd: { type: MarkerType.ArrowClosed },
        type: 'smoothstep',
      })),
      hidden: task.entities.length - visible.length,
    };
  }, [task, selected, includeContext, focus]);
  const entity = task.entities.find((e) => e.id === selected);
  const fragments = entity ? entityFragments(task, entity.id) : [];
  return (
    <section aria-label="Task relationships" className="source-view">
      <div className="source-toolbar">
        <label>
          <input
            type="checkbox"
            checked={includeContext}
            onChange={(e) => setIncludeContext(e.target.checked)}
          />{' '}
          Context sections
        </label>
        <label>
          <input type="checkbox" checked={focus} onChange={(e) => setFocus(e.target.checked)} />{' '}
          Focus selection
        </label>
        <span>
          {model.nodes.length} entities · {model.edges.length} links · {model.hidden} hidden
        </span>
      </div>
      <div ref={container} className="source-graph">
        <ReactFlow
          key={`${includeContext}/${focus}/${focus ? selected : ''}`}
          nodes={model.nodes}
          edges={model.edges}
          onInit={setFlow}
          onNodeClick={(_event, node) => onSelect(node.id)}
          nodesDraggable={false}
          nodesConnectable={false}
          edgesReconnectable={false}
          deleteKeyCode={null}
          fitView
          minZoom={0.15}
          maxZoom={1.7}
          colorMode="dark"
        >
          <Background gap={20} color="var(--graph-grid)" />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
      <label className="source-select">
        Inspect entity
        <select
          value={selected ?? ''}
          onChange={(e) => {
            if (e.target.value) onSelect(e.target.value);
          }}
        >
          <option value="">Choose an entity…</option>
          {task.entities.map((e) => (
            <option key={e.id} value={e.id}>
              {e.id} · {e.kind} · {e.label}
            </option>
          ))}
        </select>
      </label>
      <p className="source-note">
        Links preserve the document’s authored meaning. Proof links describe required checks; they
        do not establish completion.
      </p>
      {entity && (
        <section className="source-detail" aria-label="Selected task source">
          <h2>
            {entity.id} <span>{entity.kind}</span>
          </h2>
          <ul className="source-links">
            {task.relationships
              .filter((r) => r.source === selected || r.target === selected)
              .map((r) => (
                <li key={r.id}>
                  {r.source} <strong>→ {r.kind} →</strong> {r.target}
                </li>
              ))}
          </ul>
          {fragments
            .filter((f) => f.owner === selected)
            .map((f) => (
              <div className="source-excerpt" key={f.id}>
                <span>
                  Lines {f.range.start.line}–{f.range.end.line} ·{' '}
                  {f.owner === selected ? 'Selected source' : 'Required context'}
                </span>
                <pre>{f.text}</pre>
              </div>
            ))}
          {fragments.some((f) => f.owner !== selected) && (
            <details>
              <summary>
                Required context · {fragments.filter((f) => f.owner !== selected).length} source
                fragments
              </summary>
              {fragments
                .filter((f) => f.owner !== selected)
                .map((f) => (
                  <div className="source-excerpt" key={f.id}>
                    <span>
                      Lines {f.range.start.line}–{f.range.end.line} · Required context
                    </span>
                    <pre>{f.text}</pre>
                  </div>
                ))}
            </details>
          )}
        </section>
      )}
      <details className="source-provenance">
        <summary>Task provenance · {task.sha256.slice(0, 12)}</summary>
        <dl>
          <dt>Source</dt>
          <dd>{task.documentId}</dd>
          <dt>Imported from</dt>
          <dd>{task.path}</dd>
          <dt>SHA256</dt>
          <dd>{task.sha256}</dd>
          <dt>Profile</dt>
          <dd>{task.profileId}</dd>
          <dt>Interpretation</dt>
          <dd>{task.interpretationHash}</dd>
          <dt>Validation</dt>
          <dd>Passing, complete supplied Trace export · {task.validationHash}</dd>
        </dl>
      </details>
    </section>
  );
}
