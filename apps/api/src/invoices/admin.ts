/**
 * Partner invoices, JAD+ Admin's view (ADR 0026 §4): every invoice, who has paid and who has not, by partner and
 * by owner, with the age of unpaid invoices, for follow-up and disputes. JAD+ takes no part in the payment.
 * jad_admin and jad_viewer may read. Owner names are decrypted, so seeing them is audited like other staff reads
 * ('person_viewed' per owner shown, 'invoices_viewed' for the list; no personal data in the entries).
 *
 * - GET /api/admin/invoices?status=&partnerId=&overdue=true|false
 */
import {
  AGEING_BUCKETS,
  UNPAID_INVOICE_STATUSES,
  adminInvoicesQuery,
  ageDays,
  ageingBucket,
  type AdminInvoices,
  type AgeingBucket,
} from '@jadplus/shared';
import type { Hono } from 'hono';
import { requireRole } from '../auth/middleware.js';
import { decrypted, staffAudit } from '../admin/ops/common.js';
import type { AppEnv } from '../env.js';
import { parseQuery } from '../validate.js';
import { INVOICE_SELECT, invoiceCore, today, type InvoiceRow } from './common.js';

const LIST_LIMIT = 500;

type Item = AdminInvoices['invoices'][number];
interface Sums {
  count: number;
  outstandingFils: number;
  overdueFils: number;
  paidFils: number;
}

function add(sums: Sums, i: Item): void {
  sums.count += 1;
  if (i.status === 'paid') sums.paidFils += i.totalFils;
  if (UNPAID_INVOICE_STATUSES.includes(i.status)) sums.outstandingFils += i.totalFils;
  if (i.overdue) sums.overdueFils += i.totalFils;
}

const empty = (): Sums => ({ count: 0, outstandingFils: 0, overdueFils: 0, paidFils: 0 });

/** Ageing of unpaid invoices and totals per partner and per owner, from the listed invoices. */
function summarise(items: readonly Item[]): Omit<AdminInvoices, 'invoices'> {
  const ageing = new Map<AgeingBucket, { count: number; totalFils: number }>(
    AGEING_BUCKETS.map((b) => [b, { count: 0, totalFils: 0 }]),
  );
  const partners = new Map<string, { partnerId: string; partnerName: string } & Sums>();
  const owners = new Map<string, { ownerUserId: string; ownerName: string | null } & Sums>();
  for (const i of items) {
    const bucket = i.ageing === null ? undefined : ageing.get(i.ageing);
    if (bucket !== undefined) {
      bucket.count += 1;
      bucket.totalFils += i.totalFils;
    }
    const p = partners.get(i.partnerId) ?? { partnerId: i.partnerId, partnerName: i.partnerName, ...empty() };
    add(p, i);
    partners.set(i.partnerId, p);
    const o = owners.get(i.ownerUserId) ?? { ownerUserId: i.ownerUserId, ownerName: i.ownerName, ...empty() };
    add(o, i);
    owners.set(i.ownerUserId, o);
  }
  const byOutstanding = (a: Sums, b: Sums) => b.outstandingFils - a.outstandingFils;
  return {
    ageing: AGEING_BUCKETS.map((bucket) => ({
      bucket,
      ...(ageing.get(bucket) ?? { count: 0, totalFils: 0 }),
    })),
    byPartner: [...partners.values()].sort(byOutstanding),
    byOwner: [...owners.values()].sort(byOutstanding),
  };
}

export function registerAdminInvoices(r: Hono<AppEnv>): void {
  r.get('/admin/invoices', requireRole('jad_admin', 'jad_viewer'), async (c) => {
    const q = parseQuery(c, adminInvoicesQuery);
    const day = today(c);
    const where = ['1 = 1'];
    const params: string[] = [];
    if (q.status !== undefined) {
      where.push('i.status = ?');
      params.push(q.status);
    }
    if (q.partnerId !== undefined) {
      where.push('i.partner_id = ?');
      params.push(q.partnerId);
    }
    if (q.overdue !== undefined) {
      const overdue = "(i.status IN ('issued', 'claimed_paid') AND i.due_date < ?)";
      where.push(q.overdue === 'true' ? overdue : `NOT ${overdue}`);
      params.push(day);
    }
    const db = c.env.DB;
    const { results } = await db
      .prepare(`${INVOICE_SELECT} WHERE ${where.join(' AND ')} ORDER BY i.issued_at DESC, i.id LIMIT ?`)
      .bind(...params, LIST_LIMIT)
      .all<InvoiceRow>();
    const ownerIds = [...new Set(results.map((row) => row.owner_user_id))];
    const { results: people } = await db
      .prepare('SELECT id, name_enc FROM users WHERE id IN (SELECT value FROM json_each(?))')
      .bind(JSON.stringify(ownerIds))
      .all<{ id: string; name_enc: unknown }>();
    const names = new Map<string, string | null>(
      await Promise.all(
        people.map(async (u) => [u.id, await decrypted(c, u.name_enc, `users.name:${u.id}`)] as const),
      ),
    );
    const invoices: Item[] = results.map((row) => {
      const core = invoiceCore(row, day);
      const unpaid = UNPAID_INVOICE_STATUSES.includes(row.status);
      return {
        ...core,
        partnerId: row.partner_id,
        partnerName: row.partner_name,
        ownerUserId: row.owner_user_id,
        ownerName: names.get(row.owner_user_id) ?? null,
        ageDays: ageDays(row.issue_date, day),
        ageing: unpaid ? ageingBucket(row.issue_date, day) : null,
      };
    });
    await db.batch([
      staffAudit(c, 'invoices_viewed', { type: 'invoice', id: 'list' }, { count: invoices.length }),
      ...ownerIds.map((id) => staffAudit(c, 'person_viewed', { type: 'user', id })),
    ]);
    return c.json({ invoices, ...summarise(invoices) });
  });
}
