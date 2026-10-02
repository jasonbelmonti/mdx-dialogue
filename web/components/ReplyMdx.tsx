import { createElement, Fragment, type ReactNode } from 'react';
import { parseReplyMdx, type MdxNode } from '../../shared/mdx.js';
import type { Accent, Density, Layout } from '../../shared/dialogue.js';
import { LayoutPreview } from './LayoutPreview.js';

function render(node: MdxNode, key: number): ReactNode {
  if (node.type === 'text') return node.value;
  const children = node.children?.map(render);
  if (node.type === 'root') return <Fragment key={key}>{children}</Fragment>;
  if (node.type === 'mdxJsxFlowElement') {
    const props = Object.fromEntries(node.attributes!.map((a) => [a.name!, a.value]));
    return (
      <LayoutPreview
        key={key}
        layout={props.layout as Layout}
        accent={props.accent as Accent}
        density={props.density as Density}
      />
    );
  }
  const tags: Record<string, string> = {
    paragraph: 'p',
    strong: 'strong',
    emphasis: 'em',
    listItem: 'li',
    inlineCode: 'code',
    break: 'br',
  };
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
export function ReplyMdx({ source }: { source: string }) {
  try {
    return <div className="reply-mdx">{render(parseReplyMdx(source), 0)}</div>;
  } catch (error) {
    return <p role="alert">The model response could not be rendered: {String(error)}</p>;
  }
}
