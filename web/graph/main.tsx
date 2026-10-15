import { createRoot } from 'react-dom/client';
import { GraphPanel } from './GraphPanel.js';
import * as transport from './bridge.js';
import { WorkspaceControl } from './WorkspaceControl.js';
createRoot(document.getElementById('root')!).render(
  <GraphPanel transport={transport} hostName="Codex" workspaceControl={<WorkspaceControl />} />,
);
