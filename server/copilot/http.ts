import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { GraphInput } from '../../shared/graph/schema.js';
import type { CanvasDocuments } from './documents.js';

async function body(request: IncomingMessage) {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 262144) throw new Error('Request exceeds 256 KiB.');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as GraphInput;
}
function json(response: ServerResponse, status: number, value: unknown) {
  response.writeHead(status, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify(value));
}

export async function startCanvasServer(documents: CanvasDocuments, html: string) {
  let origin = '';
  const server = createServer((request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    void handle(request, response).catch((error) => {
      if (!response.headersSent)
        json(response, 400, {
          error: error instanceof Error ? error.message : 'Canvas request failed.',
        });
      else response.end();
    });
  });
  async function handle(request: IncomingMessage, response: ServerResponse) {
    if (
      request.headers.host !== new URL(origin).host ||
      (request.headers.origin && request.headers.origin !== origin)
    ) {
      json(response, 403, { error: 'Only same-origin loopback requests are accepted.' });
      return;
    }
    if (request.url === '/' && request.method === 'GET') {
      response.setHeader(
        'Content-Security-Policy',
        "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'self'; font-src data:; base-uri 'none'; form-action 'none'",
      );
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      response.end(html);
      return;
    }
    let instance;
    try {
      instance = documents.authorize(request.headers.authorization?.replace(/^Bearer /, '') ?? '');
    } catch {
      json(response, 401, { error: 'Canvas access expired. Reopen it from Copilot.' });
      return;
    }
    if (request.url === '/document' && request.method === 'GET') {
      json(response, 200, documents.read(instance));
    } else if (request.url === '/annotation' && request.method === 'POST') {
      if (request.headers['content-type'] !== 'application/json') {
        json(response, 415, { error: 'Expected application/json.' });
        return;
      }
      json(response, 200, await documents.submit(instance, await body(request)));
    } else json(response, 404, { error: 'Unknown Canvas endpoint.' });
  }
  server.requestTimeout = 15000;
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return {
    origin,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeAllConnections();
      }),
  };
}
