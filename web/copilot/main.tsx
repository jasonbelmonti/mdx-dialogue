import { createRoot } from 'react-dom/client';
import { GraphPanel } from '../graph/GraphPanel.js';
import { createCanvasTransport } from './transport.js';

const transport = createCanvasTransport(location.hash.slice(1));
document.documentElement.dataset.displayMode = 'fullscreen';
window.addEventListener('pagehide', () => transport.close(), { once: true });
createRoot(document.getElementById('root')!).render(
  <GraphPanel transport={transport} hostName="Copilot" />,
);
