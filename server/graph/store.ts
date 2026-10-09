import { randomUUID } from 'node:crypto';
import {
  graphInputSchema,
  type GraphDialogue,
  type GraphInput,
  type GraphSubmission,
} from '../../shared/graph/schema.js';
import { validateGraphReply } from '../../shared/graph/validation.js';
export class GraphStore {
  private docs = new Map<string, GraphDialogue>();
  constructor(
    initial: GraphDialogue[] = [],
    private save: (docs: GraphDialogue[]) => void = () => {},
  ) {
    for (const original of initial) {
      const doc = structuredClone(original);
      if (doc.content) validateGraphReply(doc.content);
      for (const sub of doc.submissions)
        if (sub.status === 'running') {
          sub.status = 'failed';
          sub.error = 'The server restarted. Retry your saved request.';
        }
      this.docs.set(doc.id, doc);
    }
  }
  private commit(doc: GraphDialogue) {
    const next = new Map(this.docs);
    next.set(doc.id, doc);
    this.save([...next.values()]);
    this.docs = next;
    return this.read(doc.id);
  }
  create(initial?: unknown) {
    if (this.docs.size >= 100)
      throw new Error('Saved document limit reached. Reopen an existing document.');
    const content = initial === undefined ? null : validateGraphReply(initial);
    return this.commit({ id: randomUUID(), revision: 1, content, submissions: [] });
  }
  read(id: string): GraphDialogue {
    const doc = this.docs.get(id);
    if (!doc) throw new Error('Graph document not found.');
    return structuredClone(doc);
  }
  submit(raw: GraphInput) {
    const input = graphInputSchema.parse(raw);
    const doc = this.read(input.documentId);
    const existing = doc.submissions.find((s) => s.submissionId === input.submissionId);
    if (existing) {
      if (JSON.stringify(graphInputSchema.parse(existing)) !== JSON.stringify(input))
        throw new Error('Submission ID already used for other input.');
      return doc;
    }
    if (input.revision !== doc.revision)
      throw new Error('Document changed. Refresh before submitting.');
    if (doc.submissions.some((s) => ['awaiting-model', 'running'].includes(s.status)))
      throw new Error('A response is already pending.');
    if (doc.submissions.length >= 20)
      throw new Error('Document submission limit reached. Start a new document.');
    if (
      input.target &&
      !doc.content?.graphs.some(
        (g) => g.id === input.target!.graphId && g.nodes.some((n) => n.id === input.target!.nodeId),
      )
    )
      throw new Error('Selected node does not exist in this revision.');
    doc.submissions.push({
      ...input,
      status: 'awaiting-model',
      createdAt: new Date().toISOString(),
    });
    return this.commit(doc);
  }
  submission(id: string, submissionId: string): GraphSubmission {
    const sub = this.read(id).submissions.find((s) => s.submissionId === submissionId);
    if (!sub) throw new Error('Submission not found.');
    return sub;
  }
  private pending(doc: GraphDialogue, submissionId: string) {
    const sub = doc.submissions.at(-1);
    if (!sub || sub.submissionId !== submissionId || sub.revision !== doc.revision)
      throw new Error('Response targets an outdated submission or revision.');
    if (sub.status === 'complete') throw new Error('Submission already completed.');
    return sub;
  }
  begin(id: string, submissionId: string) {
    const doc = this.read(id);
    const sub = this.pending(doc, submissionId);
    if (sub.status === 'running') return false;
    sub.status = 'running';
    delete sub.error;
    this.commit(doc);
    return true;
  }
  complete(id: string, submissionId: string, raw: unknown, source: 'codex-cli' | 'host-model') {
    const reply = validateGraphReply(raw);
    const doc = this.read(id);
    const sub = this.pending(doc, submissionId);
    Object.assign(sub, {
      reply,
      source,
      status: 'complete',
      completedAt: new Date().toISOString(),
    });
    delete sub.error;
    doc.content = reply;
    doc.revision++;
    return this.commit(doc);
  }
  fail(id: string, submissionId: string, error: string) {
    const doc = this.read(id);
    const sub = this.pending(doc, submissionId);
    sub.status = 'failed';
    sub.error = error;
    return this.commit(doc);
  }
}
