export type DocumentIdentity = { id: string; revision: number };
type Request = { documentId: string; selection: number; generation: number };

// Only explicit selection changes may replace the active document. Payloads need a request ticket.
export class DocumentState<T extends DocumentIdentity> {
  private current: T | null = null;
  private selected: string | null = null;
  private selection = 0;
  private generation = 0;
  constructor(private reconcile: (next: T, current: T) => T = (next) => next) {}
  read = () => this.current;
  selectedId = () => this.selected;
  selectionVersion = () => this.selection;
  select(documentId: string) {
    this.selected = documentId;
    this.selection++;
    this.generation++;
  }
  request(documentId: string): Request {
    this.assertSelected(documentId);
    return { documentId, selection: this.selection, generation: ++this.generation };
  }
  assertSelected(documentId: string) {
    if (this.selected !== documentId) throw new Error('The selected document changed.');
  }
  accept(next: T, request: Request): T {
    if (next.id !== request.documentId) throw new Error('Host returned a different document.');
    if (
      request.selection !== this.selection ||
      request.generation !== this.generation ||
      this.selected !== next.id
    ) {
      if (!this.current) throw new Error('The selected document changed.');
      return this.current;
    }
    if (this.current?.id === next.id) {
      if (next.revision < this.current.revision) return this.current;
      next = this.reconcile(next, this.current);
    }
    this.current = next;
    return next;
  }
}
