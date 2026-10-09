import { createElement, Fragment, memo, useMemo, type ReactNode } from 'react';
import { literalProps, type MdxNode } from '../../shared/mdx-syntax.js';
import { parseGraphMdx } from '../../shared/graph/validation.js';
import type { GraphReply, GraphTarget } from '../../shared/graph/schema.js';
import { FlowGraph } from './FlowGraph.js';
const tags: Record<string, string> = {
  paragraph: 'p',
  strong: 'strong',
  emphasis: 'em',
  listItem: 'li',
  inlineCode: 'code',
  break: 'br',
};
export const GraphDocument = memo(function GraphDocument({
  content,
  selected,
  onSelect,
}: {
  content: GraphReply;
  selected?: GraphTarget | null;
  onSelect?: (target: GraphTarget) => void;
}) {
  const tree = useMemo(() => parseGraphMdx(content), [content]);
  function render(node: MdxNode, key: number): ReactNode {
    if (node.type === 'text') return node.value;
    if (node.type === 'mdxJsxFlowElement') {
      const props = literalProps(node);
      const graph = content.graphs.find((g) => g.id === props.data)!;
      return <FlowGraph key={props.id} graph={graph} selected={selected} onSelect={onSelect} />;
    }
    const children = node.children?.map(render);
    if (node.type === 'root') return <Fragment key={key}>{children}</Fragment>;
    const tag =
      node.type === 'heading'
        ? `h${Math.max(2, node.depth ?? 2)}`
        : node.type === 'list'
          ? node.ordered
            ? 'ol'
            : 'ul'
          : tags[node.type];
    return createElement(tag, { key }, node.value ?? children);
  }
  return <article className="graph-prose">{render(tree, 0)}</article>;
});
