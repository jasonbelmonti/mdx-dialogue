import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { CallToolResultSchema } from '@modelcontextprotocol/sdk/types.js';
import { AppBridge, PostMessageTransport } from '@modelcontextprotocol/ext-apps/app-bridge';
import './host.css';

const graphMode = location.pathname === '/graphs';
const status = document.querySelector<HTMLElement>('#host-status')!;
const errorEl = document.querySelector<HTMLElement>('#host-error')!;
async function start() {
  const client = new Client({ name: 'mdx-dialogue-local-host', version: '0.1.0' });
  await client.connect(new StreamableHTTPClientTransport(new URL('/mcp', location.origin)));
  let modelContext: { structuredContent?: Record<string, unknown> } = {};
  const bridge = new AppBridge(
    null,
    { name: 'Local Codex harness', version: '0.1.0' },
    {
      serverTools: {},
      updateModelContext: { text: {} },
      message: { text: {} },
    },
    { hostContext: { theme: 'light', displayMode: 'inline' } },
  );
  bridge.oncalltool = async (params) => {
    if (
      !(
        graphMode
          ? ['get_graph_dialogue', 'submit_graph_annotation']
          : ['get_dialogue', 'submit_selection']
      ).includes(params.name)
    )
      throw new Error('Tool is not exposed to the app.');
    return CallToolResultSchema.parse(await client.callTool(params));
  };
  bridge.onupdatemodelcontext = async (context) => {
    modelContext = context;
    return {};
  };
  bridge.onmessage = async (message) => {
    const context = modelContext.structuredContent;
    if (!context?.documentId || !context?.submissionId) return { isError: true };
    const res = await fetch(graphMode ? '/api/graphs/respond' : '/api/respond', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        documentId: context.documentId,
        submissionId: context.submissionId,
        message,
        context: modelContext,
      }),
    });
    if (!res.ok) {
      const data = await res.json();
      errorEl.textContent = data.error;
      return { isError: true };
    }
    errorEl.textContent = '';
    status.textContent = 'Message delivered to Codex';
    return {};
  };
  const iframe = document.createElement('iframe');
  iframe.title = 'Interactive MDX dialogue';
  iframe.sandbox.add('allow-scripts');
  document.querySelector('#surface')!.appendChild(iframe);
  bridge.oninitialized = async () => {
    await bridge.sendToolInput({ arguments: {} });
    const savedId = new URL(location.href).searchParams.get('document');
    const result = CallToolResultSchema.parse(
      await client.callTool(
        savedId
          ? {
              name: graphMode ? 'get_graph_dialogue' : 'get_dialogue',
              arguments: { documentId: savedId },
            }
          : { name: graphMode ? 'open_graph_dialogue' : 'open_dialogue', arguments: {} },
      ),
    );
    const doc = result.structuredContent?.[graphMode ? 'graphDialogue' : 'dialogue'] as
      { id?: string } | undefined;
    if (doc?.id) {
      const url = new URL(location.href);
      url.searchParams.set('document', doc.id);
      history.replaceState(null, '', url);
      if (graphMode) {
        const link = document.querySelector<HTMLAnchorElement>('#docs-link')!;
        link.href = `/docs/graph?document=${doc.id}`;
        void fetch('/docs/graph', { method: 'HEAD' })
          .then((response) => {
            link.hidden = !response.ok;
          })
          .catch(() => {
            link.hidden = true;
          });
      }
    }
    await bridge.sendToolResult(result);
    status.textContent = 'MCP Apps bridge connected';
  };
  await bridge.connect(new PostMessageTransport(iframe.contentWindow!, iframe.contentWindow!));
  iframe.src = graphMode ? '/graph-widget.html' : '/widget.html';
}
start().catch((error) => {
  status.textContent = 'Connection failed';
  errorEl.textContent = error.message;
});
