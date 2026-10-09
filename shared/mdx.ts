import { accents, densities, layouts } from './dialogue.js';
import { literalProps, parseMdx } from './mdx-syntax.js';
export type { MdxNode } from './mdx-syntax.js';
export function parseReplyMdx(source: string) {
  let previews = 0;
  const tree = parseMdx(source, (node) => {
    if (node.name !== 'LayoutPreview')
      throw new Error('Only an empty LayoutPreview component is allowed.');
    const values = literalProps(node);
    if (
      Object.keys(values).length !== 3 ||
      !layouts.includes(values.layout as (typeof layouts)[number]) ||
      !accents.includes(values.accent as (typeof accents)[number]) ||
      !densities.includes(values.density as (typeof densities)[number])
    )
      throw new Error('LayoutPreview requires valid layout, accent and density.');
    previews++;
  });
  if (previews !== 1) throw new Error('MDX must contain exactly one LayoutPreview.');
  return tree;
}
