/**
 * The partner office's home (ADR 0025, 0036; E4, S5, S6, S7): the overview of its workspace. Company warnings
 * first (documents expiring or lapsed, close to the S6 review line), then the sections of its work, stacked with
 * the main kind of work first: home services (emergencies on the 15-minute clock, visits, overdue and unassigned
 * jobs, quotes waiting, the month against JAD+'s targets, who is away), handovers, managed units, consultations,
 * inspections and reports, investor education. A section the workspace does not have never shows.
 */
import {
  overviewSections,
  partnerOverviewResponse,
  type OverviewSection,
  type PartnerOverview,
  type VisitsOverview,
} from '@jadplus/shared';
import type { ReactNode } from 'react';
import { dayText, percentText, starsText } from '../lib/format';
import { UNAVAILABLE_LABELS } from '../lib/labels';
import { useConsole, useLoad } from '../ui/hooks';
import { Empty, Figure, Link, Loaded, Notice, PageHeader, Section, Tag } from '../ui/parts';
import { useWorkspace } from '../ui/workspace';
import {
  ConsultationsSection,
  EducationSection,
  HandoverSection,
  ManagedSection,
  ReportsSection,
} from './overview/Sections';

type Month = VisitsOverview['thisMonth'];

function minutesLeftText(minutes: number): string {
  return minutes < 0 ? `Late by ${String(-minutes)} min` : `${String(minutes)} min left to acknowledge`;
}

function MonthTable({ o }: { o: VisitsOverview }): ReactNode {
  const rows: readonly [string, (m: Month) => string, string][] = [
    ['Jobs done', (m) => String(m.jobsDone), '—'],
    ['On time', (m) => percentText(m.onTimePercent), `${String(o.targets.onTimePercent)} % or more`],
    [
      'Average rating',
      (m) => `${starsText(m.averageRating)} (${String(m.ratings)})`,
      `${o.targets.averageRating.toFixed(1)} or more`,
    ],
    ['Repeat visits', (m) => String(m.repeatVisits), `${String(o.targets.repeatVisitPercent)} % or less`],
  ];
  return (
    <Section title="This month">
      <table className="table">
        <thead>
          <tr>
            <th scope="col">Measure</th>
            <th scope="col" className="num">
              {o.thisMonth.month}
            </th>
            <th scope="col" className="num">
              {o.lastMonth.month}
            </th>
            <th scope="col">JAD+ target</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([name, value, target]) => (
            <tr key={name}>
              <td>{name}</td>
              <td className="num">{value(o.thisMonth)}</td>
              <td className="num">{value(o.lastMonth)}</td>
              <td className="muted">{target}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Section>
  );
}

function VisitsSection({ o }: { o: VisitsOverview }): ReactNode {
  const t = o.today;
  return (
    <>
      {t.emergencies.length === 0 ? null : (
        <Section title="Emergencies to acknowledge" count={t.emergencies.length}>
          <ul className="plain">
            {t.emergencies.map((e) => (
              <li key={e.id}>
                <Link to={{ name: 'request', id: e.id }}>
                  <span className="ref">{e.ref}</span>
                </Link>{' '}
                <Tag tone="bad">{minutesLeftText(e.minutesLeft)}</Tag>
              </li>
            ))}
          </ul>
        </Section>
      )}
      <Section title="Today's visits and jobs">
        <div className="figures">
          <Figure label="Visits today" value={String(t.visitsToday)} />
          <Figure label="Overdue" value={String(t.overdue)} note="Past their deadline" />
          <Figure label="No technician yet" value={String(t.unassigned)} note="Assign on Dispatch" />
          <Figure label="Quotes waiting" value={String(t.quotesWaiting)} note="With the owner" />
        </div>
      </Section>
      <div className="columns">
        <MonthTable o={o} />
        <Section title="Away today" count={o.unavailableToday.length}>
          {o.unavailableToday.length === 0 ? (
            <Empty>Everyone is available today.</Empty>
          ) : (
            <ul className="plain">
              {o.unavailableToday.map((u) => (
                <li key={u.technicianId}>
                  <Link to={{ name: 'technician', id: u.technicianId }}>{u.name}</Link>{' '}
                  <span className="muted">
                    {UNAVAILABLE_LABELS[u.reason]} until {dayText(u.until)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </>
  );
}

/** One section of the overview, when the API sent it. */
function SectionOf({ name, o }: { name: OverviewSection; o: PartnerOverview }): ReactNode {
  switch (name) {
    case 'visits':
      return o.visits === null ? null : <VisitsSection o={o.visits} />;
    case 'handover':
      return o.handover === null ? null : <HandoverSection s={o.handover} />;
    case 'managed':
      return o.managed === null ? null : <ManagedSection s={o.managed} />;
    case 'consultations':
      return o.consultations === null ? null : <ConsultationsSection s={o.consultations} />;
    case 'reports':
      return o.reports === null ? null : <ReportsSection s={o.reports} />;
    case 'education':
      return o.education === null ? null : <EducationSection s={o.education} />;
  }
}

export function OfficeOverview(): ReactNode {
  const { api } = useConsole();
  const ws = useWorkspace();
  const { state, reload } = useLoad(
    () => api.get('/api/partner/overview', partnerOverviewResponse),
    'office',
  );
  const sections = ws === null ? [] : overviewSections(ws.workspace);
  return (
    <>
      <PageHeader title="Overview">
        <button type="button" className="btn btn-outline" onClick={reload}>
          Refresh
        </button>
      </PageHeader>
      {ws === null ? null : <p className="page-intro">{ws.workspace.subtitle}</p>}
      <Loaded state={state} reload={reload}>
        {(o) => (
          <>
            {o.alerts.map((a) => (
              <Notice key={`${a.kind}:${a.text}`} tone={a.level === 'flagged' ? 'bad' : 'warn'}>
                {a.text}
              </Notice>
            ))}
            {sections.length === 0 ? (
              <section className="card">
                <Empty explain="Once JAD+ Admin assigns services to your company, the work for them appears here.">
                  No services assigned yet.
                </Empty>
              </section>
            ) : (
              sections.map((name) => <SectionOf key={name} name={name} o={o} />)
            )}
          </>
        )}
      </Loaded>
    </>
  );
}
