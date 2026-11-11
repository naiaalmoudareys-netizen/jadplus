/**
 * Partner invoices, the partner office's side (ADR 0026), partner_admin only, own company only (C-AZ-2).
 * Technicians do not see invoices.
 *
 * - GET  /api/partner/invoices?status=            the company's invoices with outstanding, overdue, paid this month
 * - GET  /api/partner/invoices/ready              finished jobs not invoiced yet, with what the owner approved
 * - POST /api/partner/invoices                    issue {requestId, trn, paymentInstructions, dueInDays?, amountAed?}
 * - POST /api/partner/invoices/:id/paid           the money arrived {paidOn, method}
 * - POST /api/partner/invoices/:id/not-received   the owner said "I have paid" but nothing arrived
 * - POST /api/partner/invoices/:id/cancel         issued in error {reason}
 */
import {
  aedToFils,
  addDays,
  canInvoiceStep,
  cancelInvoiceBody,
  invoiceActions,
  invoiceIdParam,
  invoiceNumber,
  invoiceSubtotal,
  invoiceTotals,
  invoiceableJob,
  issueInvoiceBody,
  markInvoicePaidBody,
  monthOf,
  paidOnProblem,
  partnerInvoicesQuery,
  partnerShortCode,
  type CloseReason,
  type InvoiceAction,
  type PartnerInvoice,
  type Status,
} from '@jadplus/shared';
import type { Hono } from 'hono';
import { requireRole } from '../auth/middleware.js';
import { workspacePage } from '../partner/workspace.js';
import { encryptField, newId } from '../crypto.js';
import type { AppEnv } from '../env.js';
import { ApiError } from '../errors.js';
import { audit, companyOf } from '../partner/company/common.js';
import { versionGuard, withConflictCheck } from '../requests/concurrency.js';
import { parseJsonBody, parseParams, parseQuery } from '../validate.js';
import {
  INVOICE_SELECT,
  NOT_FOUND,
  STEP_NOT_POSSIBLE,
  approvedAmounts,
  cancelReasonContext,
  encryptInstructions,
  invoiceCore,
  invoiceFacts,
  invoiceWhere,
  ownerItem,
  paymentInstructions,
  today,
  type Ctx,
  type InvoiceRow,
} from './common.js';

const LIST_LIMIT = 200;
const UNPAID_SQL = "('issued', 'claimed_paid')";
const FINISHED_SQL =
  "(r.status = 'completed' OR (r.status = 'closed' AND r.close_reason IN ('confirmed', 'auto_closed')))";

async function partnerView(c: Ctx, row: InvoiceRow, day: string): Promise<PartnerInvoice> {
  return {
    ...invoiceCore(row, day),
    paymentInstructions: await paymentInstructions(c, row),
    cancelledAt: row.cancelled_at,
    actions: invoiceActions('partner_admin', row.status),
  };
}

/** The company's invoice, or 404 (another company's invoice does not exist for this office). */
function ownInvoice(c: Ctx): Promise<InvoiceRow> {
  const { id } = parseParams(c, invoiceIdParam);
  return invoiceWhere(c, 'i.id = ? AND i.partner_id = ?', id, companyOf(c));
}

function stepAllowed(row: InvoiceRow, action: InvoiceAction): void {
  if (!canInvoiceStep('partner_admin', action, row.status)) throw new ApiError(409, STEP_NOT_POSSIBLE);
}

/** A database rule refused the insert (two offices issuing at once): ask to try again. */
function isUniqueClash(err: unknown): boolean {
  return err instanceof Error && /UNIQUE constraint failed/i.test(err.message);
}

export function registerPartnerInvoices(r: Hono<AppEnv>): void {
  // ADR 0036: outside partners only (JAD Global teams do not invoice owners through JAD+).
  const office = [requireRole('partner_admin'), workspacePage('invoices')] as const;

  r.get('/partner/invoices', ...office, async (c) => {
    const { status } = parseQuery(c, partnerInvoicesQuery);
    const partnerId = companyOf(c);
    const day = today(c);
    const filter =
      status === undefined
        ? ''
        : status === 'overdue'
          ? `AND i.status IN ${UNPAID_SQL} AND i.due_date < ?3`
          : 'AND i.status = ?2';
    const db = c.env.DB;
    const { results } = await db
      .prepare(`${INVOICE_SELECT} WHERE i.partner_id = ?1 ${filter} ORDER BY i.issued_at DESC, i.id LIMIT ?4`)
      .bind(partnerId, status ?? '', day, LIST_LIMIT)
      .all<InvoiceRow>();
    const month = monthOf(c.get('now'));
    const totals = await db
      .prepare(
        `SELECT
           coalesce(sum(CASE WHEN status IN ${UNPAID_SQL} THEN total_fils END), 0) AS outstanding,
           coalesce(sum(CASE WHEN status IN ${UNPAID_SQL} AND due_date < ?2 THEN total_fils END), 0) AS overdue,
           coalesce(sum(CASE WHEN status = 'paid' AND substr(paid_on, 1, 7) = ?3 THEN total_fils END), 0) AS paid
         FROM invoices WHERE partner_id = ?1`,
      )
      .bind(partnerId, day, month)
      .first<{ outstanding: number; overdue: number; paid: number }>();
    return c.json({
      invoices: await Promise.all(results.map((row) => partnerView(c, row, day))),
      totals: {
        outstandingFils: totals?.outstanding ?? 0,
        overdueFils: totals?.overdue ?? 0,
        paidThisMonthFils: totals?.paid ?? 0,
        month,
      },
    });
  });

  r.get('/partner/invoices/ready', ...office, async (c) => {
    const { results } = await c.env.DB.prepare(
      `SELECT * FROM (
         SELECT r.id, r.ref,
           coalesce((SELECT q.amount_fils FROM quotes q WHERE q.request_id = r.id AND q.partner_id = ?1
             AND q.status = 'approved' ORDER BY q.revision DESC LIMIT 1), 0) AS quote,
           coalesce((SELECT m.amount_fils FROM make_safe_works m WHERE m.request_id = r.id AND m.partner_id = ?1), 0)
             AS make_safe
         FROM requests r
         WHERE r.partner_id = ?1 AND ${FINISHED_SQL}
           AND NOT EXISTS (SELECT 1 FROM invoices i WHERE i.request_id = r.id AND i.status <> 'cancelled')
         ORDER BY r.status_changed_at DESC, r.id LIMIT ?2
       ) WHERE quote + make_safe > 0`,
    )
      .bind(companyOf(c), LIST_LIMIT)
      .all<{ id: string; ref: string; quote: number; make_safe: number }>();
    return c.json({
      jobs: results.map((j) => ({
        requestId: j.id,
        ref: j.ref,
        quoteFils: j.quote,
        makeSafeFils: j.make_safe,
        approvedFils: j.quote + j.make_safe,
      })),
    });
  });

  r.post('/partner/invoices', ...office, async (c) => {
    const body = await parseJsonBody(c, issueInvoiceBody);
    const partnerId = companyOf(c);
    const db = c.env.DB;
    const now = c.get('now');
    const job = await db
      .prepare(
        `SELECT r.id, r.status, r.close_reason, r.owner_user_id, p.name AS partner_name,
           (SELECT coalesce(max(seq), 0) FROM invoices WHERE partner_id = ?2) AS last_seq,
           (SELECT count(*) FROM invoices WHERE request_id = ?1 AND status <> 'cancelled') AS active
         FROM requests r JOIN partners p ON p.id = ?2 WHERE r.id = ?1 AND r.partner_id = ?2`,
      )
      .bind(body.requestId, partnerId)
      .first<{
        id: string;
        status: Status;
        close_reason: CloseReason | null;
        owner_user_id: string;
        partner_name: string;
        last_seq: number;
        active: number;
      }>();
    if (job === null) throw new ApiError(404, NOT_FOUND);
    if (!invoiceableJob(job.status, job.close_reason)) {
      throw new ApiError(409, 'An invoice can be issued once the work is finished.');
    }
    if (job.active > 0)
      throw new ApiError(409, 'This job already has an invoice. Cancel it to issue a new one.');
    const approved = await approvedAmounts(db, job.id, partnerId);
    const subtotal = invoiceSubtotal(
      approved,
      body.amountAed === undefined ? null : aedToFils(body.amountAed),
    );
    if (!subtotal.ok) throw new ApiError(409, subtotal.problem);
    const totals = invoiceTotals(subtotal.fils);
    const id = newId();
    const seq = job.last_seq + 1;
    const number = invoiceNumber(partnerShortCode(job.partner_name), seq);
    const issueDate = today(c);
    const dueDate = addDays(issueDate, body.dueInDays);
    try {
      await db.batch([
        db
          .prepare(
            `INSERT INTO invoices (id, request_id, partner_id, owner_user_id, seq, number, issue_date, due_date,
               quote_fils, make_safe_fils, subtotal_fils, vat_fils, total_fils, trn, payment_instructions_enc,
               issued_by, issued_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            id,
            job.id,
            partnerId,
            job.owner_user_id,
            seq,
            number,
            issueDate,
            dueDate,
            approved.quoteFils,
            approved.makeSafeFils,
            totals.subtotalFils,
            totals.vatFils,
            totals.totalFils,
            body.trn,
            await encryptInstructions(c, id, body.paymentInstructions),
            c.get('auth').userId,
            now,
            now,
          ),
        audit(c, 'invoice_issued', 'invoice', id, {
          requestId: job.id,
          totalFils: totals.totalFils,
          dueInDays: body.dueInDays,
        }),
        ...ownerItem(
          c,
          { request_id: job.id, owner_user_id: job.owner_user_id },
          'invoice_issued',
          invoiceFacts({ total_fils: totals.totalFils, due_date: dueDate, number }),
        ),
      ]);
    } catch (err) {
      if (isUniqueClash(err))
        throw new ApiError(409, 'This invoice was just changed by someone else. Try again.');
      throw err;
    }
    const row = await invoiceWhere(c, 'i.id = ?', id);
    return c.json(await partnerView(c, row, issueDate), 201);
  });

  r.post('/partner/invoices/:id/paid', ...office, async (c) => {
    const row = await ownInvoice(c);
    const body = await parseJsonBody(c, markInvoicePaidBody);
    stepAllowed(row, 'mark_paid');
    const problem = paidOnProblem(body.paidOn, today(c));
    if (problem !== null) throw new ApiError(400, problem);
    const db = c.env.DB;
    const now = c.get('now');
    await withConflictCheck(() =>
      db.batch([
        db
          .prepare(
            `UPDATE invoices SET status = 'paid', paid_on = ?, paid_method = ?, paid_recorded_by = ?,
               paid_recorded_at = ?, updated_at = ?, ${versionGuard} WHERE id = ?`,
          )
          .bind(body.paidOn, body.method, c.get('auth').userId, now, now, row.version, row.id),
        audit(c, 'invoice_marked_paid', 'invoice', row.id, { from: row.status, method: body.method }),
        ...ownerItem(c, row, 'invoice_paid', invoiceFacts(row)),
      ]),
    );
    return c.json({ id: row.id, status: 'paid' });
  });

  r.post('/partner/invoices/:id/not-received', ...office, async (c) => {
    const row = await ownInvoice(c);
    stepAllowed(row, 'mark_not_received');
    const db = c.env.DB;
    await withConflictCheck(() =>
      db.batch([
        db
          .prepare(
            `UPDATE invoices SET status = 'issued', claimed_paid_on = NULL, claimed_at = NULL, updated_at = ?,
               ${versionGuard} WHERE id = ?`,
          )
          .bind(c.get('now'), row.version, row.id),
        audit(c, 'invoice_marked_not_received', 'invoice', row.id),
        ...ownerItem(c, row, 'invoice_not_received', invoiceFacts(row)),
      ]),
    );
    return c.json({ id: row.id, status: 'issued' });
  });

  r.post('/partner/invoices/:id/cancel', ...office, async (c) => {
    const row = await ownInvoice(c);
    const body = await parseJsonBody(c, cancelInvoiceBody);
    stepAllowed(row, 'cancel');
    const db = c.env.DB;
    const now = c.get('now');
    const reason = await encryptField(c.get('keys'), body.reason, cancelReasonContext(row.id));
    await withConflictCheck(() =>
      db.batch([
        db
          .prepare(
            `UPDATE invoices SET status = 'cancelled', cancelled_by = ?, cancelled_at = ?, cancel_reason_enc = ?,
               updated_at = ?, ${versionGuard} WHERE id = ?`,
          )
          .bind(c.get('auth').userId, now, reason, now, row.version, row.id),
        audit(c, 'invoice_cancelled', 'invoice', row.id, { from: row.status }),
        ...ownerItem(c, row, 'invoice_cancelled', invoiceFacts(row)),
      ]),
    );
    return c.json({ id: row.id, status: 'cancelled' });
  });
}
