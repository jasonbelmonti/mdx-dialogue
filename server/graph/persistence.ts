import { resolve } from 'node:path';
import { z } from 'zod';
import { graphDialogueSchema } from '../../shared/graph/schema.js';
import { snapshotStorage } from '../snapshot-storage.js';
import { GraphStore } from './store.js';

export function persistentGraphStore(path = resolve('.data/graphs.json')) {
  const storage = snapshotStorage(path, (value) => z.array(graphDialogueSchema).parse(value));
  return new GraphStore(storage.initial, storage.save);
}
