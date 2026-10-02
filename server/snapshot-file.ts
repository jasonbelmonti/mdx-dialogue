import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { z } from 'zod';
import { snapshotSchema, type Dialogue } from '../shared/dialogue.js';
import { DialogueStore } from './dialogue-store.js';

export function persistentStore(path = resolve('.data/dialogues.json')) {
  mkdirSync(dirname(path), { recursive: true });
  const initial = existsSync(path)
    ? (z
        .array(snapshotSchema.shape.dialogue)
        .parse(JSON.parse(readFileSync(path, 'utf8'))) as Dialogue[])
    : [];
  return new DialogueStore(initial, (docs) => {
    writeFileSync(`${path}.tmp`, JSON.stringify(docs, null, 2), { mode: 0o600 });
    renameSync(`${path}.tmp`, path);
  });
}
