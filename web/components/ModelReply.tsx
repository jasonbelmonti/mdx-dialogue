import { useDialogue } from '../dialogue-context.js';
import { ReplyMdx } from './ReplyMdx.js';
export function ModelReply() {
  const { doc, waiting } = useDialogue();
  const completed = doc.submissions.filter((sub) => sub.status === 'complete');
  if (!completed.length)
    return (
      <section className="empty-reply" aria-live="polite">
        <div className={waiting ? 'pulse-mark active' : 'pulse-mark'} />
        <h2>{waiting ? 'A response is taking shape.' : 'The next move is yours.'}</h2>
        <p>
          {waiting
            ? 'Your exact selection and note have been sent through the host bridge.'
            : 'A real model response and revised preview will appear here.'}
        </p>
      </section>
    );
  const latest = completed.at(-1)!;
  return (
    <section className="model-reply" aria-live="polite">
      <div className="reply-label">
        <span>Model response</span>
        <span>
          Revision {doc.revision} · {latest.source === 'codex-cli' ? 'Codex CLI' : 'Host model'}
        </span>
      </div>
      <ReplyMdx source={latest.reply!.mdx} />
      <details className="receipt">
        <summary>View the round trip</summary>
        <dl>
          <dt>You selected</dt>
          <dd>{latest.selectedId}</dd>
          <dt>Your note</dt>
          <dd>{latest.annotation}</dd>
          <dt>Model summary</dt>
          <dd>{latest.reply!.summary}</dd>
          <dt>Submission</dt>
          <dd>
            <code>{latest.submissionId}</code>
          </dd>
        </dl>
        <pre>{latest.reply!.mdx}</pre>
      </details>
    </section>
  );
}
