/**
 * Partner invoices (ADR 0026): JAD+ records the partner's invoice and whether it is paid; it never holds or moves
 * the money. The owner pays the partner directly. Pure rules: VAT, totals, invoice numbers, overdue and ageing,
 * and who may take which step. Money is in fils (1 AED = 100 fils), always whole numbers.
 */
import type { CloseReason, Status } from '../lifecycle.js';
import { daysBetween } from '../tenancy.js';

/** Invoice statuses. "Overdue" is not a status: it is derived from the due date (isOverdue). */
export const INVOICE_STATUSES = ['issued', 'claimed_paid', 'paid', 'cancelled'] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

/** Statuses still waiting for the money (the owner may have said "I have paid", the partner has not confirmed). */
export const UNPAID_INVOICE_STATUSES: readonly InvoiceStatus[] = ['issued', 'claimed_paid'];

/** How the owner paid the partner. JAD+ never sees card details: this is only the method's name. */
export const PAYMENT_METHODS = ['bank_transfer', 'card', 'cash', 'other'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/** UAE VAT, 5 % (ADR 0026). */
export const VAT_PERCENT = 5;
/** Days the owner has to pay unless the partner sets another term. */
export const DEFAULT_DUE_DAYS = 14;
/** Longest payment term a partner may give. */
export const MAX_DUE_DAYS = 60;
/** Longest payment instructions text (bank details or a payment link). */
export const PAYMENT_INSTRUCTIONS_MAX = 500;
/** How far back a payment date may go (a payment at the door can predate the invoice). */
export const PAID_ON_MAX_AGE_DAYS = 365;

/**
 * VAT on a subtotal, rounded to the nearest fils with halves rounded up (FTA: per invoice, to the nearest
 * fils). Integer arithmetic only, so 0.5 fils never turns into a floating-point surprise.
 */
export function vatFils(subtotalFils: number): number {
  if (!Number.isSafeInteger(subtotalFils) || subtotalFils < 0) {
    throw new RangeError('The subtotal must be a whole number of fils, zero or more.');
  }
  return Math.floor((subtotalFils * VAT_PERCENT + 50) / 100);
}

export interface InvoiceTotals {
  readonly subtotalFils: number;
  readonly vatFils: number;
  readonly totalFils: number;
}

export function invoiceTotals(subtotalFils: number): InvoiceTotals {
  const vat = vatFils(subtotalFils);
  return { subtotalFils, vatFils: vat, totalFils: subtotalFils + vat };
}

/** What the owner approved for this partner on the request: the approved quote (L4) and the make-safe work (E8). */
export interface ApprovedAmounts {
  readonly quoteFils: number;
  readonly makeSafeFils: number;
}

export function approvedFils(a: ApprovedAmounts): number {
  return a.quoteFils + a.makeSafeFils;
}

/**
 * The invoice subtotal: what the owner approved, or a lower amount the partner chose. Never more than the owner
 * approved (ADR 0026 §1). Returns the problem in plain words, or the subtotal.
 */
export function invoiceSubtotal(
  approved: ApprovedAmounts,
  requestedFils: number | null,
): { readonly ok: true; readonly fils: number } | { readonly ok: false; readonly problem: string } {
  const max = approvedFils(approved);
  if (max <= 0)
    return {
      ok: false,
      problem: 'Nothing on this job was approved by the owner, so there is nothing to invoice.',
    };
  if (requestedFils === null) return { ok: true, fils: max };
  if (requestedFils > max)
    return { ok: false, problem: 'An invoice cannot be more than the owner approved.' };
  return { ok: true, fils: requestedFils };
}

/**
 * A job can be invoiced once the work is finished: marked done (completed), confirmed by the resident, or closed
 * automatically 72 hours after it was marked done (A4).
 */
export function invoiceableJob(status: Status, closeReason: CloseReason | null): boolean {
  return (
    status === 'completed' ||
    (status === 'closed' && (closeReason === 'confirmed' || closeReason === 'auto_closed'))
  );
}

/** Words left out of a company's short code: they say what kind of company it is, not which one. */
const LEGAL_WORDS = new Set([
  'LLC',
  'FZE',
  'FZCO',
  'FZ',
  'LTD',
  'CO',
  'COMPANY',
  'TRADING',
  'THE',
  'AND',
  'DMCC',
]);

/**
 * The partner's short code for invoice numbers: initials of its name ("Fictional Fixers LLC" → "FF"), or the
 * first three letters of a one-word name. Letters and digits only, 2 to 4 characters, never empty.
 */
export function partnerShortCode(name: string): string {
  const words = name
    .toUpperCase()
    .replace(/\./g, '')
    .split(/[^A-Z0-9]+/)
    .filter((w) => w.length > 0 && !LEGAL_WORDS.has(w));
  const initials = words.map((w) => w[0] ?? '').join('');
  const code = initials.length >= 2 ? initials : (words[0] ?? '').slice(0, 3);
  return code.length >= 2 ? code.slice(0, 4) : 'JP';
}

/** "INV-FF-0001": per partner, numbered in order. */
export function invoiceNumber(shortCode: string, seq: number): string {
  return `INV-${shortCode}-${String(seq).padStart(4, '0')}`;
}

/** Past its due date and still not paid (the owner saying "I have paid" does not stop the clock). */
export function isOverdue(
  invoice: { readonly status: InvoiceStatus; readonly dueDate: string },
  today: string,
): boolean {
  return UNPAID_INVOICE_STATUSES.includes(invoice.status) && today > invoice.dueDate;
}

/** Ageing of an unpaid invoice, in days since it was issued. */
export const AGEING_BUCKETS = ['0-14', '15-30', '31-60', '60+'] as const;
export type AgeingBucket = (typeof AGEING_BUCKETS)[number];

export function ageDays(issueDate: string, today: string): number {
  return Math.max(0, daysBetween(issueDate, today));
}

export function ageingBucket(issueDate: string, today: string): AgeingBucket {
  const days = ageDays(issueDate, today);
  if (days <= 14) return '0-14';
  if (days <= 30) return '15-30';
  if (days <= 60) return '31-60';
  return '60+';
}

/** The steps on an invoice, and who takes them. */
export type InvoiceAction = 'mark_paid' | 'mark_not_received' | 'cancel' | 'claim_paid';
export type InvoiceActor = 'partner_admin' | 'owner';

const STEPS: Readonly<
  Record<InvoiceAction, { readonly by: InvoiceActor; readonly from: readonly InvoiceStatus[] }>
> = {
  // The partner office confirms the money arrived, with or without the owner's "I have paid".
  mark_paid: { by: 'partner_admin', from: ['issued', 'claimed_paid'] },
  // The owner said "I have paid" but the money has not arrived: back to issued.
  mark_not_received: { by: 'partner_admin', from: ['claimed_paid'] },
  // Issued in error: the partner cancels it (and may issue a new one).
  cancel: { by: 'partner_admin', from: ['issued', 'claimed_paid'] },
  // The owner says "I have paid"; the partner is reminded to confirm.
  claim_paid: { by: 'owner', from: ['issued'] },
};

/** Where each step leaves the invoice. */
export const INVOICE_STEP_RESULT: Readonly<Record<InvoiceAction, InvoiceStatus>> = {
  mark_paid: 'paid',
  mark_not_received: 'issued',
  cancel: 'cancelled',
  claim_paid: 'claimed_paid',
};

export function canInvoiceStep(actor: InvoiceActor, action: InvoiceAction, status: InvoiceStatus): boolean {
  const step = STEPS[action];
  return step.by === actor && step.from.includes(status);
}

/** The steps the person may take now, for the app's buttons. */
export function invoiceActions(actor: InvoiceActor, status: InvoiceStatus): InvoiceAction[] {
  return (Object.keys(STEPS) as InvoiceAction[]).filter((a) => canInvoiceStep(actor, a, status));
}

/** A payment date must not be in the future, nor more than a year back. */
export function paidOnProblem(paidOn: string, today: string): string | null {
  if (paidOn > today) return 'The payment date cannot be in the future.';
  if (daysBetween(paidOn, today) > PAID_ON_MAX_AGE_DAYS) return 'The payment date is more than a year ago.';
  return null;
}
