/**
 * The partner office's messages (ADR 0009, 0025): every job with messages, the ones waiting for the company's
 * reply first. Messages are read and answered on the job page; contact details are already removed.
 */
import { partnerMessagesResponse } from '@jadplus/shared';
import type { z } from 'zod';
import type { ReactNode } from 'react';
import { dateTime, STATUS_LABELS } from '../lib/format';
import { useConsole, useLoad } from '../ui/hooks';
import { Empty, Link, Loaded, PageHeader, Section, StatusTag, Tag } from '../ui/parts';
import { SortHeader, useSort } from '../ui/table';

type Thread = z.infer<typeof partnerMessagesResponse>['threads'][number];
type Column = 'reply' | 'ref' | 'status' | 'last';

const FROM: Readonly<Record<Thread['lastFrom'], string>> = {
  resident: 'Resident',
  partner: 'Your company',
  jad: 'JAD+',
};

function value(t: Thread, column: Column): string | number {
  switch (column) {
    case 'reply':
      // Waiting first, then the most recent.
      return (t.awaitingReply ? 0 : 1) * 1e13 - t.lastAt;
    case 'ref':
      return t.ref;
    case 'status':
      return STATUS_LABELS[t.status];
    case 'last':
      return t.lastAt;
  }
}

function Threads({ threads }: { threads: readonly Thread[] }): ReactNode {
  const sorted = useSort<Thread, Column>(threads, { key: 'reply', dir: 'asc' }, value);
  return (
    <table className="table">
      <thead>
        <tr>
          <SortHeader label="Waiting" column="reply" sorted={sorted} />
          <SortHeader label="Job" column="ref" sorted={sorted} />
          <SortHeader label="Status" column="status" sorted={sorted} />
          <th scope="col">Last message</th>
          <SortHeader label="When" column="last" sorted={sorted} />
        </tr>
      </thead>
      <tbody>
        {sorted.rows.map((t) => (
          <tr key={t.requestId}>
            <td>
              {t.awaitingReply ? <Tag tone="warn">Reply needed</Tag> : <span className="muted">—</span>}
            </td>
            <td>
              <Link to={{ name: 'request', id: t.requestId }}>
                <span className="ref">{t.ref}</span> {t.service ?? 'Service request'}
              </Link>
              <span className="block hint">
                {t.messages === 1 ? '1 message' : `${String(t.messages)} messages`}
              </span>
            </td>
            <td>
              <StatusTag status={t.status} />
            </td>
            <td>
              <span className="label">{FROM[t.lastFrom]}</span>
              <span className="block prewrap">{t.preview}</span>
            </td>
            <td>{dateTime(t.lastAt)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function OfficeMessages(): ReactNode {
  const { api } = useConsole();
  const { state, reload } = useLoad(
    () => api.get('/api/partner/messages', partnerMessagesResponse),
    'messages',
  );
  return (
    <>
      <PageHeader eyebrow="Partner office" title="Messages">
        <button type="button" className="btn btn-outline" onClick={reload}>
          Refresh
        </button>
      </PageHeader>
      <Loaded state={state} reload={reload}>
        {({ threads }) => (
          <Section title="Conversations" count={threads.length}>
            {threads.length === 0 ? (
              <Empty>No messages on your jobs yet.</Empty>
            ) : (
              <Threads threads={threads} />
            )}
          </Section>
        )}
      </Loaded>
    </>
  );
}
