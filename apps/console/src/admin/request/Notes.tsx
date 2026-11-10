/**
 * Internal notes on a request (ADR 0025; A1): seen by JAD+ staff only, never by the resident or the partner.
 * "I called the owner" records the A1 call to an owner whose tenant's request has waited 48 hours. Moves,
 * reclassifications and cancellations add their reason here too. A viewer only reads.
 */
import { adminNoteBody, adminNotesResponse } from '@jadplus/shared';
import { useState, type SyntheticEvent, type ReactNode } from 'react';
import { apiPath } from '../../lib/api';
import { dateTime } from '../../lib/format';
import { NOTE_KIND_LABELS, label } from '../../lib/labels';
import { createdIdResponse } from '../../lib/schemas';
import { useAction } from '../../ui/actions';
import { useConsole, useLoad } from '../../ui/hooks';
import { Empty, Loaded, Notice, Section, Tag } from '../../ui/parts';

function AddNote({ id, onAdded }: { id: string; onAdded: () => void }): ReactNode {
  const { api } = useConsole();
  const [text, setText] = useState('');
  const [ownerCalled, setOwnerCalled] = useState(false);
  const action = useAction();
  const save = (e: SyntheticEvent): void => {
    e.preventDefault();
    const body = adminNoteBody.safeParse({ text, ownerCalled });
    if (!body.success) return;
    action.run(async () => {
      await api.post(apiPath('admin', 'requests', id, 'notes'), body.data, createdIdResponse);
      setText('');
      setOwnerCalled(false);
      onAdded();
    });
  };
  return (
    <form className="stack reply" onSubmit={save}>
      <label className="field">
        <span className="label">New note (JAD+ staff only)</span>
        <textarea
          value={text}
          rows={2}
          maxLength={2000}
          onChange={(e) => {
            setText(e.target.value);
          }}
        />
      </label>
      <label className="check">
        <input
          type="checkbox"
          checked={ownerCalled}
          onChange={(e) => {
            setOwnerCalled(e.target.checked);
          }}
        />
        <span>I called the owner about this request (A1)</span>
      </label>
      {action.error === null ? null : <Notice tone="bad">{action.error}</Notice>}
      <div>
        <button type="submit" className="btn" disabled={action.busy || text.trim() === ''}>
          {action.busy ? 'Saving…' : 'Add note'}
        </button>
      </div>
    </form>
  );
}

export function Notes({ id, round, editable }: { id: string; round: number; editable: boolean }): ReactNode {
  const { api } = useConsole();
  const { state, reload } = useLoad(
    () => api.get(apiPath('admin', 'requests', id, 'notes'), adminNotesResponse),
    `${id}:${String(round)}`,
  );
  return (
    <Section title="Internal notes">
      <Loaded state={state} reload={reload}>
        {({ notes }) =>
          notes.length === 0 ? (
            <Empty>No notes yet.</Empty>
          ) : (
            <ol className="messages">
              {notes.map((n) => (
                <li key={n.id} className="message">
                  <p className="message-meta">
                    <strong>{n.authorName ?? 'JAD+ staff'}</strong> · {dateTime(n.at)}{' '}
                    {n.kind === 'note' ? null : (
                      <Tag tone={n.kind === 'owner_called' ? 'good' : 'calm'}>
                        {label(NOTE_KIND_LABELS, n.kind)}
                      </Tag>
                    )}
                  </p>
                  <p className="prewrap">{n.text}</p>
                </li>
              ))}
            </ol>
          )
        }
      </Loaded>
      {editable ? <AddNote id={id} onAdded={reload} /> : null}
    </Section>
  );
}
