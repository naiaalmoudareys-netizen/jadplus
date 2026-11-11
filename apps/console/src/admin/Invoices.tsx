/**
 * JAD+ Admin "Invoices" (ADR 0026 §4): every partner invoice recorded in JAD+, who has paid and who has not,
 * by partner and by owner, with the age of unpaid invoices, for follow-up and disputes (handled by the JAD+
 * desk). Read-only: the owner pays the partner directly and JAD+ takes no part in the payment. Owner names are
 * shown, so the API records the viewing in the audit log. JAD+ Admin and JAD+ viewer.
 */
import {
  AGEING_BUCKETS,
  INVOICE_STATUSES,
  adminInvoicesResponse,
  adminPartnersResponse,
  type AdminInvoices as Answer,
  type InvoiceStatus,
} from '@jadplus/shared';
import { useState, type ReactNode } from 'react';
import { withQuery } from '../lib/api';
import { fils } from '../lib/format';
import { AGEING_LABELS, INVOICE_STATUS_LABELS, sumInvoices } from '../lib/invoices';
import { useConsole, useLoad } from '../ui/hooks';
import { Empty, Figure, Loaded, PageHeader, Section } from '../ui/parts';
import { ByOwner, ByPartner, InvoiceTable } from './invoice/Tables';

/** The API lists at most this many invoices (apps/api/src/invoices/admin.ts). */
const LIST_LIMIT = 500;

type Overdue = '' | 'true' | 'false';

interface Filters {
  readonly status: InvoiceStatus | '';
  readonly partnerId: string;
  readonly overdue: Overdue;
}

const OVERDUE: readonly { value: Overdue; label: string }[] = [
  { value: '', label: 'Any' },
  { value: 'true', label: 'Overdue only' },
  { value: 'false', label: 'Not overdue' },
];

function FilterBar({ filters, onChange }: { filters: Filters; onChange: (f: Filters) => void }): ReactNode {
  const { api } = useConsole();
  const partners = useLoad(() => api.get('/api/admin/partners', adminPartnersResponse), 'partners');
  const list = partners.state.status === 'ready' ? partners.state.data.partners : [];
  return (
    <div className="card search">
      <label className="field">
        <span className="label">Status</span>
        <select
          value={filters.status}
          onChange={(e) => {
            onChange({ ...filters, status: INVOICE_STATUSES.find((s) => s === e.target.value) ?? '' });
          }}
        >
          <option value="">All</option>
          {INVOICE_STATUSES.map((s) => (
            <option key={s} value={s}>
              {INVOICE_STATUS_LABELS[s][0]}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span className="label">Partner</span>
        <select
          value={filters.partnerId}
          onChange={(e) => {
            onChange({ ...filters, partnerId: e.target.value });
          }}
        >
          <option value="">All partners</option>
          {list.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span className="label">Overdue</span>
        <select
          value={filters.overdue}
          onChange={(e) => {
            onChange({ ...filters, overdue: OVERDUE.find((o) => o.value === e.target.value)?.value ?? '' });
          }}
        >
          {OVERDUE.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

function Summary({ a }: { a: Answer }): ReactNode {
  const all = sumInvoices(a.byPartner);
  return (
    <>
      <div className="figures">
        <Figure label="Invoices" value={String(all.count)} />
        <Figure label="Not paid yet" value={fils(all.outstandingFils)} />
        <Figure label="Overdue" value={fils(all.overdueFils)} note="Past the due date, not paid" />
        <Figure label="Paid" value={fils(all.paidFils)} />
      </div>
      <div className="figures">
        {AGEING_BUCKETS.map((bucket) => {
          const b = a.ageing.find((x) => x.bucket === bucket);
          const count = b?.count ?? 0;
          return (
            <Figure
              key={bucket}
              label={`Unpaid ${AGEING_LABELS[bucket]}`}
              value={fils(b?.totalFils ?? 0)}
              note={count === 1 ? '1 invoice' : `${String(count)} invoices`}
            />
          );
        })}
      </div>
    </>
  );
}

export function AdminInvoices(): ReactNode {
  const { api } = useConsole();
  const [filters, setFilters] = useState<Filters>({ status: '', partnerId: '', overdue: '' });
  const query = { status: filters.status, partnerId: filters.partnerId, overdue: filters.overdue };
  const path = withQuery('/api/admin/invoices', query);
  const { state, reload } = useLoad(() => api.get(path, adminInvoicesResponse), path);
  return (
    <>
      <PageHeader eyebrow="JAD+ Admin" title="Invoices" />
      <p className="page-intro muted">
        Partners invoice owners in JAD+ and owners pay the partner directly. JAD+ only sees the amounts and
        who has paid; it never holds the money. Disputes go to the JAD+ desk.
      </p>
      <FilterBar filters={filters} onChange={setFilters} />
      <Loaded state={state} reload={reload}>
        {(a) => (
          <>
            <Summary a={a} />
            <Section title="Invoices" count={a.invoices.length}>
              {a.invoices.length === 0 ? (
                <Empty>No invoices match.</Empty>
              ) : (
                <InvoiceTable invoices={a.invoices} />
              )}
              {a.invoices.length < LIST_LIMIT ? null : (
                <p className="hint">
                  The latest {LIST_LIMIT} invoices are shown. Narrow the filters to see others.
                </p>
              )}
            </Section>
            <Section title="By partner" count={a.byPartner.length}>
              {a.byPartner.length === 0 ? <Empty>No invoices.</Empty> : <ByPartner rows={a.byPartner} />}
            </Section>
            <Section title="By owner" count={a.byOwner.length}>
              {a.byOwner.length === 0 ? <Empty>No invoices.</Empty> : <ByOwner rows={a.byOwner} />}
            </Section>
          </>
        )}
      </Loaded>
    </>
  );
}
