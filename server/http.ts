import express from 'express';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { z } from 'zod';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { DialogueStore } from './dialogue-store.js';
import { createMcpServer } from './mcp.js';
import { runCodex, type HostInput } from './codex-runner.js';

const runSchema = z.object({
  documentId: z.uuid(),
  submissionId: z.uuid(),
  message: z.unknown(),
  context: z.unknown(),
});
export function createHttpApp(store: DialogueStore, origin: string, runner = runCodex) {
  const app = express();
  let active = false;
  app.use((req, res, next) => {
    if (
      req.headers.host !== new URL(origin).host ||
      (req.headers.origin && req.headers.origin !== origin)
    ) {
      res.status(403).json({ error: 'This prototype accepts only its local origin.' });
      return;
    }
    res.setHeader('X-Content-Type-Options', 'nosniff');
    next();
  });
  app.use(express.json({ limit: '32kb' }));
  app.post('/api/respond', (req, res) => {
    try {
      const input = runSchema.parse(req.body);
      const sub = store.submission(input.documentId, input.submissionId);
      if (sub.status === 'complete' || sub.status === 'running') {
        res.json({ accepted: true });
        return;
      }
      if (active) {
        res.status(409).json({ error: 'Another Codex response is running. Try again shortly.' });
        return;
      }
      store.begin(input.documentId, input.submissionId);
      active = true;
      res.status(202).json({ accepted: true });
      const hostInput: HostInput = { message: input.message, context: input.context };
      void runner(store.read(input.documentId), sub, hostInput)
        .then((reply) => {
          store.complete(input.documentId, input.submissionId, reply, 'codex-cli');
        })
        .catch((error) => {
          store.fail(
            input.documentId,
            input.submissionId,
            error instanceof Error ? error.message : 'Model response failed.',
          );
        })
        .finally(() => {
          active = false;
        });
    } catch (error) {
      res
        .status(400)
        .json({ error: error instanceof Error ? error.message : 'Invalid submission.' });
    }
  });
  app.all('/mcp', async (req, res) => {
    const server = createMcpServer(store);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    res.on('close', () => {
      void transport.close();
      void server.close();
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch {
      if (!res.headersSent) res.status(500).json({ error: 'MCP request failed.' });
    }
  });
  app.get('/widget.html', async (_req, res) => {
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'",
    );
    res.type('html').send(await readFile('dist/widget/widget.html', 'utf8'));
  });
  app.use(express.static(resolve('dist/host')));
  app.use(
    (error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      res.status(400).json({ error: error.message });
    },
  );
  return app;
}
