/**
 * One JAD+ desk request (ADR 0011, 0025): who asked, for which deal and unit, what they wrote, and the reply.
 * JAD+ Admin moves it on (In progress, Completed, Cancelled; Completed and Cancelled are final) and may write
 * a reply the owner sees in the app. Viewing it is recorded in the audit log (personal data).
 */
import {
  adminDeskDetailResponse,
  adminDeskUpdateBody,
  adminDeskUpdateResponse,
  deskChangeAllowed,
  type DeskStatus,
} from '@jadplus/shared';
import { useState, type SyntheticEvent, type ReactNode } from 'react';
import { apiPath } from '../lib/api';
import { dateTime } from '../lib/format';
import { DESK_TONES } from '../lib/labels';
import { canChange } from '../lib/session';
import { useAction } from '../ui/actions';
import { useConsole, useLoad } from '../ui/hooks';
import { Fact, Link, Loaded, Notice, PageHeader, Section, Tag } from '../ui/parts';

const TARGETS = ['In progress', 'Completed', 'Cancelled'] as const;

function Update({ id, from, onSaved }: { id: string; from: DeskStatus; onSaved: () => void }): ReactNode {
  const { api } = useConsole();
  const choices = TARGETS.filter((t) => deskChangeAllowed(from, t));
  const [status, setStatus] = useState<(typeof TARGETS)[number] | ''>('');
  const [reply, setReply] = useState('');
  const action = useAction();
  const save = (e: SyntheticEvent): void => {
    e.preventDefault();
    const body = adminDeskUpdateBody.safeParse(reply.trim() === '' ? { status } : { status, reply });
    if (!body.success) return;
    action.run(async () => {
      await api.post(apiPath('admin', 'desk-requests', id), body.data, adminDeskUpdateResponse);
      setReply('');
      setStatus('');
      onSaved();
    });
  };
  if (choices.length === 0) return <p className="hint">This request is closed; it cannot change any more.</p>;
  return (
    <form className="stack" onSubmit={save}>
      <label className="field">
        <span className="label">Move to</span>
        <select
          value={status}
          onChange={(e) => {
            setStatus(choices.find((c) => c === e.target.value) ?? '');
          }}
        >
          <option value="">Choose…</option>
          {choices.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span className="label">Reply to the owner (optional; they see it in the app)</span>
        <textarea
          value={reply}
          rows={3}
          maxLength={1000}
          onChange={(e) => {
            setReply(e.target.value);
          }}
        />
      </label>
      {status === 'Completed' || status === 'Cancelled' ? (
        <p className="hint">This is final: the request cannot be moved again afterwards.</p>
      ) : null}
      {action.error === null ? null : <Notice tone="bad">{action.error}</Notice>}
      <div>
        <button type="submit" className="btn" disabled={action.busy || status === ''}>
          {action.busy ? 'Saving…' : 'Save'}
        </button>
      </div>
    </form>
  );
}

export function DeskItem({ id }: { id: string }): ReactNode {
  const { api, session } = useConsole();
  const [done, setDone] = useState(false);
  const { state, reload } = useLoad(
    () => api.get(apiPath('admin', 'desk-requests', id), adminDeskDetailResponse),
    id,
  );
  return (
    <Loaded state={state} reload={reload}>
      {(d) => (
        <>
          <PageHeader eyebrow="Desk request" title={d.type}>
            <Tag tone={DESK_TONES[d.status]}>{d.status}</Tag>
          </PageHeader>
          {done ? <Notice tone="good">Saved.</Notice> : null}
          {d.inSalesforce ? (
            <Notice tone="calm">This request is worked in Salesforce; change it there.</Notice>
          ) : null}
          <section className="card">
            <dl className="facts">
              <Fact label="Owner">
                <Link to={{ name: 'person', id: d.userId }}>{d.ownerName ?? 'No name on file'}</Link>
              </Fact>
              <Fact label="Email">{d.ownerEmail ?? '—'}</Fact>
              <Fact label="Mobile">{d.ownerPhone ?? '—'}</Fact>
              <Fact label="Unit">{d.unitName ?? '—'}</Fact>
              <Fact label="Deal">{d.dealId ?? '—'}</Fact>
              <Fact label="Asked">{dateTime(d.createdAt)}</Fact>
              <Fact label="Last change">{d.updatedAt === null ? '—' : dateTime(d.updatedAt)}</Fact>
            </dl>
            <h2 className="section-title">What the owner wrote</h2>
            <p className="prewrap">{d.details ?? 'Nothing written.'}</p>
            {d.reply === null ? null : (
              <>
                <h2 className="section-title">JAD+ reply</h2>
                <p className="prewrap">{d.reply}</p>
              </>
            )}
            <p className="hint">Viewing this request is recorded in the audit log.</p>
          </section>
          {canChange(session.role) && !d.inSalesforce ? (
            <Section title="Update">
              <Update
                id={id}
                from={d.status}
                onSaved={() => {
                  setDone(true);
                  reload();
                }}
              />
            </Section>
          ) : null}
        </>
      )}
    </Loaded>
  );
}
