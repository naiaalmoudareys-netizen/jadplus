/**
 * JAD+ Admin "Reports" (ADR 0025; S5 real data only): one month's requests, emergencies, SLA targets met,
 * ratings and repeat visits, by service, project and partner. No personal data. The same numbers download
 * as CSV for the monthly management pack.
 */
import { adminMonthlyReportResponse, monthOf, type AdminMonthlyReport } from '@jadplus/shared';
import { useState, type SyntheticEvent, type ReactNode } from 'react';
import { withQuery } from '../lib/api';
import { monthText, percentText, shiftMonth, starsText } from '../lib/format';
import { FileButton } from '../ui/actions';
import { navigate, useConsole, useLoad, useNow } from '../ui/hooks';
import { Empty, Figure, Link, Loaded, PageHeader, Section } from '../ui/parts';
import { SortHeader, useSort } from '../ui/table';

type Report = AdminMonthlyReport;
type PartnerRow = Report['byPartner'][number];
type PartnerColumn = 'name' | 'jobs' | 'closed' | 'slaMetPct' | 'averageRating' | 'repeatVisits';
type ServiceRow = Report['byService'][number];
type ServiceColumn = 'name' | 'raised' | 'closed';
type ProjectRow = Report['byProject'][number];
type ProjectColumn = 'project' | 'raised';

function MonthPicker({ month, latest }: { month: string; latest: string }): ReactNode {
  const [value, setValue] = useState(month);
  const go = (m: string): void => {
    navigate({ name: 'reports', month: m });
  };
  const submit = (e: SyntheticEvent): void => {
    e.preventDefault();
    if (/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) go(value);
  };
  return (
    <form className="row-actions month-picker" onSubmit={submit}>
      <button
        type="button"
        className="btn btn-outline"
        onClick={() => {
          go(shiftMonth(month, -1));
        }}
      >
        Previous
      </button>
      <label className="field">
        <span className="label">Month</span>
        <input
          type="month"
          value={value}
          max={latest}
          onChange={(e) => {
            setValue(e.target.value);
          }}
        />
      </label>
      <button type="submit" className="btn btn-outline">
        Show
      </button>
      <button
        type="button"
        className="btn btn-outline"
        disabled={month >= latest}
        onClick={() => {
          go(shiftMonth(month, 1));
        }}
      >
        Next
      </button>
    </form>
  );
}

function Partners({ rows }: { rows: readonly PartnerRow[] }): ReactNode {
  const sorted = useSort<PartnerRow, PartnerColumn>(rows, { key: 'jobs', dir: 'desc' }, (r, k) => r[k]);
  return (
    <table className="table">
      <thead>
        <tr>
          <SortHeader label="Partner" column="name" sorted={sorted} />
          <SortHeader label="Jobs" column="jobs" sorted={sorted} numeric />
          <SortHeader label="Closed" column="closed" sorted={sorted} numeric />
          <SortHeader label="On time" column="slaMetPct" sorted={sorted} numeric />
          <SortHeader label="Rating" column="averageRating" sorted={sorted} numeric />
          <SortHeader label="Repeat visits" column="repeatVisits" sorted={sorted} numeric />
        </tr>
      </thead>
      <tbody>
        {sorted.rows.map((p) => (
          <tr key={p.partnerId}>
            <td>
              <Link to={{ name: 'partner', id: p.partnerId }}>{p.name}</Link>
            </td>
            <td className="num">{p.jobs}</td>
            <td className="num">{p.closed}</td>
            <td className="num">{percentText(p.slaMetPct)}</td>
            <td className="num">{starsText(p.averageRating)}</td>
            <td className="num">{p.repeatVisits}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Services({ rows }: { rows: readonly ServiceRow[] }): ReactNode {
  const sorted = useSort<ServiceRow, ServiceColumn>(rows, { key: 'raised', dir: 'desc' }, (r, k) => r[k]);
  return (
    <table className="table">
      <thead>
        <tr>
          <SortHeader label="Service" column="name" sorted={sorted} />
          <SortHeader label="Raised" column="raised" sorted={sorted} numeric />
          <SortHeader label="Closed" column="closed" sorted={sorted} numeric />
        </tr>
      </thead>
      <tbody>
        {sorted.rows.map((s) => (
          <tr key={s.code}>
            <td>{s.name}</td>
            <td className="num">{s.raised}</td>
            <td className="num">{s.closed}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Projects({ rows }: { rows: readonly ProjectRow[] }): ReactNode {
  const sorted = useSort<ProjectRow, ProjectColumn>(rows, { key: 'raised', dir: 'desc' }, (r, k) => r[k]);
  return (
    <table className="table">
      <thead>
        <tr>
          <SortHeader label="Project" column="project" sorted={sorted} />
          <SortHeader label="Raised" column="raised" sorted={sorted} numeric />
        </tr>
      </thead>
      <tbody>
        {sorted.rows.map((p) => (
          <tr key={p.project}>
            <td>{p.project}</td>
            <td className="num">{p.raised}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ReportView({ r }: { r: Report }): ReactNode {
  const t = r.totals;
  return (
    <>
      <div className="figures">
        <Figure label="Requests raised" value={String(t.raised)} note={`${t.emergencies} emergencies`} />
        <Figure label="Closed" value={String(t.closed)} />
        <Figure label="On time" value={percentText(t.slaMetPct)} note="SLA targets met" />
        <Figure
          label="Rating"
          value={starsText(t.averageRating)}
          note={t.ratings === 1 ? 'From 1 rating' : `From ${t.ratings} ratings`}
        />
        <Figure label="Repeat visits" value={String(t.repeatVisits)} note="Return visits after “not done”" />
      </div>
      <Section title="By partner" count={r.byPartner.length}>
        {r.byPartner.length === 0 ? (
          <Empty>No partner jobs this month.</Empty>
        ) : (
          <Partners rows={r.byPartner} />
        )}
      </Section>
      <div className="columns">
        <Section title="By service" count={r.byService.length}>
          {r.byService.length === 0 ? (
            <Empty>No requests this month.</Empty>
          ) : (
            <Services rows={r.byService} />
          )}
        </Section>
        <Section title="By project" count={r.byProject.length}>
          {r.byProject.length === 0 ? (
            <Empty>No requests this month.</Empty>
          ) : (
            <Projects rows={r.byProject} />
          )}
        </Section>
      </div>
    </>
  );
}

export function Reports({ month }: { month: string | null }): ReactNode {
  const { api } = useConsole();
  const now = useNow();
  const latest = monthOf(now);
  const shown = month ?? latest;
  const { state, reload } = useLoad(
    () => api.get(withQuery('/api/admin/reports/monthly', { month: shown }), adminMonthlyReportResponse),
    shown,
  );
  return (
    <>
      <PageHeader eyebrow="JAD+ Admin · Reports" title={monthText(shown)}>
        <FileButton
          path={withQuery('/api/admin/reports/monthly.csv', { month: shown })}
          label="Download CSV"
          saveAs={`jadplus-report-${shown}.csv`}
        />
      </PageHeader>
      <div className="card">
        <MonthPicker key={shown} month={shown} latest={latest} />
      </div>
      <Loaded state={state} reload={reload}>
        {(r) => <ReportView r={r} />}
      </Loaded>
    </>
  );
}
