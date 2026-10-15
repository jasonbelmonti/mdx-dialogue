import { useDialogue } from '../dialogue-context.js';
export function AnnotationForm() {
  const { annotation, setAnnotation, send, retry, busy, waiting, error, canRetry } = useDialogue();
  const retryable = canRetry && Boolean(error);
  return (
    <section className="annotation-form" aria-label="Discuss your selection">
      <label htmlFor="annotation">What would make this work better for you?</label>
      <textarea
        id="annotation"
        placeholder="For example: keep the side-by-side layout, use a green accent, and make the controls more compact."
        value={annotation}
        maxLength={1500}
        required
        disabled={busy || waiting}
        onChange={(event) => setAnnotation(event.target.value)}
      />
      <div className="form-footer">
        <span>
          {waiting
            ? 'The model is revising your layout…'
            : 'Your selection and note travel together.'}
        </span>
        {retryable ? (
          <button type="button" onClick={retry} disabled={busy || waiting}>
            Retry response
          </button>
        ) : (
          <button type="button" onClick={send} disabled={busy || waiting || !annotation.trim()}>
            {busy ? 'Sending…' : waiting ? 'Waiting for the model…' : 'Discuss & revise'}
            <span aria-hidden="true">↗</span>
          </button>
        )}
      </div>
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
