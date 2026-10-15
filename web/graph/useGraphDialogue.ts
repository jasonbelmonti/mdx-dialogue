import { useEffect, useState, useSyncExternalStore } from 'react';
import type { GraphTransport } from './transport.js';
import type { GraphInput, GraphTarget } from '../../shared/graph/schema.js';
export function useGraphDialogue(transport: GraphTransport) {
  const { snapshot, subscribe, connectionError, deliver, refresh } = transport;
  const doc = useSyncExternalStore(subscribe, snapshot);
  const startupError = useSyncExternalStore(subscribe, connectionError);
  const [annotation, setAnnotation] = useState('');
  const [selected, setSelected] = useState<GraphTarget | null>(null);
  const [busy, setBusy] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [error, setError] = useState('');
  const [retryInput, setRetryInput] = useState<GraphInput | null>(null);
  const latest = doc?.submissions.at(-1);
  useEffect(() => {
    const previous = doc?.submissions.at(-1);
    if (previous) {
      setAnnotation(previous.annotation);
      setSelected(previous.target);
      if (previous.status !== 'complete') setRetryInput(previous);
      setWaiting(['awaiting-model', 'running'].includes(previous.status));
      setError(previous.status === 'failed' ? (previous.error ?? 'Response failed.') : '');
    }
  }, [doc?.id]);
  useEffect(() => {
    if (!doc || !latest || !waiting) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const started = Date.now();
    async function poll() {
      try {
        const next = await refresh(doc!.id);
        if (cancelled) return;
        const sub = next.submissions.find((s) => s.submissionId === latest!.submissionId);
        if (sub?.status === 'complete') {
          setWaiting(false);
          setRetryInput(null);
          setError('');
          return;
        }
        if (sub?.status === 'failed') throw new Error(sub.error ?? 'The model response failed.');
        if (Date.now() - started > 190000)
          throw new Error('No response arrived. Your input is saved; retry when ready.');
        timer = setTimeout(poll, 1200);
      } catch (e) {
        if (!cancelled) {
          setWaiting(false);
          setError(e instanceof Error ? e.message : String(e));
        }
      }
    }
    timer = setTimeout(poll, 600);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [doc?.id, latest?.submissionId, waiting]);
  async function send(retry = false) {
    if (!doc || busy || waiting) return;
    const target =
      selected &&
      doc.content?.graphs.some(
        (g) => g.id === selected.graphId && g.nodes.some((n) => n.id === selected.nodeId),
      )
        ? selected
        : null;
    const input =
      retry && retryInput
        ? retryInput
        : {
            documentId: doc.id,
            revision: doc.revision,
            submissionId: crypto.randomUUID(),
            target,
            annotation,
          };
    setBusy(true);
    setError('');
    setRetryInput(input);
    try {
      await deliver(input);
      setWaiting(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  return {
    doc,
    startupError,
    annotation,
    setAnnotation,
    selected,
    setSelected,
    busy,
    waiting,
    error,
    canRetry: !!retryInput,
    send,
  };
}
