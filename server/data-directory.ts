import { resolve } from 'node:path';

// Developer entry points retain their checkout-local data unless explicitly configured.
// The installed CLI always supplies a durable user directory before loading the server.
export function dataDirectory() {
  return resolve(process.env.MDX_DIALOGUE_DATA_DIR ?? '.data');
}
