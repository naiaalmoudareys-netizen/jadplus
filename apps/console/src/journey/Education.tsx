/**
 * "Education" (O5, S4; ADR 0033), for JAD+ Admin and the partner office of the education team: the sessions with
 * seats booked and attended, "New session", and owners' requests for the investor book (requested → sent).
 * Opening the book requests shows owners' names, so the API audits it. A full session shows "Full" to owners;
 * there is no waiting list.
 */
import {
  educationChangedResponse,
  staffBookRequestsResponse,
  staffSessionsResponse,
  type StaffBookRequests,
} from '@jadplus/shared';
import { useState, type ReactNode } from 'react';
import { apiPath } from '../lib/api';
import { dateTime } from '../lib/format';
import { EMPTY_SESSION_FORM, MODE_LABELS, seatsText, sessionWhenText, staffBase } from '../lib/owner-journey';
import { useAction } from '../ui/actions';
import { navigate, useConsole, useLoad } from '../ui/hooks';
import { Empty, Link, Loaded, Notice, PageHeader, Section, Tag } from '../ui/parts';
import { SessionFormView } from './SessionForm';

function MarkSent({ id, onDone }: { id: string; onDone: () => void }): ReactNode {
  const { api, session } = useConsole();
  const action = useAction();
  return (
    <span className="file-button">
      <button
        type="button"
        className="btn btn-outline btn-small"
        disabled={action.busy}
        onClick={() => {
          action.run(async () => {
            await api.post(
              apiPath(staffBase(session.role), 'education', 'books', id, 'sent'),
              {},
              educationChangedResponse,
            );
            onDone();
          });
        }}
      >
        {action.busy ? 'Saving…' : 'Mark sent'}
      </button>
      {action.error === null ? null : <Notice tone="bad">{action.error}</Notice>}
    </span>
  );
}

function Books({ canManage }: { canManage: boolean }): ReactNode {
  const { api, session } = useConsole();
  const [open, setOpen] = useState(false);
  const { state, reload } = useLoad(
    (): Promise<StaffBookRequests> =>
      open
        ? api.get(apiPath(staffBase(session.role), 'education', 'books'), staffBookRequestsResponse)
        : Promise.resolve({ requests: [] }),
    `books:${String(open)}`,
  );
  return (
    <Section
      title="Book requests"
      actions={
        open ? null : (
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => {
              setOpen(true);
            }}
          >
            Show requests
          </button>
        )
      }
    >
      <p className="hint">
        Owners who tapped &quot;Send me the book&quot;. Showing the list (owners&apos; names) is recorded.
      </p>
      {open ? (
        <Loaded state={state} reload={reload}>
          {({ requests }) =>
            requests.length === 0 ? (
              <Empty>No owner has asked for the book yet.</Empty>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th scope="col">Owner</th>
                    <th scope="col">Requested</th>
                    <th scope="col">State</th>
                    {canManage ? <th scope="col">Change</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {requests.map((q) => (
                    <tr key={q.id}>
                      <td>{q.owner.name ?? 'Name not on file'}</td>
                      <td>{dateTime(q.requestedAt)}</td>
                      <td>
                        {q.status === 'sent' && q.sentAt !== null ? (
                          <Tag tone="good">Sent {dateTime(q.sentAt)}</Tag>
                        ) : (
                          <Tag tone="warn">To send</Tag>
                        )}
                      </td>
                      {canManage ? (
                        <td>{q.status === 'requested' ? <MarkSent id={q.id} onDone={reload} /> : null}</td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          }
        </Loaded>
      ) : null}
    </Section>
  );
}

export function Education(): ReactNode {
  const { api, session } = useConsole();
  const [adding, setAdding] = useState(false);
  const base = staffBase(session.role);
  const { state, reload } = useLoad(
    () => api.get(apiPath(base, 'education', 'sessions'), staffSessionsResponse),
    'education',
  );
  return (
    <>
      <PageHeader title="Investor education" />
      <Loaded state={state} reload={reload}>
        {({ canManage, sessions }) =>
          session.role === 'partner_admin' && !canManage ? (
            <Empty>Investor education is run by the JAD Global team assigned to it.</Empty>
          ) : (
            <>
              <Section
                title="Sessions"
                count={sessions.length}
                actions={
                  canManage && !adding ? (
                    <button
                      type="button"
                      className="btn"
                      onClick={() => {
                        setAdding(true);
                      }}
                    >
                      New session
                    </button>
                  ) : null
                }
              >
                <p className="hint">
                  Owners always see the next date (or &quot;Next date to be announced&quot;) and reserve one
                  seat each.
                </p>
                {adding ? (
                  <SessionFormView
                    initial={EMPTY_SESSION_FORM}
                    submitLabel="Schedule session"
                    onCancel={() => {
                      setAdding(false);
                    }}
                    onSubmit={async (body) => {
                      const { id } = await api.post(
                        apiPath(base, 'education', 'sessions'),
                        body,
                        educationChangedResponse,
                      );
                      navigate({ name: 'education_session', id });
                    }}
                  />
                ) : null}
                {sessions.length === 0 ? (
                  <Empty>No session scheduled. Owners see &quot;Next date to be announced&quot;.</Empty>
                ) : (
                  <table className="table">
                    <thead>
                      <tr>
                        <th scope="col">Session</th>
                        <th scope="col">When</th>
                        <th scope="col">Where</th>
                        <th scope="col">Seats</th>
                        <th scope="col">Attended</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sessions.map((s) => (
                        <tr key={s.id}>
                          <td>
                            <Link to={{ name: 'education_session', id: s.id }}>{s.title}</Link>
                            {s.cancelledAt === null ? null : (
                              <span className="block">
                                <Tag tone="bad">Cancelled</Tag>
                              </span>
                            )}
                          </td>
                          <td>{sessionWhenText(s)}</td>
                          <td>{MODE_LABELS[s.mode]}</td>
                          <td>{seatsText(s)}</td>
                          <td>{String(s.attended)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </Section>
              <Books canManage={canManage} />
            </>
          )
        }
      </Loaded>
    </>
  );
}
