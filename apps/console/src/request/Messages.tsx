/**
 * Messages on a request (ADR 0009: all contact goes through JAD+), with a reply box when the API says the
 * signed-in person may write (`canMessage`). The API removes phone numbers and emails before saving and says
 * so; the console shows that note after sending.
 */
import {
  MESSAGE_MAX_LENGTH,
  messagePostedResponse,
  postMessageBody,
  type RequestDetail,
} from '@jadplus/shared';
import { useState, type SyntheticEvent, type ReactNode } from 'react';
import { apiPath } from '../lib/api';
import { dateTime } from '../lib/format';
import { useAction } from '../ui/actions';
import { useConsole } from '../ui/hooks';
import { Notice } from '../ui/parts';

function Reply({ requestId, onSent }: { requestId: string; onSent: () => void }): ReactNode {
  const { api } = useConsole();
  const [text, setText] = useState('');
  const [masked, setMasked] = useState(false);
  const action = useAction();
  const send = (e: SyntheticEvent): void => {
    e.preventDefault();
    const body = postMessageBody.safeParse({ body: text });
    if (!body.success) return;
    action.run(async () => {
      const sent = await api.post(
        apiPath('requests', requestId, 'messages'),
        body.data,
        messagePostedResponse,
      );
      setText('');
      setMasked(sent.masked);
      onSent();
    });
  };
  return (
    <form className="stack reply" onSubmit={send}>
      <label className="field">
        <span className="label">Reply</span>
        <textarea
          value={text}
          rows={3}
          maxLength={MESSAGE_MAX_LENGTH}
          onChange={(e) => {
            setText(e.target.value);
            setMasked(false);
          }}
        />
      </label>
      {masked ? (
        <Notice tone="warn">Phone numbers and emails were removed: all contact goes through JAD+.</Notice>
      ) : null}
      {action.error === null ? null : <Notice tone="bad">{action.error}</Notice>}
      <div>
        <button type="submit" className="btn" disabled={action.busy || text.trim() === ''}>
          {action.busy ? 'Sending…' : 'Send'}
        </button>
      </div>
    </form>
  );
}

export function Messages({
  d,
  editable,
  onSent,
}: {
  d: RequestDetail;
  /** False for a JAD+ viewer, who only reads. */
  editable: boolean;
  onSent: () => void;
}): ReactNode {
  return (
    <section className="card">
      <h2 className="section-title">
        Messages <span className="count">{d.messages.length}</span>
      </h2>
      {d.messages.length === 0 ? (
        <p className="muted">No messages yet.</p>
      ) : (
        <ol className="messages">
          {d.messages.map((m) => (
            <li key={m.id} className={m.mine ? 'message message-mine' : 'message'}>
              <p className="message-meta">
                <strong>{m.author}</strong> · {dateTime(m.at)}
              </p>
              <p className="prewrap">{m.body}</p>
            </li>
          ))}
        </ol>
      )}
      {!editable ? null : d.canMessage ? (
        <Reply requestId={d.request.id} onSent={onSent} />
      ) : (
        <p className="hint">This request is closed for messages.</p>
      )}
    </section>
  );
}
