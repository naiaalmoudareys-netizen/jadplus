/**
 * The workspace sections of the office overview (ADR 0036) besides home services (Overview.tsx): handovers,
 * managed units, consultations, inspections and reports, investor education. Each shows only this company's
 * work and links to the page where it is done.
 */
import type { PartnerOverview } from '@jadplus/shared';
import type { ReactNode } from 'react';
import { unitLine } from '../../lib/boards';
import { dateTime, monthText, preferredText } from '../../lib/format';
import type { Route } from '../../lib/router';
import { Empty, Figure, Link, Section } from '../../ui/parts';

type Of<K extends keyof PartnerOverview> = NonNullable<PartnerOverview[K]>;

function Open({ to, children }: { to: Route; children: string }): ReactNode {
  return (
    <Link to={to}>
      <span className="open-link">{children}</span>
    </Link>
  );
}

export function HandoverSection({ s }: { s: Of<'handover'> }): ReactNode {
  return (
    <Section title="Handovers" actions={<Open to={{ name: 'handovers' }}>Open handovers</Open>}>
      <div className="figures">
        <Figure label="In progress" value={String(s.inProgress)} note="Checklists not finished" />
        <Figure
          label="Waiting to start"
          value={String(s.waitingToStart)}
          note="Requests without a checklist"
        />
        <Figure label="Snags open" value={String(s.snagsOpen)} note="For the handover team to fix" />
        <Figure label="Reopened" value={String(s.snagsReopened)} note="The owner said not fixed" />
      </div>
      <h3 className="label subhead">Key collections this week</h3>
      {s.keyCollectionsThisWeek.length === 0 ? (
        <Empty explain="Key collections booked for the next 7 days appear here.">
          None booked this week.
        </Empty>
      ) : (
        <ul className="plain">
          {s.keyCollectionsThisWeek.map((k) => (
            <li key={k.id}>
              <Link to={{ name: 'handover', id: k.id }}>{unitLine(k)}</Link>{' '}
              <span className="muted">{preferredText({ date: k.date, slot: k.slot })}</span>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

export function ManagedSection({ s }: { s: Of<'managed'> }): ReactNode {
  return (
    <Section title="Managed units" actions={<Open to={{ name: 'managed_units' }}>Open managed units</Open>}>
      <div className="figures">
        <Figure label="Units managed" value={String(s.units)} />
        <Figure
          label="Tenant repairs to approve"
          value={String(s.approvalsWaiting)}
          note="Your decision (A1)"
        />
        <Figure
          label="Statements due"
          value={String(s.statementsDue.length)}
          note={`For ${monthText(s.statementMonth)}`}
        />
      </div>
      {s.statementsDue.length === 0 ? null : (
        <>
          <h3 className="label subhead">Statement for {monthText(s.statementMonth)} still to upload</h3>
          <ul className="plain">
            {s.statementsDue.map((u) => (
              <li key={u.id}>
                <Link to={{ name: 'managed_unit', id: u.id }}>{unitLine(u)}</Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </Section>
  );
}

export function ConsultationsSection({ s }: { s: Of<'consultations'> }): ReactNode {
  return (
    <Section title="Consultations" actions={<Open to={{ name: 'consultations' }}>Open consultations</Open>}>
      <div className="figures">
        <Figure label="First calls due today" value={String(s.firstCallsDueToday)} />
        <Figure
          label="First calls overdue"
          value={String(s.firstCallsOverdue)}
          note="Past the 1-working-day target"
        />
      </div>
      {s.byService.length === 0 ? (
        <Empty explain="Open consultations appear here by service and stage.">No open consultations.</Empty>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th scope="col">Service</th>
              <th scope="col">By stage</th>
            </tr>
          </thead>
          <tbody>
            {s.byService.map((svc) => (
              <tr key={svc.serviceCode}>
                <td>{svc.serviceName}</td>
                <td>
                  {svc.columns
                    .filter((c) => c.count > 0)
                    .map((c) => `${c.label} ${String(c.count)}`)
                    .join(' · ')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Section>
  );
}

export function ReportsSection({ s }: { s: Of<'reports'> }): ReactNode {
  return (
    <Section
      title="Inspections & reports"
      actions={<Open to={{ name: 'inspections' }}>Open inspections</Open>}
    >
      <div className="figures">
        <Figure label="Reports due" value={String(s.due)} />
        <Figure label="Overdue" value={String(s.overdue)} note="Past the report deadline" />
        <Figure label="Uploaded this month" value={String(s.uploadedThisMonth)} />
        <Figure label="Snags open" value={String(s.snagsOpen)} note="On your inspections" />
      </div>
    </Section>
  );
}

export function EducationSection({ s }: { s: Of<'education'> }): ReactNode {
  const next = s.nextSession;
  return (
    <Section title="Investor education" actions={<Open to={{ name: 'education' }}>Open education</Open>}>
      <div className="figures">
        <Figure
          label="Next session"
          value={next === null ? '—' : dateTime(next.startsAt)}
          note={next === null ? 'None scheduled' : next.title}
        />
        <Figure
          label="Seats taken"
          value={next === null ? '—' : `${String(next.booked)} / ${String(next.seats)}`}
          note={
            next === null ? 'No session scheduled' : `${String(next.seats - next.booked)} still available`
          }
        />
        <Figure label="Books to send" value={String(s.booksToSend)} note="Owners waiting for the book" />
      </div>
    </Section>
  );
}
