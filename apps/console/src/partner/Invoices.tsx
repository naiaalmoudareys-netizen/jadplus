/**
 * The partner office's invoices (ADR 0026): JAD+ records them; the owner pays the partner directly, never JAD
 * Global, and JAD+ takes no commission. The page shows what is outstanding, overdue and paid this month; the
 * invoices where the owner said "I have paid" and the office has to confirm; finished jobs ready to invoice
 * (confirmed or closed after 72 h, A4, with an approved quote or make-safe amount); and every invoice, with
 * its age while unpaid. Partner office admins only (technicians never see invoices).
 */
import {
  INVOICE_STATUSES,
  ageDays,
  invoiceReadyResponse,
  partnerInvoicesResponse,
  type InvoiceStatus,
  type PartnerInvoice,
} from '@jadplus/shared';
import { Fragment, useState, type ReactNode } from 'react';
import type { z } from 'zod';
import { withQuery } from '../lib/api';
import { today } from '../lib/dates';
import { dayText, fils, monthText } from '../lib/format';
import { INVOICE_STATUS_LABELS, awaitingConfirmation, invoiceStatusText } from '../lib/invoices';
import { useConsole, useLoad, useNow } from '../ui/hooks';
import { Empty, Figure, Link, Loaded, Notice, PageHeader, Section, Tag } from '../ui/parts';
import { SortHeader, useSort } from '../ui/table';
import { InvoiceSteps } from './invoice/InvoiceSteps';
import { IssueForm, type LastDetails, type ReadyJob } from './invoice/IssueForm';

type Totals = z.infer<typeof partnerInvoicesResponse>['totals'];
type Filter = InvoiceStatus | 'overdue' | '';
type Column = 'number' | 'ref' | 'issued' | 'due' | 'total' | 'status' | 'age';

function unpaidAge(i: PartnerInvoice, day: string): number | null {
  return i.status === 'issued' || i.status === 'claimed_paid' ? ageDays(i.issueDate, day) : null;
}

function InvoiceTable({
  invoices,
  now,
  onDone,
}: {
  invoices: readonly PartnerInvoice[];
  now: number;
  onDone: (message: string) => void;
}): ReactNode {
  const day = today(now);
  const [open, setOpen] = useState<string | null>(null);
  const sorted = useSort<PartnerInvoice, Column>(invoices, { key: 'issued', dir: 'desc' }, (i, k) => {
    switch (k) {
      case 'number':
        return i.number;
      case 'ref':
        return i.ref;
      case 'issued':
        return i.issueDate;
      case 'due':
        return i.dueDate;
      case 'total':
        return i.totalFils;
      case 'status':
        return invoiceStatusText(i)[0];
      case 'age':
        return unpaidAge(i, day);
    }
  });
  return (
    <table className="table">
      <thead>
        <tr>
          <SortHeader label="Invoice" column="number" sorted={sorted} />
          <SortHeader label="Job" column="ref" sorted={sorted} />
          <SortHeader label="Issued" column="issued" sorted={sorted} />
          <SortHeader label="Due" column="due" sorted={sorted} />
          <SortHeader label="Total" column="total" sorted={sorted} numeric />
          <SortHeader label="Status" column="status" sorted={sorted} />
          <SortHeader label="Days unpaid" column="age" sorted={sorted} numeric />
          <th scope="col">
            <span className="sr-only">Details</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {sorted.rows.map((i) => {
          const [text, tone] = invoiceStatusText(i);
          const age = unpaidAge(i, day);
          const isOpen = open === i.id;
          return (
            <Fragment key={i.id}>
              <tr className={i.status === 'claimed_paid' ? 'row-attention' : undefined}>
                <td>{i.number}</td>
                <td>
                  <Link to={{ name: 'request', id: i.requestId }}>
                    <span className="ref">{i.ref}</span>
                  </Link>
                </td>
                <td>{dayText(i.issueDate)}</td>
                <td className={i.overdue ? 'late' : undefined}>{dayText(i.dueDate)}</td>
                <td className="num">{fils(i.totalFils)}</td>
                <td>
                  <Tag tone={tone}>{text}</Tag>
                </td>
                <td className={i.overdue ? 'num late' : 'num'}>{age ?? '—'}</td>
                <td>
                  <button
                    type="button"
                    className="btn btn-outline btn-small"
                    aria-expanded={isOpen}
                    onClick={() => {
                      setOpen(isOpen ? null : i.id);
                    }}
                  >
                    {isOpen ? 'Close' : i.actions.length > 0 ? 'Open' : 'Details'}
                  </button>
                </td>
              </tr>
              {isOpen ? (
                <tr>
                  <td colSpan={8}>
                    <InvoiceSteps
                      invoice={i}
                      now={now}
                      onDone={(message) => {
                        setOpen(null);
                        onDone(message);
                      }}
                    />
                  </td>
                </tr>
              ) : null}
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );
}

function ReadyJobs({
  jobs,
  onIssue,
}: {
  jobs: readonly ReadyJob[];
  onIssue: (job: ReadyJob) => void;
}): ReactNode {
  return (
    <Section title="Ready to invoice" count={jobs.length}>
      {jobs.length === 0 ? (
        <Empty>No finished jobs waiting for an invoice.</Empty>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th scope="col">Job</th>
              <th scope="col" className="num">
                Quote
              </th>
              <th scope="col" className="num">
                Make-safe
              </th>
              <th scope="col" className="num">
                Approved
              </th>
              <th scope="col">
                <span className="sr-only">Issue</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((j) => (
              <tr key={j.requestId}>
                <td>
                  <Link to={{ name: 'request', id: j.requestId }}>
                    <span className="ref">{j.ref}</span>
                  </Link>
                </td>
                <td className="num">{j.quoteFils > 0 ? fils(j.quoteFils) : '—'}</td>
                <td className="num">{j.makeSafeFils > 0 ? fils(j.makeSafeFils) : '—'}</td>
                <td className="num">{fils(j.approvedFils)}</td>
                <td>
                  <button
                    type="button"
                    className="btn btn-small"
                    onClick={() => {
                      onIssue(j);
                    }}
                  >
                    Issue invoice
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Section>
  );
}

function Figures({ t }: { t: Totals }): ReactNode {
  return (
    <div className="figures">
      <Figure label="Outstanding" value={fils(t.outstandingFils)} note="Issued and not paid yet" />
      <Figure label="Overdue" value={fils(t.overdueFils)} note="Past the due date" />
      <Figure label="Paid" value={fils(t.paidThisMonthFils)} note={monthText(t.month)} />
    </div>
  );
}

const FILTERS: readonly { value: Filter; label: string }[] = [
  { value: '', label: 'All invoices' },
  { value: 'overdue', label: 'Overdue' },
  ...INVOICE_STATUSES.map((s) => ({ value: s, label: INVOICE_STATUS_LABELS[s][0] })),
];

export function OfficeInvoices(): ReactNode {
  const { api } = useConsole();
  const now = useNow();
  const [filter, setFilter] = useState<Filter>('');
  const [issuing, setIssuing] = useState<ReadyJob | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const { state, reload } = useLoad(
    () =>
      Promise.all([
        api.get(withQuery('/api/partner/invoices', { status: filter }), partnerInvoicesResponse),
        api.get('/api/partner/invoices/ready', invoiceReadyResponse),
      ]),
    `invoices:${filter}`,
  );
  const finished = (message: string): void => {
    setIssuing(null);
    setDone(message);
    reload();
  };
  return (
    <>
      <PageHeader title="Invoices">
        <label className="field">
          <span className="label">Show</span>
          <select
            value={filter}
            onChange={(e) => {
              setFilter(FILTERS.find((f) => f.value === e.target.value)?.value ?? '');
            }}
          >
            {FILTERS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </label>
      </PageHeader>
      <p className="page-intro muted">
        The owner pays you directly, by the way you write on the invoice. JAD+ records the invoice and whether
        it is paid; it never holds the money and takes no commission.
      </p>
      {done === null ? null : <Notice tone="good">{done}</Notice>}
      <Loaded state={state} reload={reload}>
        {([list, ready]) => {
          const claimed = awaitingConfirmation(list.invoices);
          const latest = list.invoices[0];
          const last: LastDetails | null =
            latest === undefined
              ? null
              : { trn: latest.trn, paymentInstructions: latest.paymentInstructions };
          return (
            <>
              <Figures t={list.totals} />
              {claimed.length === 0 ? null : (
                <Notice tone="warn">
                  {claimed.length === 1
                    ? '1 owner says they have paid.'
                    : `${String(claimed.length)} owners say they have paid.`}{' '}
                  Check your account and confirm: {claimed.map((i) => i.number).join(', ')}.
                </Notice>
              )}
              {issuing === null ? null : (
                <IssueForm
                  key={issuing.requestId}
                  job={issuing}
                  last={last}
                  onIssued={finished}
                  onCancel={() => {
                    setIssuing(null);
                  }}
                />
              )}
              <ReadyJobs
                jobs={ready.jobs}
                onIssue={(job) => {
                  setDone(null);
                  setIssuing(job);
                }}
              />
              <Section title="Invoices" count={list.invoices.length}>
                {list.invoices.length === 0 ? (
                  <Empty>No invoices to show.</Empty>
                ) : (
                  <InvoiceTable invoices={list.invoices} now={now} onDone={finished} />
                )}
              </Section>
            </>
          );
        }}
      </Loaded>
    </>
  );
}
