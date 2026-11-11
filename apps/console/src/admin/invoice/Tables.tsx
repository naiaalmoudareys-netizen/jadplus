/**
 * JAD+ Admin's invoice tables (ADR 0026 §4): every invoice listed with its age while unpaid, and the totals by
 * partner and by owner, so the desk sees who has paid and who has not. Read-only: JAD+ takes no part in the
 * payment.
 */
import type { AdminInvoices } from '@jadplus/shared';
import type { ReactNode } from 'react';
import { dayText, fils } from '../../lib/format';
import { PAYMENT_METHOD_LABELS, invoiceStatusText, paidStanding } from '../../lib/invoices';
import { Link, Tag } from '../../ui/parts';
import { SortHeader, useSort, type Sorted } from '../../ui/table';

type Invoice = AdminInvoices['invoices'][number];
type InvoiceColumn = 'number' | 'partner' | 'owner' | 'issued' | 'due' | 'total' | 'status' | 'age';
type PartnerRow = AdminInvoices['byPartner'][number];
type OwnerRow = AdminInvoices['byOwner'][number];
type SumColumn = 'name' | 'count' | 'outstandingFils' | 'overdueFils' | 'paidFils';

const ownerLabel = (name: string | null): string => name ?? 'Name not available';

function invoiceValue(i: Invoice, k: InvoiceColumn): string | number | null {
  switch (k) {
    case 'number':
      return i.number;
    case 'partner':
      return i.partnerName;
    case 'owner':
      return ownerLabel(i.ownerName);
    case 'issued':
      return i.issueDate;
    case 'due':
      return i.dueDate;
    case 'total':
      return i.totalFils;
    case 'status':
      return invoiceStatusText(i)[0];
    case 'age':
      return i.ageing === null ? null : i.ageDays;
  }
}

export function InvoiceTable({ invoices }: { invoices: readonly Invoice[] }): ReactNode {
  const sorted = useSort<Invoice, InvoiceColumn>(invoices, { key: 'issued', dir: 'desc' }, invoiceValue);
  return (
    <table className="table">
      <thead>
        <tr>
          <SortHeader label="Invoice" column="number" sorted={sorted} />
          <SortHeader label="Partner" column="partner" sorted={sorted} />
          <SortHeader label="Owner" column="owner" sorted={sorted} />
          <SortHeader label="Issued" column="issued" sorted={sorted} />
          <SortHeader label="Due" column="due" sorted={sorted} />
          <SortHeader label="Total" column="total" sorted={sorted} numeric />
          <SortHeader label="Status" column="status" sorted={sorted} />
          <SortHeader label="Days unpaid" column="age" sorted={sorted} numeric />
        </tr>
      </thead>
      <tbody>
        {sorted.rows.map((i) => {
          const [text, tone] = invoiceStatusText(i);
          return (
            <tr key={i.id} className={i.status === 'claimed_paid' ? 'row-attention' : undefined}>
              <td>
                {i.number}
                <span className="block">
                  <Link to={{ name: 'request', id: i.requestId }}>
                    <span className="ref">{i.ref}</span>
                  </Link>
                </span>
              </td>
              <td>
                <Link to={{ name: 'partner', id: i.partnerId }}>{i.partnerName}</Link>
              </td>
              <td>
                <Link to={{ name: 'person', id: i.ownerUserId }}>{ownerLabel(i.ownerName)}</Link>
              </td>
              <td>{dayText(i.issueDate)}</td>
              <td className={i.overdue ? 'late' : undefined}>{dayText(i.dueDate)}</td>
              <td className="num">{fils(i.totalFils)}</td>
              <td>
                <Tag tone={tone}>{text}</Tag>
                {i.claimedPaidOn === null || i.status !== 'claimed_paid' ? null : (
                  <span className="block hint">Owner says paid {dayText(i.claimedPaidOn)}</span>
                )}
                {i.paidOn === null ? null : (
                  <span className="block hint">
                    {dayText(i.paidOn)}
                    {i.paidMethod === null ? '' : ` · ${PAYMENT_METHOD_LABELS[i.paidMethod]}`}
                  </span>
                )}
              </td>
              <td className={i.overdue ? 'num late' : 'num'}>{i.ageing === null ? '—' : i.ageDays}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function SumHeaders({
  first,
  sorted,
}: {
  first: string;
  sorted: Pick<Sorted<unknown, SumColumn>, 'sort' | 'onSort'>;
}): ReactNode {
  return (
    <tr>
      <SortHeader label={first} column="name" sorted={sorted} />
      <SortHeader label="Invoices" column="count" sorted={sorted} numeric />
      <SortHeader label="Not paid" column="outstandingFils" sorted={sorted} numeric />
      <SortHeader label="Overdue" column="overdueFils" sorted={sorted} numeric />
      <SortHeader label="Paid" column="paidFils" sorted={sorted} numeric />
      <th scope="col">Standing</th>
    </tr>
  );
}

function SumCells({ row }: { row: PartnerRow | OwnerRow }): ReactNode {
  const [text, tone] = paidStanding(row);
  return (
    <>
      <td className="num">{row.count}</td>
      <td className="num">{fils(row.outstandingFils)}</td>
      <td className={row.overdueFils > 0 ? 'num late' : 'num'}>{fils(row.overdueFils)}</td>
      <td className="num">{fils(row.paidFils)}</td>
      <td>
        <Tag tone={tone}>{text}</Tag>
      </td>
    </>
  );
}

export function ByPartner({ rows }: { rows: readonly PartnerRow[] }): ReactNode {
  const sorted = useSort<PartnerRow, SumColumn>(rows, { key: 'outstandingFils', dir: 'desc' }, (r, k) =>
    k === 'name' ? r.partnerName : r[k],
  );
  return (
    <table className="table">
      <thead>
        <SumHeaders first="Partner" sorted={sorted} />
      </thead>
      <tbody>
        {sorted.rows.map((r) => (
          <tr key={r.partnerId}>
            <td>
              <Link to={{ name: 'partner', id: r.partnerId }}>{r.partnerName}</Link>
            </td>
            <SumCells row={r} />
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function ByOwner({ rows }: { rows: readonly OwnerRow[] }): ReactNode {
  const sorted = useSort<OwnerRow, SumColumn>(rows, { key: 'outstandingFils', dir: 'desc' }, (r, k) =>
    k === 'name' ? ownerLabel(r.ownerName) : r[k],
  );
  return (
    <table className="table">
      <thead>
        <SumHeaders first="Owner" sorted={sorted} />
      </thead>
      <tbody>
        {sorted.rows.map((r) => (
          <tr key={r.ownerUserId}>
            <td>
              <Link to={{ name: 'person', id: r.ownerUserId }}>{ownerLabel(r.ownerName)}</Link>
            </td>
            <SumCells row={r} />
          </tr>
        ))}
      </tbody>
    </table>
  );
}
