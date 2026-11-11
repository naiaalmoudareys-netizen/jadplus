/**
 * "Inspections & reports" (ADR 0032, 0036; O3, S4, L2): the office's own snagging inspections and valuations,
 * grouped by what they wait for: the report (with its deadline), the owner's snags still open after the report,
 * or nothing (reported or finished, kept here for 30 days). Each opens the request, where the visit is booked,
 * snags are listed and the report PDF is uploaded.
 */
import { partnerInspectionsResponse, type InspectionGroup, type PartnerInspection } from '@jadplus/shared';
import type { ReactNode } from 'react';
import { inspectionSections, unitLine } from '../lib/boards';
import { dateTime, deadlineText, STATUS_LABELS } from '../lib/format';
import { REPORT_KIND_LABELS } from '../lib/reports';
import { useConsole, useLoad, useNow } from '../ui/hooks';
import { Empty, Link, Loaded, PageHeader, Section, Tag } from '../ui/parts';

const SERVICE_NAMES: Readonly<Record<PartnerInspection['service'], string>> = {
  snagging: 'Snagging',
  valuation: 'Valuation',
};

const SNAGGING_KINDS: Readonly<Record<NonNullable<PartnerInspection['snaggingType']>, string>> = {
  soft: 'soft (free)',
  professional: 'professional',
};

const EMPTY: Readonly<Record<InspectionGroup, string>> = {
  report_due: 'Inspections waiting for their report appear here, with the report deadline.',
  snags_open: 'Reported inspections with snags the owner still waits on appear here.',
  done: 'Reports delivered in the last 30 days appear here.',
};

function Row({ item, now }: { item: PartnerInspection; now: number }): ReactNode {
  const due = deadlineText(item.nextDueAt, now);
  const kind =
    item.snaggingType === null
      ? SERVICE_NAMES[item.service]
      : `${SERVICE_NAMES[item.service]}, ${SNAGGING_KINDS[item.snaggingType]}`;
  return (
    <tr>
      <td>
        <Link to={{ name: 'request', id: item.id }}>
          <span className="ref">{item.ref}</span>
        </Link>
      </td>
      <td>{kind}</td>
      <td>{unitLine(item)}</td>
      <td>{STATUS_LABELS[item.status]}</td>
      <td>
        {item.reports.length === 0
          ? 'None yet'
          : item.reports.map((r) => `${REPORT_KIND_LABELS[r.kind]} ${dateTime(r.uploadedAt)}`).join('; ')}
        {item.reinspectionRequested ? <span className="block hint">Re-inspection asked for</span> : null}
      </td>
      <td className="num">{item.snagsOpen}</td>
      <td>{due === null ? '—' : <Tag tone={due.startsWith('Overdue') ? 'bad' : 'calm'}>{due}</Tag>}</td>
    </tr>
  );
}

export function Inspections(): ReactNode {
  const { api } = useConsole();
  const now = useNow();
  const { state, reload } = useLoad(
    () => api.get('/api/partner/inspections', partnerInspectionsResponse),
    'inspections',
  );
  return (
    <>
      <PageHeader title="Inspections & reports">
        <button type="button" className="btn btn-outline" onClick={reload}>
          Refresh
        </button>
      </PageHeader>
      <Loaded state={state} reload={reload}>
        {({ inspections }) =>
          inspectionSections(inspections).map((s) => (
            <Section key={s.group} title={s.label} count={s.items.length}>
              {s.items.length === 0 ? (
                <Empty explain={EMPTY[s.group]}>Nothing here.</Empty>
              ) : (
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th scope="col">Request</th>
                        <th scope="col">Inspection</th>
                        <th scope="col">Unit</th>
                        <th scope="col">Status</th>
                        <th scope="col">Reports</th>
                        <th scope="col" className="num">
                          Open snags
                        </th>
                        <th scope="col">Deadline</th>
                      </tr>
                    </thead>
                    <tbody>
                      {s.items.map((i) => (
                        <Row key={i.id} item={i} now={now} />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Section>
          ))
        }
      </Loaded>
    </>
  );
}
