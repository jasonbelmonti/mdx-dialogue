import { memo, useState } from 'react';
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import type { Graph } from '../../shared/graph/schema.js';
import { NodeDetails } from './NodeDetails.js';

export type IdeaNode = Node<Graph['nodes'][number], 'idea'>;

export const Idea = memo(function Idea({ data, selected }: NodeProps<IdeaNode>) {
  const [reading, setReading] = useState(false);
  return (
    <div className={`idea-node ${data.kind} ${selected ? 'is-selected' : ''}`}>
      <Handle type="target" position={Position.Left} />
      <span className="node-kind">{data.kind}</span>
      <strong className="node-label">{data.label}</strong>
      <p className="node-description">{data.description}</p>
      <button
        type="button"
        className="node-read nodrag nopan"
        aria-label={`Read details: ${data.label}`}
        aria-haspopup="dialog"
        onKeyDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          setReading(true);
        }}
      >
        Read details
      </button>
      <Handle type="source" position={Position.Right} />
      {reading && <NodeDetails node={data} onClose={() => setReading(false)} />}
    </div>
  );
});
