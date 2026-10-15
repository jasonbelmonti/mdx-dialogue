import { join } from 'node:path';
import { dataDirectory } from '../data-directory.js';
import { z } from 'zod';
import { graphDialogueSchema } from '../../shared/graph/schema.js';
import { snapshotStorage } from '../snapshot-storage.js';
import { GraphStore } from './store.js';

export function persistentGraphStore(path = join(dataDirectory(), 'graphs.json')) {
  const storage = snapshotStorage(path, (value) => z.array(graphDialogueSchema).parse(value));
  return new GraphStore(storage.initial, storage.save);
}
