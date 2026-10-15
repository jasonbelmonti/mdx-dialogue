import { useSyncExternalStore } from 'react';
import { workspaceDisplay } from './bridge.js';
import './workspace.css';

export function WorkspaceControl() {
  const { mode, canExpand, pending, error } = useSyncExternalStore(
    workspaceDisplay.subscribe,
    workspaceDisplay.snapshot,
  );
  if (mode === 'fullscreen' && !error) return null;
  return (
    <div className="workspace-control">
      {canExpand && mode !== 'fullscreen' ? (
        <button type="button" disabled={pending} onClick={() => void workspaceDisplay.open()}>
          {pending ? 'Opening workspace…' : 'Open beside chat'}
        </button>
      ) : null}
      {error && <p role="status">{error}</p>}
    </div>
  );
}
