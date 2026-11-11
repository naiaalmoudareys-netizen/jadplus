/**
 * "Handovers" (O2; ADR 0033), for JAD+ Admin and the partner office of the JAD Global team that hands units over.
 * The checklists in progress and done, and the open handover requests that still have none: "Start checklist"
 * opens it for that request's unit (the unit comes from the request; one checklist per unit). An office sees only
 * the handover requests its company has.
 */
import { handoverStartedResponse, staffHandoversResponse, type StaffHandovers } from '@jadplus/shared';
import type { ReactNode } from 'react';
import { apiPath } from '../lib/api';
import { dateTime } from '../lib/format';
import { appointmentText, handoverProgressText, staffBase, unitText } from '../lib/owner-journey';
import { canChange } from '../lib/session';
import { useAction } from '../ui/actions';
import { navigate, useConsole, useLoad } from '../ui/hooks';
import { Empty, Link, Loaded, Notice, PageHeader, Section, Tag } from '../ui/parts';

function Start({ requestId }: { requestId: string }): ReactNode {
  const { api, session } = useConsole();
  const action = useAction();
  return (
    <span className="file-button">
      <button
        type="button"
        className="btn btn-small"
        disabled={action.busy}
        onClick={() => {
          action.run(async () => {
            const { id } = await api.post(
              apiPath(staffBase(session.role), 'handovers'),
              { requestId },
              handoverStartedResponse,
            );
            navigate({ name: 'handover', id });
          });
        }}
      >
        {action.busy ? 'Starting…' : 'Start checklist'}
      </button>
      {action.error === null ? null : <Notice tone="bad">{action.error}</Notice>}
    </span>
  );
}

function Waiting({
  waiting,
  editable,
}: {
  waiting: StaffHandovers['waiting'];
  editable: boolean;
}): ReactNode {
  return (
    <Section title="Handover requests without a checklist" count={waiting.length}>
      {waiting.length === 0 ? (
        <Empty>Every open handover request has its checklist.</Empty>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th scope="col">Request</th>
              <th scope="col">Unit</th>
              <th scope="col">Team</th>
              <th scope="col">Raised</th>
              {editable ? <th scope="col">Checklist</th> : null}
            </tr>
          </thead>
          <tbody>
            {waiting.map((w) => (
              <tr key={w.requestId}>
                <td>
                  <Link to={{ name: 'request', id: w.requestId }}>{w.requestRef}</Link>
                </td>
                <td>{unitText(w)}</td>
                <td>{w.partnerName ?? 'No team yet'}</td>
                <td>{dateTime(w.createdAt)}</td>
                {editable ? (
                  <td>
                    <Start requestId={w.requestId} />
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Section>
  );
}

export function Handovers(): ReactNode {
  const { api, session } = useConsole();
  const editable = canChange(session.role);
  const { state, reload } = useLoad(
    () => api.get(apiPath(staffBase(session.role), 'handovers'), staffHandoversResponse),
    'handovers',
  );
  return (
    <>
      <PageHeader
        eyebrow={session.role === 'partner_admin' ? 'Partner office' : 'JAD+ Admin'}
        title="Handovers"
      />
      <Loaded state={state} reload={reload}>
        {({ handovers, waiting }) => (
          <>
            <p className="hint">
              A checklist starts from the owner&apos;s handover request. The owner follows every step in the
              app.
            </p>
            <Waiting waiting={waiting} editable={editable} />
            <Section title="Checklists" count={handovers.length}>
              {handovers.length === 0 ? (
                <Empty>No handover checklist yet.</Empty>
              ) : (
                <table className="table">
                  <thead>
                    <tr>
                      <th scope="col">Unit</th>
                      <th scope="col">Request</th>
                      <th scope="col">Progress</th>
                      <th scope="col">Key collection</th>
                      <th scope="col">Team</th>
                    </tr>
                  </thead>
                  <tbody>
                    {handovers.map((h) => (
                      <tr key={h.id}>
                        <td>
                          <Link to={{ name: 'handover', id: h.id }}>{unitText(h)}</Link>
                        </td>
                        <td className="ref">{h.requestRef}</td>
                        <td>
                          <Tag tone={h.completedAt === null ? 'warn' : 'good'}>{handoverProgressText(h)}</Tag>
                        </td>
                        <td>{appointmentText(h)}</td>
                        <td>{h.partnerName ?? 'No team'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Section>
          </>
        )}
      </Loaded>
    </>
  );
}
