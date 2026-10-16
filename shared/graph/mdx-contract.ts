/** One authoring contract for schema discovery, prompts and revision actions. */
export const graphMdxContract = `MDX supports only Markdown headings, paragraphs, lists, bold, italic, inline code and line breaks, plus self-closing FlowGraph components with exactly three literal string attributes:
<FlowGraph id="overview" data="system" interaction="discuss" />
The data attribute must equal a graph's id. Include every graph exactly once and use unique component ids starting with a lowercase letter, followed by lowercase letters, digits or hyphens (maximum 64 characters). No blockquotes, links, images, tables, code fences, imports, expressions, arbitrary HTML or other components.`;
