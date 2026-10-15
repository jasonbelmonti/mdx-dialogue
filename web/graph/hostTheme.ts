import {
  applyDocumentTheme,
  applyHostStyleVariables,
  type McpUiHostContext,
} from '@modelcontextprotocol/ext-apps';

/** Apply both the initial context and partial host updates without resetting omitted values. */
export function applyHostTheme(context: Partial<McpUiHostContext>) {
  if (context.theme) applyDocumentTheme(context.theme);
  if (context.styles?.variables) applyHostStyleVariables(context.styles.variables);
  if (context.displayMode) document.documentElement.dataset.displayMode = context.displayMode;
}
