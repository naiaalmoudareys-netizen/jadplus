/**
 * JAD+ Admin "Desk" (ADR 0011, 0025): owners' requests to the JAD+ desk (documents, contact changes, closing
 * the account, other), filtered by status, oldest open first. The list carries no personal data: open one to
 * see who asked and what they wrote (that view is audited). In production the desk works them in Salesforce.
 */
import { DESK_STATUSES, adminDeskQueueResponse, type DeskStatus } from '@jadplus/shared';
import type { ReactNode } from 'react';
import type { z } from 'zod';
import { withQuery } from '../lib/api';
import { ago, dateTime } from '../lib/format';
import { DESK_TONES } from '../lib/labels';
import { formatRoute } from '../lib/router';
import { useConsole, useLoad, useNow } from '../ui/hooks';
import { Empty, Link, Loaded, PageHeader, Tag } from '../ui/parts';
import { SortHeader, useSort } from '../ui/table';

type Row = z.infer<typeof adminDeskQueueResponse>['requests'][number];
type Column = 'type' | 'unit' | 'status' | 'created' | 'updated';

function Table({ rows, now }: { rows: readonly Row[]; now: number }): ReactNode {
  const sorted = useSort<Row, Column>(rows, { key: 'created', dir: 'asc' }, (r, key) => {
    switch (key) {
      case 'type':
        return r.type;
      case 'unit':
        return r.unitName;
      case 'status':
        return DESK_STATUSES.indexOf(r.status);
      case 'created':
        return r.createdAt;
      case 'updated':
        return r.updatedAt;
    }
  });
  return (
    <table className="table">
      <thead>
        <tr>
          <SortHeader label="Request" column="type" sorted={sorted} />
          <SortHeader label="Unit" column="unit" sorted={sorted} />
          <SortHeader label="Status" column="status" sorted={sorted} />
          <SortHeader label="Asked" column="created" sorted={sorted} />
          <SortHeader label="Last change" column="updated" sorted={sorted} />
        </tr>
      </thead>
      <tbody>
        {sorted.rows.map((r) => (
          <tr key={r.id}>
            <td>
              <Link to={{ name: 'desk_item', id: r.id }}>{r.type}</Link>
              {r.inSalesforce ? <Tag tone="calm">In Salesforce</Tag> : null}
              {r.hasDetails ? <span className="block hint">Has a message from the owner</span> : null}
            </td>
            <td>{r.unitName ?? '—'}</td>
            <td>
              <Tag tone={DESK_TONES[r.status]}>{r.status}</Tag>
              {r.replied ? <span className="block hint">Replied</span> : null}
            </td>
            <td>
              {dateTime(r.createdAt)}
              <span className="block hint">{ago(r.createdAt, now)}</span>
            </td>
            <td>{r.updatedAt === null ? '—' : dateTime(r.updatedAt)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function Desk({ status }: { status: DeskStatus | null }): ReactNode {
  const { api } = useConsole();
  const now = useNow();
  const { state, reload } = useLoad(
    () => api.get(withQuery('/api/admin/desk-requests', { status }), adminDeskQueueResponse),
    status ?? 'all',
  );
  const filters: readonly (DeskStatus | null)[] = [null, ...DESK_STATUSES];
  return (
    <>
      <PageHeader eyebrow="JAD+ Admin" title="Documents & account requests">
        <nav className="segmented" aria-label="Status">
          {filters.map((s) => (
            <a
              key={s ?? 'all'}
              href={formatRoute({ name: 'desk', status: s })}
              className={s === status ? 'segment segment-current' : 'segment'}
              aria-current={s === status ? 'page' : undefined}
            >
              {s ?? 'All'}
            </a>
          ))}
        </nav>
      </PageHeader>
      <Loaded state={state} reload={reload}>
        {({ requests }) => (
          <section className="card">
            {requests.length === 0 ? (
              <Empty>No desk requests{status === null ? '' : ` with status “${status}”`}.</Empty>
            ) : (
              <Table rows={requests} now={now} />
            )}
          </section>
        )}
      </Loaded>
    </>
  );
}
