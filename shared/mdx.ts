import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkMdx from 'remark-mdx';
import { accents, densities, layouts } from './dialogue.js';

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

export function parseReplyMdx(source: string): MdxNode {
  if (source.length > 5000) throw new Error('MDX response is too long.');
  const tree = processor.parse(source) as MdxNode;
  let previews = 0;
  function inspect(node: MdxNode, depth: number) {
    if (depth > 12 || !allowed.has(node.type))
      throw new Error(`Unsupported MDX syntax: ${node.type}.`);
    if (node.type === 'mdxJsxFlowElement') {
      if (node.name !== 'LayoutPreview' || node.children?.length)
        throw new Error('Only an empty LayoutPreview component is allowed.');
      const values: Record<string, string> = {};
      for (const attr of node.attributes ?? []) {
        if (
          attr.type !== 'mdxJsxAttribute' ||
          !attr.name ||
          typeof attr.value !== 'string' ||
          attr.name in values
        )
          throw new Error('MDX attributes must be unique literal strings.');
        values[attr.name] = attr.value;
      }
      if (
        Object.keys(values).length !== 3 ||
        !layouts.includes(values.layout as (typeof layouts)[number]) ||
        !accents.includes(values.accent as (typeof accents)[number]) ||
        !densities.includes(values.density as (typeof densities)[number])
      )
        throw new Error('LayoutPreview requires valid layout, accent and density.');
      previews++;
    }
    node.children?.forEach((child) => inspect(child, depth + 1));
  }
  inspect(tree, 0);
  if (previews !== 1) throw new Error('MDX must contain exactly one LayoutPreview.');
  return tree;
}
