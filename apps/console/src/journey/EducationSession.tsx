/**
 * One investor education session (O5; ADR 0033): its details, "Change" and "Cancel session" before it starts, who
 * booked (owners' names: the API audits the read), "Attended" once it has started, and the bookings as CSV.
 */
import {
  attendanceBody,
  educationChangedResponse,
  staffBookingsResponse,
  staffSessionsResponse,
  type StaffBookings,
  type StaffSession,
} from '@jadplus/shared';
import { useState, type ReactNode } from 'react';
import { apiPath } from '../lib/api';
import { dateTime } from '../lib/format';
import {
  MODE_LABELS,
  bookingsCsv,
  formOf,
  seatsText,
  sessionWhenText,
  staffBase,
} from '../lib/owner-journey';
import { ConfirmButton, saveBlob, useAction } from '../ui/actions';
import { useConsole, useLoad, useNow } from '../ui/hooks';
import { Empty, Fact, Loaded, Notice, PageHeader, Section, Tag } from '../ui/parts';
import { SessionFormView } from './SessionForm';

function Attendance({
  booking,
  onDone,
}: {
  booking: StaffBookings['bookings'][number];
  onDone: () => void;
}): ReactNode {
  const { api, session } = useConsole();
  const action = useAction();
  const attended = booking.attendedAt !== null;
  return (
    <span className="file-button">
      <button
        type="button"
        className="btn btn-outline btn-small"
        disabled={action.busy}
        onClick={() => {
          action.run(async () => {
            await api.post(
              apiPath(staffBase(session.role), 'education', 'bookings', booking.id, 'attendance'),
              attendanceBody.parse({ attended: !attended }),
              educationChangedResponse,
            );
            onDone();
          });
        }}
      >
        {action.busy ? 'Saving…' : attended ? 'Mark not attended' : 'Mark attended'}
      </button>
      {action.error === null ? null : <Notice tone="bad">{action.error}</Notice>}
    </span>
  );
}

function Bookings({
  s,
  canManage,
  started,
}: {
  s: StaffSession;
  canManage: boolean;
  started: boolean;
}): ReactNode {
  const { api, session } = useConsole();
  const { state, reload } = useLoad(
    () =>
      api.get(
        apiPath(staffBase(session.role), 'education', 'sessions', s.id, 'bookings'),
        staffBookingsResponse,
      ),
    `bookings:${s.id}`,
  );
  return (
    <Loaded state={state} reload={reload}>
      {({ bookings }) => (
        <Section
          title="Bookings"
          count={bookings.filter((b) => b.cancelledAt === null).length}
          actions={
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => {
                saveBlob(
                  new Blob([bookingsCsv(s, bookings)], { type: 'text/csv' }),
                  `jadplus-education-${s.id}.csv`,
                );
              }}
            >
              Export CSV
            </button>
          }
        >
          {bookings.length === 0 ? (
            <Empty>No owner has booked yet.</Empty>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Owner</th>
                  <th scope="col">Booked</th>
                  <th scope="col">State</th>
                  {canManage && started ? <th scope="col">Attendance</th> : null}
                </tr>
              </thead>
              <tbody>
                {bookings.map((b) => (
                  <tr key={b.id}>
                    <td>{b.owner.name ?? 'Name not on file'}</td>
                    <td>{dateTime(b.bookedAt)}</td>
                    <td>
                      {b.cancelledAt !== null ? (
                        <Tag tone="calm">Seat given back {dateTime(b.cancelledAt)}</Tag>
                      ) : b.attendedAt !== null ? (
                        <Tag tone="good">Attended</Tag>
                      ) : (
                        <Tag tone="warn">Seat held</Tag>
                      )}
                    </td>
                    {canManage && started ? (
                      <td>{b.cancelledAt === null ? <Attendance booking={b} onDone={reload} /> : null}</td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>
      )}
    </Loaded>
  );
}

export function EducationSession({ id }: { id: string }): ReactNode {
  const { api, session } = useConsole();
  const now = useNow();
  const base = staffBase(session.role);
  const [editing, setEditing] = useState(false);
  const { state, reload } = useLoad(
    () => api.get(apiPath(base, 'education', 'sessions'), staffSessionsResponse),
    `session:${id}`,
  );
  return (
    <Loaded state={state} reload={reload}>
      {({ canManage, sessions }) => {
        const s = sessions.find((x) => x.id === id);
        if (s === undefined) return <Empty>This session is not in the list.</Empty>;
        const started = now >= s.startsAt;
        const changeable = canManage && !started && s.cancelledAt === null;
        return (
          <>
            <PageHeader
              eyebrow="Investor education"
              title={s.title}
              tags={s.cancelledAt === null ? null : <Tag tone="bad">Cancelled {dateTime(s.cancelledAt)}</Tag>}
            />
            <section className="card">
              {editing ? (
                <SessionFormView
                  initial={formOf(s)}
                  submitLabel="Save changes"
                  onCancel={() => {
                    setEditing(false);
                  }}
                  onSubmit={async (body) => {
                    await api.put(apiPath(base, 'education', 'sessions', id), body, educationChangedResponse);
                    setEditing(false);
                    reload();
                  }}
                />
              ) : (
                <>
                  <dl className="facts">
                    <Fact label="When">{sessionWhenText(s)}</Fact>
                    <Fact label="Where">
                      {MODE_LABELS[s.mode]} · {s.place}
                    </Fact>
                    <Fact label="Seats">{seatsText(s)}</Fact>
                    <Fact label="Attended">{String(s.attended)}</Fact>
                  </dl>
                  <p>{s.description}</p>
                  {changeable ? (
                    <div className="row-actions">
                      <button
                        type="button"
                        className="btn btn-outline"
                        onClick={() => {
                          setEditing(true);
                        }}
                      >
                        Change
                      </button>
                      <ConfirmButton
                        label="Cancel session"
                        question="Owners holding a seat will see that the session was cancelled. This cannot be undone."
                        confirmLabel="Cancel the session"
                        onConfirm={async () => {
                          await api.post(
                            apiPath(base, 'education', 'sessions', id, 'cancel'),
                            {},
                            educationChangedResponse,
                          );
                          reload();
                        }}
                      />
                    </div>
                  ) : null}
                </>
              )}
            </section>
            <Bookings s={s} canManage={canManage} started={started} />
          </>
        );
      }}
    </Loaded>
  );
}
