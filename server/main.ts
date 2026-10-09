import { persistentGraphStore } from './graph/persistence.js';
import { createHttpApp } from './http.js';
import { persistentStore } from './snapshot-file.js';
const port = Number(process.env.PORT ?? 4317);
const origin = `http://127.0.0.1:${port}`;
createHttpApp(persistentStore(), origin, undefined, persistentGraphStore()).listen(
  port,
  '127.0.0.1',
  () => console.log(`MDX Dialogue: ${origin}\nMCP endpoint: ${origin}/mcp`),
);
