import { packagePath } from './package-paths.js';
import { settleResponse } from './response-job.js';
import { GraphStore } from './graph/store.js';
import { registerGraphRoutes } from './graph/http.js';
import express from 'express';
import { readFile } from 'node:fs/promises';
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
export function createHttpApp(
  store: DialogueStore,
  origin: string,
  runner = runCodex,
  graphs = new GraphStore(),
) {
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
  app.use(express.json({ limit: '256kb' }));
  registerGraphRoutes(app, graphs);
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
      void settleResponse({
        run: () => runner(store.read(input.documentId), sub, hostInput),
        complete: (reply) => {
          store.complete(input.documentId, input.submissionId, reply, 'codex-cli');
        },
        fail: (message) => {
          store.fail(input.documentId, input.submissionId, message);
        },
        release: () => {
          active = false;
        },
      });
    } catch (error) {
      res
        .status(400)
        .json({ error: error instanceof Error ? error.message : 'Invalid submission.' });
    }
  });
  app.all('/mcp', async (req, res) => {
    const server = createMcpServer(store, graphs);
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
    res.type('html').send(await readFile(packagePath('dist/widget/widget.html'), 'utf8'));
  });
  app.get('/graph-widget.html', async (_req, res) => {
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'",
    );
    res
      .type('html')
      .send(await readFile(packagePath('dist/graph-widget/graph-widget.html'), 'utf8'));
  });
  app.get('/graphs', (_req, res) => {
    res.sendFile('index.html', { root: packagePath('dist/host') });
  });
  app.use('/docs', express.static(packagePath('site/build'), { extensions: ['html'] }));
  app.use(express.static(packagePath('dist/host')));
  app.use(
    (error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      res.status(400).json({ error: error.message });
    },
  );
  return app;
}
