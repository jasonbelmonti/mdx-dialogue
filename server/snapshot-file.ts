import { resolve } from 'node:path';
import { z } from 'zod';
import { snapshotSchema, type Dialogue } from '../shared/dialogue.js';
import { DialogueStore } from './dialogue-store.js';
import { snapshotStorage } from './snapshot-storage.js';

export function persistentStore(path = resolve('.data/dialogues.json')) {
  const storage = snapshotStorage<Dialogue>(path, (value) =>
    z.array(snapshotSchema.shape.dialogue).parse(value),
  );
  return new DialogueStore(storage.initial, storage.save);
}
