/**
 * Partner invoices, the owner's side (ADR 0026). Only the owner the invoice was issued to sees it; tenants never
 * do (the owner pays). JAD+ shows who to pay and how; the owner pays the partner directly, never through JAD+.
 *
 * - GET  /api/owner/invoices                  the owner's invoices, newest first, with the amount still to pay
 * - GET  /api/requests/:id/invoice            the request's invoice in force (null when none yet)
 * - POST /api/owner/invoices/:id/claim-paid   "I have paid" {paidOn}: the partner office is asked to confirm
 */
import {
  canInvoiceStep,
  claimInvoicePaidBody,
  invoiceActions,
  invoiceIdParam,
  paidOnProblem,
  requestIdParam,
  type OwnerInvoice,
} from '@jadplus/shared';
import type { Hono } from 'hono';
import { requireRole } from '../auth/middleware.js';
import type { AppEnv } from '../env.js';
import { ApiError } from '../errors.js';
import { audit } from '../partner/company/common.js';
import { versionGuard, withConflictCheck } from '../requests/concurrency.js';
import { parseJsonBody, parseParams } from '../validate.js';
import {
  INVOICE_SELECT,
  NOT_FOUND,
  STEP_NOT_POSSIBLE,
  invoiceCore,
  invoiceFacts,
  invoiceWhere,
  officeItem,
  paymentInstructions,
  today,
  type Ctx,
  type InvoiceRow,
} from './common.js';

const LIST_LIMIT = 200;

async function ownerView(c: Ctx, row: InvoiceRow, day: string): Promise<OwnerInvoice> {
  return {
    ...invoiceCore(row, day),
    partnerName: row.partner_name,
    paymentInstructions: await paymentInstructions(c, row),
    actions: invoiceActions('owner', row.status),
  };
}

export function registerOwnerInvoices(r: Hono<AppEnv>): void {
  const owner = requireRole('owner');

  r.get('/owner/invoices', owner, async (c) => {
    const day = today(c);
    const { results } = await c.env.DB.prepare(
      `${INVOICE_SELECT} WHERE i.owner_user_id = ? ORDER BY i.issued_at DESC, i.id LIMIT ?`,
    )
      .bind(c.get('auth').userId, LIST_LIMIT)
      .all<InvoiceRow>();
    const outstanding = results
      .filter((i) => i.status === 'issued' || i.status === 'claimed_paid')
      .reduce((sum, i) => sum + i.total_fils, 0);
    return c.json({
      invoices: await Promise.all(results.map((row) => ownerView(c, row, day))),
      outstandingFils: outstanding,
    });
  });

  r.get('/requests/:id/invoice', owner, async (c) => {
    const { id } = parseParams(c, requestIdParam);
    const userId = c.get('auth').userId;
    const db = c.env.DB;
    const row = await db
      .prepare(`${INVOICE_SELECT} WHERE i.request_id = ? AND i.owner_user_id = ? AND i.status <> 'cancelled'`)
      .bind(id, userId)
      .first<InvoiceRow>();
    if (row !== null) return c.json({ invoice: await ownerView(c, row, today(c)) });
    // No invoice yet: answer only for the owner's own request, so nobody can probe other requests.
    const own = await db
      .prepare('SELECT 1 AS yes FROM requests WHERE id = ? AND owner_user_id = ?')
      .bind(id, userId)
      .first();
    if (own === null) throw new ApiError(404, NOT_FOUND);
    return c.json({ invoice: null });
  });

  r.post('/owner/invoices/:id/claim-paid', owner, async (c) => {
    const { id } = parseParams(c, invoiceIdParam);
    const row = await invoiceWhere(c, 'i.id = ? AND i.owner_user_id = ?', id, c.get('auth').userId);
    const body = await parseJsonBody(c, claimInvoicePaidBody);
    if (!canInvoiceStep('owner', 'claim_paid', row.status)) throw new ApiError(409, STEP_NOT_POSSIBLE);
    const problem = paidOnProblem(body.paidOn, today(c));
    if (problem !== null) throw new ApiError(400, problem);
    const db = c.env.DB;
    const now = c.get('now');
    await withConflictCheck(() =>
      db.batch([
        db
          .prepare(
            `UPDATE invoices SET status = 'claimed_paid', claimed_paid_on = ?, claimed_at = ?, updated_at = ?,
               ${versionGuard} WHERE id = ?`,
          )
          .bind(body.paidOn, now, now, row.version, row.id),
        audit(c, 'invoice_payment_claimed', 'invoice', row.id),
        officeItem(c, row, invoiceFacts(row)),
      ]),
    );
    return c.json({ id: row.id, status: 'claimed_paid' });
  });
}
