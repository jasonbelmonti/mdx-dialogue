type Document = { id: string; revision: number };
type Request = { documentId: string; generation: number };

// Tool pushes select the document. Request results may only update that selection.
export class DocumentState<T extends Document> {
  private current: T | null = null;
  private generation = 0;
  constructor(private reconcile: (next: T, current: T) => T = (next) => next) {}
  read = () => this.current;
  request(documentId: string): Request {
    return { documentId, generation: ++this.generation };
  }
  assertSelected(documentId: string) {
    if (this.current?.id !== documentId) throw new Error('The selected document changed.');
  }
  accept(next: T, request?: Request): T {
    if (request) {
      if (next.id !== request.documentId) throw new Error('Host returned a different document.');
      if (request.generation !== this.generation || this.current?.id !== request.documentId) {
        if (!this.current) throw new Error('No document is selected.');
        return this.current;
      }
    } else this.generation++;
    if (this.current?.id === next.id) {
      if (next.revision < this.current.revision) return this.current;
      next = this.reconcile(next, this.current);
    }
    this.current = next;
    return next;
  }
}
