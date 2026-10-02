import { useEffect, useState, useSyncExternalStore } from 'react';
import { MDXProvider } from '@mdx-js/react';
import Document from '../content/comparison.mdx';
import { DialogueContext } from './dialogue-context.js';
import { Comparison } from './components/Comparison.js';
import { AnnotationForm } from './components/AnnotationForm.js';
import { ModelReply } from './components/ModelReply.js';
import {
  app,
  connectionError,
  refresh,
  requestResponse,
  snapshot,
  submit,
  subscribe,
} from './bridge/client.js';
import type { Layout, Selection } from '../shared/dialogue.js';

const components = { Comparison, AnnotationForm, ModelReply };
export function DialoguePanel() {
  const doc = useSyncExternalStore(subscribe, snapshot);
  const startupError = useSyncExternalStore(subscribe, connectionError);
  const [selected, select] = useState<Layout>('split');
  const [annotation, setAnnotation] = useState('');
  const [busy, setBusy] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [error, setError] = useState('');
  const pending = doc?.submissions.at(-1);

  useEffect(() => {
    if (!doc) return;
    const latest = doc.submissions.at(-1);
    if (latest) {
      select(latest.selectedId);
      setAnnotation(latest.annotation);
      setError(latest.status === 'failed' ? (latest.error ?? 'Response failed.') : '');
      setWaiting(['running', 'awaiting-model'].includes(latest.status));
    }
  }, [doc?.id]);

  useEffect(() => {
    if (!doc || !pending || !waiting) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const started = Date.now();
    async function poll() {
      try {
        const next = await refresh(doc!.id);
        if (cancelled) return;
        const entry = next.submissions.find((s) => s.submissionId === pending!.submissionId);
        if (entry?.status === 'complete') {
          setWaiting(false);
          return;
        }
        if (entry?.status === 'failed') {
          setWaiting(false);
          setError(entry.error ?? 'The model response failed.');
          return;
        }
        if (Date.now() - started > 190_000)
          throw new Error(
            'No response has arrived yet. Your input is saved. You can retry the request.',
          );
        timer = setTimeout(poll, 1500);
      } catch (e) {
        if (!cancelled) {
          setWaiting(false);
          setError(String(e instanceof Error ? e.message : e));
        }
      }
    }
    timer = setTimeout(poll, 700);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [doc?.id, pending?.submissionId, pending?.status, waiting]);

  async function deliver(selection: Selection, record: boolean) {
    setBusy(true);
    setError('');
    try {
      if (record) await submit(selection);
      await requestResponse(selection);
      setWaiting(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  function send() {
    if (!doc || busy || waiting) return;
    void deliver(
      {
        documentId: doc.id,
        revision: doc.revision,
        submissionId: crypto.randomUUID(),
        selectedId: selected,
        annotation,
      },
      true,
    );
  }
  function retry() {
    if (pending && !busy) void deliver(pending, false);
  }
  if (!doc)
    return (
      <main className="loading" role="status">
        {startupError ?? 'Connecting your MDX document…'}
      </main>
    );
  return (
    <DialogueContext
      value={{
        doc,
        selected,
        select,
        annotation,
        setAnnotation,
        busy,
        waiting,
        error,
        send,
        retry,
      }}
    >
      <main className="document">
        <div className="document-meta">
          <span>MDX / an interactive document</span>
          <span>Revision {doc.revision}</span>
        </div>
        <MDXProvider components={components}>
          <Document />
        </MDXProvider>
        <footer className="document-footer">
          Connected to {app.getHostVersion()?.name ?? 'MCP host'} · Saved locally on this machine.
        </footer>
      </main>
    </DialogueContext>
  );
}
