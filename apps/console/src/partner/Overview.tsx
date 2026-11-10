/**
 * The partner office's home (ADR 0025; E4, S5, S6, S7): what needs the office today (emergencies on the
 * 15-minute clock, visits, overdue and unassigned jobs, quotes waiting), this month against last month and
 * JAD+'s targets, warnings before JAD+ would flag the company, and who is away today.
 */
import { partnerOverviewResponse, type PartnerOverview } from '@jadplus/shared';
import type { ReactNode } from 'react';
import { dayText, percentText, starsText } from '../lib/format';
import { UNAVAILABLE_LABELS } from '../lib/labels';
import { useConsole, useLoad } from '../ui/hooks';
import { Empty, Figure, Link, Loaded, Notice, PageHeader, Section, Tag } from '../ui/parts';

type Month = PartnerOverview['thisMonth'];

function minutesLeftText(minutes: number): string {
  return minutes < 0 ? `Late by ${String(-minutes)} min` : `${String(minutes)} min left to acknowledge`;
}

function Today({ o }: { o: PartnerOverview }): ReactNode {
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
      <div className="figures">
        <Figure label="Visits today" value={String(t.visitsToday)} />
        <Figure label="Overdue" value={String(t.overdue)} note="Past their deadline" />
        <Figure label="No technician yet" value={String(t.unassigned)} note="Assign on Dispatch" />
        <Figure label="Quotes waiting" value={String(t.quotesWaiting)} note="With the owner" />
      </div>
    </>
  );
}

function MonthTable({ o }: { o: PartnerOverview }): ReactNode {
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

export function OfficeOverview(): ReactNode {
  const { api } = useConsole();
  const { state, reload } = useLoad(
    () => api.get('/api/partner/overview', partnerOverviewResponse),
    'office',
  );
  return (
    <>
      <PageHeader eyebrow="Partner office" title="Overview">
        <button type="button" className="btn btn-outline" onClick={reload}>
          Refresh
        </button>
      </PageHeader>
      <Loaded state={state} reload={reload}>
        {(o) => (
          <>
            {o.alerts.map((a) => (
              <Notice key={`${a.kind}:${a.text}`} tone={a.level === 'flagged' ? 'bad' : 'warn'}>
                {a.text}
              </Notice>
            ))}
            <Today o={o} />
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
        )}
      </Loaded>
    </>
  );
}
