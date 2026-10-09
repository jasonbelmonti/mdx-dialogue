import { literalProps, parseMdx } from '../mdx-syntax.js';
import { graphReplySchema, type GraphReply } from './schema.js';
function unique(ids: string[], label: string) {
  if (new Set(ids).size !== ids.length) throw new Error(`Duplicate ${label} IDs.`);
}
export function parseGraphMdx(reply: GraphReply) {
  const components = new Set<string>();
  const used = new Set<string>();
  const tree = parseMdx(
    reply.mdx,
    (node) => {
      if (node.name !== 'FlowGraph')
        throw new Error('Only FlowGraph is supported in graph documents.');
      const props = literalProps(node);
      if (
        Object.keys(props).sort().join(',') !== 'data,id,interaction' ||
        !/^[a-z][a-z0-9-]{0,63}$/.test(props.id) ||
        props.interaction !== 'discuss' ||
        !reply.graphs.some((g) => g.id === props.data)
      )
        throw new Error(
          'FlowGraph requires id, a valid graph data reference, and interaction="discuss".',
        );
      if (components.has(props.id) || used.has(props.data))
        throw new Error('Repeated graph component or data reference.');
      components.add(props.id);
      used.add(props.data);
    },
    12000,
  );
  if (used.size !== reply.graphs.length)
    throw new Error('Every graph must appear exactly once in the MDX.');
  return tree;
}
export function validateGraphReply(input: unknown): GraphReply {
  const reply = graphReplySchema.parse(input);
  unique(
    reply.graphs.map((g) => g.id),
    'graph',
  );
  for (const graph of reply.graphs) {
    unique(
      graph.nodes.map((n) => n.id),
      'node',
    );
    unique(
      graph.edges.map((e) => e.id),
      'edge',
    );
    const nodes = new Set(graph.nodes.map((n) => n.id));
    for (const edge of graph.edges)
      if (!nodes.has(edge.source) || !nodes.has(edge.target))
        throw new Error('Edge references a missing node.');
  }
  parseGraphMdx(reply);
  return reply;
}
