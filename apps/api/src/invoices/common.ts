/**
 * Shared pieces of partner invoices (ADR 0026): reading an invoice with its request reference and partner name,
 * the fields every view shows, the encrypted free text (payment instructions, cancel reason; C-PD-2), what the
 * owner approved on a job, and the notifications an invoice step sends.
 */
import {
  dubaiDate,
  isOverdue,
  type InboxData,
  type InvoiceCore,
  type InvoiceStatus,
  type PaymentMethod,
} from '@jadplus/shared';
import type { Context } from 'hono';
import { decryptField, encryptField, toBytes } from '../crypto.js';
import type { AppEnv } from '../env.js';
import { ApiError } from '../errors.js';
import { inboxStatements } from '../requests/inbox.js';

export type Ctx = Context<AppEnv>;

export const NOT_FOUND = 'Not found.';
export const STEP_NOT_POSSIBLE = 'This step is not possible for this invoice now. Refresh and try again.';

export interface InvoiceRow {
  id: string;
  request_id: string;
  ref: string;
  partner_id: string;
  partner_name: string;
  owner_user_id: string;
  number: string;
  issue_date: string;
  due_date: string;
  quote_fils: number;
  make_safe_fils: number;
  subtotal_fils: number;
  vat_fils: number;
  total_fils: number;
  trn: string;
  payment_instructions_enc: unknown;
  status: InvoiceStatus;
  claimed_paid_on: string | null;
  paid_on: string | null;
  paid_method: PaymentMethod | null;
  cancelled_at: number | null;
  issued_at: number;
  version: number;
}

/** The invoice columns with the request reference and the partner's name. Append WHERE / ORDER BY. */
export const INVOICE_SELECT = `SELECT i.id, i.request_id, r.ref, i.partner_id, p.name AS partner_name, i.owner_user_id,
  i.number, i.issue_date, i.due_date, i.quote_fils, i.make_safe_fils, i.subtotal_fils, i.vat_fils, i.total_fils,
  i.trn, i.payment_instructions_enc, i.status, i.claimed_paid_on, i.paid_on, i.paid_method, i.cancelled_at,
  i.issued_at, i.version
  FROM invoices i JOIN requests r ON r.id = i.request_id JOIN partners p ON p.id = i.partner_id`;

/** Encryption contexts (C-PD-2): the ciphertext only opens for its own row and column. */
export const instructionsContext = (id: string): string => `invoices.payment_instructions:${id}`;
export const cancelReasonContext = (id: string): string => `invoices.cancel_reason:${id}`;

export function encryptInstructions(c: Ctx, id: string, text: string): Promise<Uint8Array> {
  return encryptField(c.get('keys'), text, instructionsContext(id));
}

export function paymentInstructions(c: Ctx, row: InvoiceRow): Promise<string> {
  return decryptField(c.get('keys'), toBytes(row.payment_instructions_enc), instructionsContext(row.id));
}

export function today(c: Ctx): string {
  return dubaiDate(c.get('now'));
}

/** The fields every view of an invoice shares (packages/shared invoiceCore). */
export function invoiceCore(row: InvoiceRow, day: string): InvoiceCore {
  const lines: InvoiceCore['lines'] = [];
  if (row.quote_fils > 0) lines.push({ kind: 'quote', fils: row.quote_fils });
  if (row.make_safe_fils > 0) lines.push({ kind: 'make_safe', fils: row.make_safe_fils });
  return {
    id: row.id,
    number: row.number,
    requestId: row.request_id,
    ref: row.ref,
    status: row.status,
    overdue: isOverdue({ status: row.status, dueDate: row.due_date }, day),
    issueDate: row.issue_date,
    dueDate: row.due_date,
    lines,
    subtotalFils: row.subtotal_fils,
    vatFils: row.vat_fils,
    totalFils: row.total_fils,
    trn: row.trn,
    claimedPaidOn: row.claimed_paid_on,
    paidOn: row.paid_on,
    paidMethod: row.paid_method,
  };
}

/** One invoice matching `where` (bound to `params`), or 404. */
export async function invoiceWhere(c: Ctx, where: string, ...params: string[]): Promise<InvoiceRow> {
  const row = await c.env.DB.prepare(`${INVOICE_SELECT} WHERE ${where}`)
    .bind(...params)
    .first<InvoiceRow>();
  if (row === null) throw new ApiError(404, NOT_FOUND);
  return row;
}

/**
 * What the owner approved for this partner on the request: the latest approved quote (A3: a revised quote
 * replaces the first) and the make-safe work done under the owner's limit (E8).
 */
export async function approvedAmounts(
  db: D1Database,
  requestId: string,
  partnerId: string,
): Promise<{ quoteFils: number; makeSafeFils: number }> {
  const row = await db
    .prepare(
      `SELECT
         (SELECT amount_fils FROM quotes WHERE request_id = ?1 AND partner_id = ?2 AND status = 'approved'
            ORDER BY revision DESC LIMIT 1) AS quote,
         (SELECT amount_fils FROM make_safe_works WHERE request_id = ?1 AND partner_id = ?2) AS make_safe`,
    )
    .bind(requestId, partnerId)
    .first<{ quote: number | null; make_safe: number | null }>();
  return { quoteFils: row?.quote ?? 0, makeSafeFils: row?.make_safe ?? 0 };
}

/** The few facts an invoice notification carries (no personal data). */
export function invoiceFacts(row: Pick<InvoiceRow, 'total_fils' | 'due_date' | 'number'>): InboxData {
  return { amountAed: row.total_fils / 100, dueOn: row.due_date, invoiceNumber: row.number };
}

/** A notification to the owner who pays the invoice (tenants never see invoices). */
export function ownerItem(
  c: Ctx,
  row: Pick<InvoiceRow, 'request_id' | 'owner_user_id'>,
  kind: 'invoice_issued' | 'invoice_paid' | 'invoice_not_received' | 'invoice_cancelled' | 'invoice_overdue',
  data: InboxData,
): D1PreparedStatement[] {
  const target = {
    id: row.request_id,
    owner_user_id: row.owner_user_id,
    raised_by_user_id: row.owner_user_id,
  };
  return inboxStatements(c.env.DB, target, kind, c.get('now'), data);
}

/** "The owner says they have paid": to the partner's office only (partner_admin), not the technicians. */
export function officeItem(c: Ctx, row: InvoiceRow, data: InboxData): D1PreparedStatement {
  return c.env.DB.prepare(
    `INSERT OR IGNORE INTO inbox (id, user_id, request_id, kind, data, at)
     SELECT lower(hex(randomblob(16))), g.user_id, ?1, 'invoice_paid_claimed', ?2, ?3 FROM user_roles g
     WHERE g.role = 'partner_admin' AND g.partner_id = ?4 AND g.revoked_at IS NULL`,
  ).bind(row.request_id, JSON.stringify(data), c.get('now'), row.partner_id);
}
