import type { Express } from 'express';
import { z } from 'zod';
import { GraphStore } from './store.js';
import { runGraphCodex } from './runner.js';
const inputSchema = z.object({
  documentId: z.uuid(),
  submissionId: z.uuid(),
  message: z.unknown(),
  context: z.unknown(),
});
export function registerGraphRoutes(app: Express, store: GraphStore, runner = runGraphCodex) {
  let active = false;
  app.get('/api/graphs/:id', (req, res) => {
    try {
      res.setHeader('Cache-Control', 'no-store');
      res.json(store.read(z.uuid().parse(req.params.id)));
    } catch (error) {
      res
        .status(404)
        .json({ error: error instanceof Error ? error.message : 'Document not found.' });
    }
  });
  app.post('/api/graphs/respond', (req, res) => {
    try {
      const input = inputSchema.parse(req.body);
      const sub = store.submission(input.documentId, input.submissionId);
      if (sub.status === 'complete' || sub.status === 'running') {
        res.json({ accepted: true });
        return;
      }
      if (active) {
        res.status(409).json({ error: 'Another graph response is running. Retry shortly.' });
        return;
      }
      store.begin(input.documentId, input.submissionId);
      active = true;
      res.status(202).json({ accepted: true });
      void runner(store.read(input.documentId), sub, {
        message: input.message,
        context: input.context,
      })
        .then((reply) => {
          store.complete(input.documentId, input.submissionId, reply, 'codex-cli');
        })
        .catch((error) => {
          try {
            store.fail(
              input.documentId,
              input.submissionId,
              error instanceof Error ? error.message : 'Model response failed.',
            );
          } catch {
            /* A newer accepted reply superseded this attempt. */
          }
        })
        .finally(() => {
          active = false;
        });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid request.' });
    }
  });
}
