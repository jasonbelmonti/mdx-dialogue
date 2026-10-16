import type { GraphDialogue, GraphInput } from '../../shared/graph/schema.js';

export interface AnnotationMessage {
  prompt: string;
  displayPrompt: string;
}

/** The timeline shows user intent; routing stays in the model-facing prompt. */
export function annotationMessage(
  instanceId: string,
  input: GraphInput,
  document: GraphDialogue,
): AnnotationMessage {
  const graph = document.content?.graphs.find((g) => g.id === input.target?.graphId);
  const node = graph?.nodes.find((n) => n.id === input.target?.nodeId);
  const target = node ? `${node.label} · ${graph!.title}` : 'Whole document';
  return {
    displayPrompt: `${input.annotation}\n\nMDX Dialogue · ${target}`,
    prompt:
      `The user submitted this annotation in MDX Dialogue: ${JSON.stringify(input.annotation)}. ` +
      `Use invoke_canvas_action for canvas mdx-dialogue, instance ${JSON.stringify(instanceId)}, ` +
      `action get_document to read the saved document and selected-node annotation. ` +
      `Reply using action respond_to_graph with submissionId ${input.submissionId} and a complete reply ` +
      `(title, summary, mdx, graphs), following its authoring schema. ` +
      `Preserve the document's intent and apply the user's saved request in this same Canvas instance. ` +
      `After the action succeeds, briefly acknowledge what changed in the conversation.`,
  };
}
