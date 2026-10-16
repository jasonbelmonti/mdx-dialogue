import { join } from 'node:path';
import { dataDirectory } from './data-directory.js';
import { z } from 'zod';
import { snapshotSchema, type Dialogue } from '../shared/dialogue.js';
import { DialogueStore } from './dialogue-store.js';
import { snapshotStorage } from './snapshot-storage.js';

export function persistentStore(path = join(dataDirectory(), 'dialogues.json')) {
  const storage = snapshotStorage<Dialogue>(path, (value) =>
    z.array(snapshotSchema.shape.dialogue).parse(value),
  );
  return new DialogueStore(storage.initial, storage.save);
}
