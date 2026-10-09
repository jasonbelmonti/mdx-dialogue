import { memo, useEffect, useMemo, useRef } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  Handle,
  Position,
  MarkerType,
  useNodesState,
  type Node,
  type NodeProps,
  type NodeChange,
} from '@xyflow/react';
import dagre from '@dagrejs/dagre';
import type { Graph, GraphTarget } from '../../shared/graph/schema.js';
import '@xyflow/react/dist/style.css';
import './graph.css';
type IdeaNode = Node<{ label: string; description: string; kind: string }, 'idea'>;
const Idea = memo(function Idea({ data, selected }: NodeProps<IdeaNode>) {
  return (
    <div className={`idea-node ${data.kind} ${selected ? 'is-selected' : ''}`}>
      <Handle type="target" position={Position.Left} />
      <span className="node-kind">{data.kind}</span>
      <strong>{data.label}</strong>
      <p>{data.description}</p>
      <Handle type="source" position={Position.Right} />
    </div>
  );
});
const nodeTypes = { idea: Idea };
function layout(graph: Graph): IdeaNode[] {
  const g = new dagre.graphlib.Graph()
    .setGraph({ rankdir: 'LR', nodesep: 50, ranksep: 90, marginx: 30, marginy: 30 })
    .setDefaultEdgeLabel(() => ({}));
  graph.nodes.forEach((n) => g.setNode(n.id, { width: 238, height: 130 }));
  graph.edges.forEach((e) => g.setEdge(e.source, e.target));
  dagre.layout(g);
  return graph.nodes.map((n) => ({
    id: n.id,
    type: 'idea',
    data: n,
    position: { x: g.node(n.id).x - 119, y: g.node(n.id).y - 65 },
    ariaLabel: `Select ${n.label}`,
  }));
}
export function FlowGraph({
  graph,
  selected,
  onSelect,
}: {
  graph: Graph;
  selected?: GraphTarget | null;
  onSelect?: (target: GraphTarget) => void;
}) {
  const initial = useMemo(() => layout(graph), [graph]);
  const arranged = useRef(new Map<string, { x: number; y: number }>());
  const [nodes, setNodes, onNodesChange] = useNodesState<IdeaNode>(initial);
  function changeNodes(changes: NodeChange<IdeaNode>[]) {
    for (const change of changes) {
      if (change.type === 'position' && change.position)
        arranged.current.set(change.id, change.position);
      if (change.type === 'select' && change.selected)
        onSelect?.({ graphId: graph.id, nodeId: change.id });
    }
    onNodesChange(changes);
  }
  useEffect(() => {
    setNodes(
      initial.map((next) => ({
        ...next,
        position: arranged.current.get(next.id) ?? next.position,
        selected: selected?.graphId === graph.id && selected.nodeId === next.id,
      })),
    );
  }, [initial, selected?.graphId, selected?.nodeId, graph.id, setNodes]);
  const edges = useMemo(
    () =>
      graph.edges.map((e) => ({
        ...e,
        type: 'smoothstep',
        markerEnd: { type: MarkerType.ArrowClosed },
        labelStyle: { fontSize: 12 },
        style: { stroke: '#8190a8', strokeWidth: 1.6 },
      })),
    [graph.edges],
  );
  return (
    <figure className="flow-figure" aria-label={graph.title}>
      <figcaption>
        <strong>{graph.title}</strong>
        <span>
          {graph.nodes.length} nodes · {graph.edges.length} relationships
        </span>
      </figcaption>
      <div className="flow-canvas">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={changeNodes}
          onNodeClick={(_event, node) => onSelect?.({ graphId: graph.id, nodeId: node.id })}
          nodesConnectable={false}
          edgesReconnectable={false}
          deleteKeyCode={null}
          fitView
          minZoom={0.2}
          maxZoom={1.8}
        >
          <Background gap={20} color="#d8dfec" />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
      <p className="graph-hint">Select a node to discuss it. Drag to arrange; scroll to zoom.</p>
    </figure>
  );
}
