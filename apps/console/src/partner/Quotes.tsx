/**
 * The partner office's quotes (ADR 0025; L4, A2, A3): every quote sent, with what the owner decided and, for
 * those still waiting, how many of the 14 days are left; this month's quoted and approved amounts.
 */
import { QUOTE_STATUSES_FOR_OFFICE, partnerQuotesResponse } from '@jadplus/shared';
import { useState, type ReactNode } from 'react';
import type { z } from 'zod';
import { withQuery } from '../lib/api';
import { dateTime, fils, monthText, percentText, type Tone } from '../lib/format';
import { useConsole, useLoad } from '../ui/hooks';
import { Empty, Figure, Link, Loaded, PageHeader, Section, Tag } from '../ui/parts';
import { SortHeader, useSort } from '../ui/table';

type QuotesAnswer = z.infer<typeof partnerQuotesResponse>;
type Quote = QuotesAnswer['quotes'][number];
type QuoteStatus = (typeof QUOTE_STATUSES_FOR_OFFICE)[number];
type Column = 'ref' | 'amount' | 'status' | 'sent' | 'left';

const STATUS: Readonly<Record<QuoteStatus, [string, Tone]>> = {
  pending: ['Waiting for the owner', 'warn'],
  approved: ['Approved', 'good'],
  declined: ['Declined', 'bad'],
  expired: ['Expired', 'calm'],
  withdrawn: ['Withdrawn', 'calm'],
};

function value(q: Quote, column: Column): string | number | null {
  switch (column) {
    case 'ref':
      return q.ref;
    case 'amount':
      return q.amountFils;
    case 'status':
      return STATUS[q.status][0];
    case 'sent':
      return q.sentAt;
    case 'left':
      return q.daysLeft;
  }
}

function QuoteTable({ quotes }: { quotes: readonly Quote[] }): ReactNode {
  const sorted = useSort<Quote, Column>(quotes, { key: 'sent', dir: 'desc' }, value);
  return (
    <table className="table">
      <thead>
        <tr>
          <SortHeader label="Job" column="ref" sorted={sorted} />
          <SortHeader label="Amount" column="amount" sorted={sorted} numeric />
          <SortHeader label="Status" column="status" sorted={sorted} />
          <SortHeader label="Sent" column="sent" sorted={sorted} />
          <SortHeader label="Days left" column="left" sorted={sorted} numeric />
        </tr>
      </thead>
      <tbody>
        {sorted.rows.map((q) => {
          const [text, tone] = STATUS[q.status];
          return (
            <tr key={q.id}>
              <td>
                <Link to={{ name: 'request', id: q.requestId }}>
                  <span className="ref">{q.ref}</span> {q.service ?? 'Service request'}
                </Link>
                {q.revision > 1 ? <span className="block hint">Revised quote</span> : null}
              </td>
              <td className="num">{fils(q.amountFils)}</td>
              <td>
                <Tag tone={tone}>{text}</Tag>
              </td>
              <td>{dateTime(q.sentAt)}</td>
              <td className={q.daysLeft !== null && q.daysLeft <= 2 ? 'num late' : 'num'}>
                {q.daysLeft ?? '—'}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function MonthFigures({ m }: { m: QuotesAnswer['thisMonth'] }): ReactNode {
  return (
    <div className="figures">
      <Figure label="Quotes sent" value={String(m.sent)} note={monthText(m.month)} />
      <Figure
        label="Approved"
        value={String(m.approved)}
        note={`${percentText(m.conversionPercent)} of those sent`}
      />
      <Figure label="Quoted" value={fils(m.quotedFils)} />
      <Figure label="Approved value" value={fils(m.approvedFils)} />
    </div>
  );
}

export function Quotes(): ReactNode {
  const { api } = useConsole();
  const [status, setStatus] = useState<QuoteStatus | ''>('');
  const { state, reload } = useLoad(
    () => api.get(withQuery('/api/partner/quotes', { status }), partnerQuotesResponse),
    `quotes:${status}`,
  );
  return (
    <>
      <PageHeader title="Quotes">
        <label className="field">
          <span className="label">Show</span>
          <select
            value={status}
            onChange={(e) => {
              const v = e.target.value;
              setStatus(QUOTE_STATUSES_FOR_OFFICE.find((s) => s === v) ?? '');
            }}
          >
            <option value="">All quotes</option>
            {QUOTE_STATUSES_FOR_OFFICE.map((s) => (
              <option key={s} value={s}>
                {STATUS[s][0]}
              </option>
            ))}
          </select>
        </label>
      </PageHeader>
      <Loaded state={state} reload={reload}>
        {(a) => (
          <>
            <MonthFigures m={a.thisMonth} />
            <Section title="Quotes" count={a.quotes.length}>
              {a.quotes.length === 0 ? <Empty>No quotes to show.</Empty> : <QuoteTable quotes={a.quotes} />}
            </Section>
          </>
        )}
      </Loaded>
    </>
  );
}
