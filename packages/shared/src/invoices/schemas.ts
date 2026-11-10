/**
 * Partner invoices (ADR 0026): what the API accepts and what it answers. Every query, parameter and body is
 * strict (unknown keys rejected, C-VAL-1). Money is in fils (1 AED = 100 fils).
 */
import { z } from 'zod';
import { calendarDate } from '../partner-office/schemas.js';
import { idSchema } from '../schemas.js';
import {
  AGEING_BUCKETS,
  DEFAULT_DUE_DAYS,
  INVOICE_STATUSES,
  MAX_DUE_DAYS,
  PAYMENT_INSTRUCTIONS_MAX,
  PAYMENT_METHODS,
} from './rules.js';

/** The partner's UAE Tax Registration Number: 15 digits. Spaces and dashes people type are removed first. */
export const trnSchema = z
  .string()
  .max(40)
  .transform((s) => s.replace(/[\s-]/g, ''))
  .pipe(z.string().regex(/^\d{15}$/, 'A UAE TRN is 15 digits.'));

/** /api/.../invoices/:id */
export const invoiceIdParam = z.strictObject({ id: idSchema });

/** POST /api/partner/invoices: invoice a finished job. The amount defaults to what the owner approved. */
export const issueInvoiceBody = z.strictObject({
  requestId: idSchema,
  trn: trnSchema,
  /** Bank details (IBAN) or the partner's payment link, as plain text. Stored encrypted. */
  paymentInstructions: z.string().trim().min(5).max(PAYMENT_INSTRUCTIONS_MAX),
  dueInDays: z.number().int().min(0).max(MAX_DUE_DAYS).default(DEFAULT_DUE_DAYS),
  /** A lower subtotal than approved, in AED (before VAT). Never more than the owner approved. */
  amountAed: z
    .number()
    .positive()
    .max(10_000_000)
    .refine((n) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-6, 'At most two decimals.')
    .optional(),
});
export type IssueInvoiceBody = z.infer<typeof issueInvoiceBody>;

/** GET /api/partner/invoices?status= ("overdue" = past due and not paid). */
export const partnerInvoicesQuery = z.strictObject({
  status: z.enum([...INVOICE_STATUSES, 'overdue']).optional(),
});

/** POST /api/partner/invoices/:id/paid: the partner confirms the money arrived. */
export const markInvoicePaidBody = z.strictObject({
  paidOn: calendarDate,
  method: z.enum(PAYMENT_METHODS),
});
export type MarkInvoicePaidBody = z.infer<typeof markInvoicePaidBody>;

/** POST /api/partner/invoices/:id/cancel */
export const cancelInvoiceBody = z.strictObject({ reason: z.string().trim().min(3).max(500) });

/** POST /api/owner/invoices/:id/claim-paid: "I have paid". */
export const claimInvoicePaidBody = z.strictObject({ paidOn: calendarDate });

/** GET /api/admin/invoices?status=&partnerId=&overdue= */
export const adminInvoicesQuery = z.strictObject({
  status: z.enum(INVOICE_STATUSES).optional(),
  partnerId: idSchema.optional(),
  overdue: z.enum(['true', 'false']).optional(),
});

const int = z.number().int();
const status = z.enum(INVOICE_STATUSES);
const method = z.enum(PAYMENT_METHODS);
const action = z.enum(['mark_paid', 'mark_not_received', 'cancel', 'claim_paid']);

/** The fields every view of an invoice shares. */
const invoiceCore = z.object({
  id: z.string(),
  number: z.string(),
  requestId: z.string(),
  ref: z.string(),
  status,
  overdue: z.boolean(),
  issueDate: z.string(),
  dueDate: z.string(),
  /** What the owner approved: the quote (L4) and make-safe work (E8). */
  lines: z.array(z.object({ kind: z.enum(['quote', 'make_safe']), fils: int })),
  subtotalFils: int,
  vatFils: int,
  totalFils: int,
  trn: z.string(),
  claimedPaidOn: z.string().nullable(),
  paidOn: z.string().nullable(),
  paidMethod: method.nullable(),
});
export type InvoiceCore = z.infer<typeof invoiceCore>;

/** One invoice as the partner office sees it (its own text decrypted). */
export const partnerInvoice = invoiceCore.extend({
  paymentInstructions: z.string(),
  cancelledAt: int.nullable(),
  actions: z.array(action),
});
export type PartnerInvoice = z.infer<typeof partnerInvoice>;

/** GET /api/partner/invoices */
export const partnerInvoicesResponse = z.object({
  invoices: z.array(partnerInvoice),
  totals: z.object({ outstandingFils: int, overdueFils: int, paidThisMonthFils: int, month: z.string() }),
});

/** GET /api/partner/invoices/ready: finished jobs not invoiced yet, with what the owner approved. */
export const invoiceReadyResponse = z.object({
  jobs: z.array(
    z.object({
      requestId: z.string(),
      ref: z.string(),
      quoteFils: int,
      makeSafeFils: int,
      approvedFils: int,
    }),
  ),
});

/** One invoice as its owner sees it: who to pay and how. */
export const ownerInvoice = invoiceCore.extend({
  partnerName: z.string(),
  paymentInstructions: z.string(),
  actions: z.array(action),
});
export type OwnerInvoice = z.infer<typeof ownerInvoice>;

/** GET /api/owner/invoices */
export const ownerInvoicesResponse = z.object({ invoices: z.array(ownerInvoice), outstandingFils: int });

/** GET /api/requests/:id/invoice (the request's invoice for its owner; null when none is active). */
export const requestInvoiceResponse = z.object({ invoice: ownerInvoice.nullable() });

const sums = { count: int, outstandingFils: int, overdueFils: int, paidFils: int };

/** GET /api/admin/invoices: every invoice, who has paid and who has not, by partner and by owner. */
export const adminInvoicesResponse = z.object({
  invoices: z.array(
    invoiceCore.extend({
      partnerId: z.string(),
      partnerName: z.string(),
      ownerUserId: z.string(),
      ownerName: z.string().nullable(),
      ageDays: int,
      ageing: z.enum(AGEING_BUCKETS).nullable(),
    }),
  ),
  /** Unpaid invoices by age since issue. */
  ageing: z.array(z.object({ bucket: z.enum(AGEING_BUCKETS), count: int, totalFils: int })),
  byPartner: z.array(z.object({ partnerId: z.string(), partnerName: z.string(), ...sums })),
  byOwner: z.array(z.object({ ownerUserId: z.string(), ownerName: z.string().nullable(), ...sums })),
});
export type AdminInvoices = z.infer<typeof adminInvoicesResponse>;

/** Answer to every invoice step. */
export const invoiceStepResponse = z.object({ id: z.string(), status });
