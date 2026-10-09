import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkMdx from 'remark-mdx';

type Attribute = { type: string; name?: string; value?: unknown };
export type MdxNode = {
  type: string;
  value?: string;
  depth?: number;
  ordered?: boolean;
  name?: string;
  attributes?: Attribute[];
  children?: MdxNode[];
};
const processor = unified().use(remarkParse).use(remarkMdx);
const allowed = new Set([
  'root',
  'heading',
  'paragraph',
  'text',
  'strong',
  'emphasis',
  'list',
  'listItem',
  'inlineCode',
  'break',
  'mdxJsxFlowElement',
]);
export function literalProps(node: MdxNode): Record<string, string> {
  const props: Record<string, string> = {};
  for (const attr of node.attributes ?? []) {
    if (
      attr.type !== 'mdxJsxAttribute' ||
      !attr.name ||
      typeof attr.value !== 'string' ||
      attr.name in props
    )
      throw new Error('MDX attributes must be unique literal strings.');
    props[attr.name] = attr.value;
  }
  return props;
}
export function parseMdx(
  source: string,
  component: (node: MdxNode) => void,
  maxLength = 5000,
): MdxNode {
  if (source.length > maxLength) throw new Error('MDX response is too long.');
  const tree = processor.parse(source) as MdxNode;
  function inspect(node: MdxNode, depth: number) {
    if (depth > 12 || !allowed.has(node.type))
      throw new Error(`Unsupported MDX syntax: ${node.type}.`);
    if (node.type === 'mdxJsxFlowElement') {
      if (node.children?.length) throw new Error('Components must be empty.');
      component(node);
    }
    node.children?.forEach((child) => inspect(child, depth + 1));
  }
  inspect(tree, 0);
  return tree;
}
