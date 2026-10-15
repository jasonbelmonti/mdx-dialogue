import type { App, McpUiHostContext } from '@modelcontextprotocol/ext-apps';

type DisplayHost = Pick<App, 'getHostContext' | 'requestDisplayMode'>;
type DisplayState = {
  mode: McpUiHostContext['displayMode'];
  canExpand: boolean;
  pending: boolean;
  error: string;
};

export function createWorkspaceDisplay(host: DisplayHost) {
  let state: DisplayState = { mode: undefined, canExpand: false, pending: false, error: '' };
  const listeners = new Set<() => void>();
  function publish(update: Partial<DisplayState>) {
    state = { ...state, ...update };
    listeners.forEach((listener) => listener());
  }
  function updateContext(context: Partial<McpUiHostContext>) {
    publish({
      ...(context.displayMode !== undefined ? { mode: context.displayMode, error: '' } : {}),
      ...(context.availableDisplayModes !== undefined
        ? { canExpand: context.availableDisplayModes.includes('fullscreen') }
        : {}),
    });
  }
  async function open() {
    if (state.pending || !state.canExpand || state.mode === 'fullscreen') return;
    publish({ pending: true, error: '' });
    try {
      const result = await host.requestDisplayMode({ mode: 'fullscreen' });
      publish({
        mode: result.mode,
        error:
          result.mode === 'fullscreen' ? '' : 'Codex kept this view inline. Try Open beside chat.',
      });
    } catch {
      publish({ error: 'Could not open the workspace. You can retry or continue here.' });
    } finally {
      publish({ pending: false });
    }
  }
  return {
    snapshot: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    updateContext,
    async initialize() {
      updateContext(host.getHostContext() ?? {});
      await open();
    },
    open,
  };
}
