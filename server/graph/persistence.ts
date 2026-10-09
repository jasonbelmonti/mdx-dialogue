import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { z } from 'zod';
import { graphDialogueSchema } from '../../shared/graph/schema.js';
import { GraphStore } from './store.js';
export function persistentGraphStore(path = resolve('.data/graphs.json')) {
  mkdirSync(dirname(path), { recursive: true });
  const docs = existsSync(path)
    ? z.array(graphDialogueSchema).parse(JSON.parse(readFileSync(path, 'utf8')))
    : [];
  return new GraphStore(docs, (next) => {
    writeFileSync(`${path}.tmp`, JSON.stringify(next, null, 2), { mode: 0o600 });
    renameSync(`${path}.tmp`, path);
  });
}
