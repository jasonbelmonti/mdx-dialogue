import { randomUUID } from 'node:crypto';
import {
  options,
  selectionSchema,
  modelReplySchema,
  type Dialogue,
  type Selection,
  type ModelReply,
  type Submission,
} from '../shared/dialogue.js';
import { parseReplyMdx } from '../shared/mdx.js';

export class DialogueStore {
  private documents = new Map<string, Dialogue>();
  constructor(
    initial: Dialogue[] = [],
    private save: (docs: Dialogue[]) => void = () => {},
  ) {
    for (const original of initial) {
      const doc = structuredClone(original);
      for (const submission of doc.submissions) {
        if (submission.status === 'running') {
          submission.status = 'failed';
          submission.error = 'The local server restarted. Retry your saved submission.';
        }
      }
      this.documents.set(doc.id, doc);
    }
  }
  private commit(doc: Dialogue) {
    const next = new Map(this.documents);
    next.set(doc.id, doc);
    this.save([...next.values()]);
    this.documents = next;
    return this.read(doc.id);
  }
  create(): Dialogue {
    if (this.documents.size >= 100)
      throw new Error(
        'Prototype limit of 100 saved dialogues reached. Reopen an existing dialogue.',
      );
    const doc: Dialogue = { id: randomUUID(), revision: 1, options, submissions: [] };
    return this.commit(doc);
  }
  private get(id: string): Dialogue {
    const doc = this.documents.get(id);
    if (!doc) throw new Error('Dialogue not found. Reopen the comparison.');
    return doc;
  }
  read(id: string): Dialogue {
    return structuredClone(this.get(id));
  }
  submit(input: Selection): Dialogue {
    const selection = selectionSchema.parse(input);
    const doc = this.read(selection.documentId);
    const existing = doc.submissions.find((s) => s.submissionId === selection.submissionId);
    if (existing) {
      if (
        existing.selectedId !== selection.selectedId ||
        existing.annotation !== selection.annotation ||
        existing.revision !== selection.revision
      )
        throw new Error('Submission ID is already used for different input.');
      return this.read(doc.id);
    }
    if (selection.revision !== doc.revision)
      throw new Error('This comparison has changed. Refresh before submitting.');
    if (doc.submissions.some((s) => ['awaiting-model', 'running'].includes(s.status)))
      throw new Error('A response is already pending.');
    if (doc.submissions.length >= 20)
      throw new Error('Prototype dialogue limit reached. Open a new comparison.');
    doc.submissions.push({
      ...selection,
      status: 'awaiting-model',
      createdAt: new Date().toISOString(),
    });
    return this.commit(doc);
  }
  submission(id: string, submissionId: string): Submission {
    const entry = this.get(id).submissions.find((s) => s.submissionId === submissionId);
    if (!entry) throw new Error('Submission not found.');
    return structuredClone(entry);
  }
  begin(id: string, submissionId: string): boolean {
    const doc = this.read(id);
    const entry = this.pending(doc, submissionId);
    if (entry.status === 'running') return false;
    entry.status = 'running';
    delete entry.error;
    this.commit(doc);
    return true;
  }
  complete(
    id: string,
    submissionId: string,
    reply: ModelReply,
    source: 'codex-cli' | 'host-model',
  ): Dialogue {
    const doc = this.read(id);
    const entry = this.pending(doc, submissionId);
    const checked = modelReplySchema.parse(reply);
    parseReplyMdx(checked.mdx);
    Object.assign(entry, {
      reply: checked,
      source,
      status: 'complete',
      completedAt: new Date().toISOString(),
    });
    delete entry.error;
    doc.revision++;
    return this.commit(doc);
  }
  fail(id: string, submissionId: string, error: string): Dialogue {
    const doc = this.read(id);
    const entry = this.pending(doc, submissionId);
    entry.status = 'failed';
    entry.error = error;
    return this.commit(doc);
  }
  private pending(doc: Dialogue, submissionId: string) {
    const entry = doc.submissions.find((s) => s.submissionId === submissionId);
    if (!entry) throw new Error('Submission not found.');
    if (entry.status === 'complete') throw new Error('Submission already completed.');
    if (entry !== doc.submissions.at(-1) || entry.revision !== doc.revision)
      throw new Error('Response targets an outdated submission or revision.');
    return entry;
  }
}
