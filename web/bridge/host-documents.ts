import { documentSelectionKey, documentSelectionSchema } from '../../shared/document-selection.js';
import { DocumentState, type DocumentIdentity } from './document-state.js';

// Host results are notifications or explicit selections. Read authoritative saved data for both.
export class HostDocuments<T extends DocumentIdentity> {
  private writes = new Set<Promise<void>>();
  private epochs = new Set<string>();
  private epoch: string | null = null;
  private sequence = 0;
  constructor(
    private state: DocumentState<T>,
    private load: (id: string) => Promise<T>,
  ) {}

  async refresh(documentId: string) {
    this.state.assertSelected(documentId);
    const selection = this.state.selectionVersion();
    while (this.writes.size) await Promise.all([...this.writes]);
    if (selection !== this.state.selectionVersion())
      throw new Error('The selected document changed.');
    const request = this.state.request(documentId);
    return this.state.accept(await this.load(documentId), request);
  }

  async save(documentId: string, operation: () => Promise<T>) {
    const request = this.state.request(documentId);
    const pending = Promise.resolve().then(operation);
    const settled = pending.then(
      () => {},
      () => {},
    );
    this.writes.add(settled);
    try {
      return this.state.accept(await pending, request);
    } finally {
      this.writes.delete(settled);
    }
  }

  async receive(next: T, meta?: Record<string, unknown>) {
    const raw = meta?.[documentSelectionKey];
    if (raw !== undefined) {
      const intent = documentSelectionSchema.parse(raw);
      if (intent.documentId !== next.id)
        throw new Error('Host selection does not match its document.');
      if (intent.epoch === this.epoch) {
        if (intent.sequence < this.sequence) return this.state.read();
        if (intent.sequence === this.sequence) {
          if (this.state.selectedId() !== next.id) return this.state.read();
          return this.refresh(next.id);
        }
      } else {
        if (this.epochs.has(intent.epoch)) return this.state.read();
        this.epochs.add(intent.epoch);
        this.epoch = intent.epoch;
      }
      this.sequence = intent.sequence;
      this.state.select(next.id);
    } else if (!this.state.selectedId()) this.state.select(next.id);
    else if (this.state.selectedId() !== next.id) return this.state.read();
    return this.refresh(next.id);
  }
}
