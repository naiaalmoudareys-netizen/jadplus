/**
 * JAD+ Admin "Overview" (ADR 0025; R4, E4-E7, S5, ADR 0011): the home page. Live counts (emergencies, open
 * requests by status, visits today, overdue, waiting for owners, desk requests, suspended partners), each
 * leading to the page where it is handled, and this month against last month.
 */
import { adminOverviewResponse, type AdminMonthlyReport } from '@jadplus/shared';
import type { ReactNode } from 'react';
import type { z } from 'zod';
import { monthText, percentText } from '../lib/format';
import { formatRoute, type Route } from '../lib/router';
import { useConsole, useLoad } from '../ui/hooks';
import { Empty, Link, Loaded, PageHeader, Section, StatusTag } from '../ui/parts';

type MonthStats = z.infer<typeof adminOverviewResponse>['thisMonth'];

function Tile({
  label,
  value,
  to,
  alarm = false,
}: {
  label: string;
  value: number;
  to: Route;
  alarm?: boolean;
}): ReactNode {
  return (
    <a href={formatRoute(to)} className={alarm && value > 0 ? 'card tile tile-alarm' : 'card tile'}>
      <span className="label">{label}</span>
      <span className="figure-value">{value}</span>
    </a>
  );
}

function MonthRow({ m, label }: { m: MonthStats; label: string }): ReactNode {
  return (
    <tr>
      <th scope="row">
        {label} <span className="hint">{monthText(m.month)}</span>
      </th>
      <td className="num">{m.raised}</td>
      <td className="num">{m.closed}</td>
      <td className="num">{percentText(m.slaMetPct)}</td>
    </tr>
  );
}

/** The month a report link opens: the same month as the row. */
const reportFor = (m: Pick<AdminMonthlyReport, 'month'>): Route => ({ name: 'reports', month: m.month });

export function Overview(): ReactNode {
  const { api } = useConsole();
  const { state, reload } = useLoad(() => api.get('/api/admin/overview', adminOverviewResponse), 'overview');
  return (
    <>
      <PageHeader eyebrow="JAD+ Admin" title="Overview">
        <button type="button" className="btn btn-outline" onClick={reload}>
          Refresh
        </button>
      </PageHeader>
      <Loaded state={state} reload={reload}>
        {({ live, thisMonth, lastMonth }) => (
          <>
            <div className="tiles">
              <Tile
                label="Emergencies open"
                value={live.activeEmergencies}
                to={{ name: 'attention' }}
                alarm
              />
              <Tile label="Past their deadline" value={live.overdue} to={{ name: 'attention' }} alarm />
              <Tile
                label="Visits today"
                value={live.visitsToday}
                to={{ name: 'requests', q: '', status: 'scheduled' }}
              />
              <Tile
                label="Waiting for owners"
                value={live.waitingForOwners}
                to={{ name: 'requests', q: '', status: 'awaiting_owner' }}
              />
              <Tile
                label="Documents & account requests open"
                value={live.openDeskRequests}
                to={{ name: 'desk', status: null }}
              />
              <Tile
                label="Partners suspended"
                value={live.partnersSuspended}
                to={{ name: 'partners' }}
                alarm
              />
            </div>
            <div className="columns">
              <Section title="Open requests by status">
                {live.openByStatus.length === 0 ? (
                  <Empty>No open requests.</Empty>
                ) : (
                  <table className="table">
                    <tbody>
                      {live.openByStatus.map(({ status, count }) => (
                        <tr key={status}>
                          <td>
                            <Link to={{ name: 'requests', q: '', status }}>
                              <StatusTag status={status} />
                            </Link>
                          </td>
                          <td className="num">{count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </Section>
              <Section title="This month and last month">
                <table className="table">
                  <thead>
                    <tr>
                      <th scope="col">Month</th>
                      <th scope="col" className="num">
                        Raised
                      </th>
                      <th scope="col" className="num">
                        Closed
                      </th>
                      <th scope="col" className="num">
                        On time
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <MonthRow m={thisMonth} label="This month" />
                    <MonthRow m={lastMonth} label="Last month" />
                  </tbody>
                </table>
                <p className="hint">
                  “On time” is the share of service-level targets met (S5: real data only; “—” when none were
                  measured). <Link to={reportFor(lastMonth)}>Last month’s full report</Link>
                </p>
              </Section>
            </div>
          </>
        )}
      </Loaded>
    </>
  );
}
