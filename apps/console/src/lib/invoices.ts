/**
 * Partner invoices on the console (ADR 0026): how statuses, payment methods and ageing read, the issue form's
 * amount check and VAT preview, the "mark paid" check, and which invoices need the office's attention. The
 * rules themselves (VAT, the cap at what the owner approved, payment dates) are the shared ones, so the form
 * shows exactly what the API will accept.
 */
import {
  aedToFils,
  invoiceSubtotal,
  invoiceTotals,
  issueInvoiceBody,
  markInvoicePaidBody,
  paidOnProblem,
  type AgeingBucket,
  type InvoiceStatus,
  type InvoiceTotals,
  type IssueInvoiceBody,
  type MarkInvoicePaidBody,
  type PaymentMethod,
} from '@jadplus/shared';
import type { Tone } from './format';

export const INVOICE_STATUS_LABELS: Readonly<Record<InvoiceStatus, readonly [string, Tone]>> = {
  issued: ['Waiting for payment', 'warn'],
  claimed_paid: ['Owner says paid', 'bad'],
  paid: ['Paid', 'good'],
  cancelled: ['Cancelled', 'calm'],
};

export const PAYMENT_METHOD_LABELS: Readonly<Record<PaymentMethod, string>> = {
  bank_transfer: 'Bank transfer',
  card: 'Card',
  cash: 'Cash',
  other: 'Other',
};

export const AGEING_LABELS: Readonly<Record<AgeingBucket, string>> = {
  '0-14': '0 to 14 days',
  '15-30': '15 to 30 days',
  '31-60': '31 to 60 days',
  '60+': 'Over 60 days',
};

/** "Waiting for payment", or "Overdue" when the due date has passed and the money has not arrived. */
export function invoiceStatusText(i: {
  readonly status: InvoiceStatus;
  readonly overdue: boolean;
}): readonly [string, Tone] {
  if (i.overdue && i.status === 'issued') return ['Overdue', 'bad'];
  return INVOICE_STATUS_LABELS[i.status];
}

/** Invoices where the owner said "I have paid" and the office has not confirmed yet: these come first. */
export function awaitingConfirmation<T extends { readonly status: InvoiceStatus }>(
  invoices: readonly T[],
): T[] {
  return invoices.filter((i) => i.status === 'claimed_paid');
}

export type AmountCheck =
  | { readonly ok: true; readonly totals: InvoiceTotals; readonly amountAed: number | undefined }
  | { readonly ok: false; readonly problem: string };

/** "1250", "1250.5" or "1250.50": digits with at most two decimals (no signs, no grouping). */
function isAedAmount(text: string): boolean {
  const [whole = '', decimals, ...rest] = text.split('.');
  return (
    rest.length === 0 &&
    whole.length <= 9 &&
    /^\d+$/.test(whole) &&
    (decimals === undefined || /^\d{1,2}$/.test(decimals))
  );
}

/**
 * The invoice amount typed in AED before VAT, checked against what the owner approved (ADR 0026 §1). Left
 * empty, the invoice is for the full approved amount (the API's default).
 */
export function checkAmount(approvedFils: number, typed: string): AmountCheck {
  const text = typed.trim();
  let requested: number | null = null;
  if (text !== '') {
    if (!isAedAmount(text)) {
      return { ok: false, problem: 'Type the amount in AED, with at most two decimals.' };
    }
    requested = aedToFils(Number(text));
    if (requested <= 0) return { ok: false, problem: 'The amount must be more than zero.' };
  }
  const subtotal = invoiceSubtotal({ quoteFils: approvedFils, makeSafeFils: 0 }, requested);
  if (!subtotal.ok) return subtotal;
  return {
    ok: true,
    totals: invoiceTotals(subtotal.fils),
    amountAed: requested === null || requested === approvedFils ? undefined : requested / 100,
  };
}

export interface IssueDraft {
  readonly requestId: string;
  readonly approvedFils: number;
  readonly amount: string;
  readonly trn: string;
  readonly paymentInstructions: string;
  readonly dueInDays: string;
}

/** The issue form as the API's body, or the first problem in plain words. */
export function issueBody(
  d: IssueDraft,
): { readonly ok: true; readonly body: IssueInvoiceBody } | { readonly ok: false; readonly problem: string } {
  const amount = checkAmount(d.approvedFils, d.amount);
  if (!amount.ok) return amount;
  const due = d.dueInDays.trim();
  const parsed = issueInvoiceBody.safeParse({
    requestId: d.requestId,
    trn: d.trn,
    paymentInstructions: d.paymentInstructions,
    ...(due === '' ? {} : { dueInDays: Number(due) }),
    ...(amount.amountAed === undefined ? {} : { amountAed: amount.amountAed }),
  });
  if (!parsed.success) return { ok: false, problem: issueProblem(parsed.error.issues[0]?.path[0]) };
  return { ok: true, body: parsed.data };
}

function issueProblem(field: PropertyKey | undefined): string {
  switch (field) {
    case 'trn':
      return 'A UAE TRN is 15 digits.';
    case 'paymentInstructions':
      return 'Say how the owner pays you (bank details or a payment link), 5 to 500 characters.';
    case 'dueInDays':
      return 'Days to pay must be a whole number from 0 to 60.';
    default:
      return 'Check the invoice details.';
  }
}

/** "Mark paid" as the API's body, or the problem (no future dates, nothing over a year back). */
export function paidBody(
  paidOn: string,
  method: PaymentMethod,
  today: string,
):
  | { readonly ok: true; readonly body: MarkInvoicePaidBody }
  | { readonly ok: false; readonly problem: string } {
  const parsed = markInvoicePaidBody.safeParse({ paidOn, method });
  if (!parsed.success) return { ok: false, problem: 'Choose the date the money arrived.' };
  const problem = paidOnProblem(parsed.data.paidOn, today);
  return problem === null ? { ok: true, body: parsed.data } : { ok: false, problem };
}

export interface InvoiceSums {
  readonly count: number;
  readonly outstandingFils: number;
  readonly overdueFils: number;
  readonly paidFils: number;
}

/** The whole list's totals, from the per-partner totals the API sends (every invoice has one partner). */
export function sumInvoices(rows: readonly InvoiceSums[]): InvoiceSums {
  return rows.reduce<InvoiceSums>(
    (s, r) => ({
      count: s.count + r.count,
      outstandingFils: s.outstandingFils + r.outstandingFils,
      overdueFils: s.overdueFils + r.overdueFils,
      paidFils: s.paidFils + r.paidFils,
    }),
    { count: 0, outstandingFils: 0, overdueFils: 0, paidFils: 0 },
  );
}

/** "Has paid" / "Has not paid" for an owner or a partner's row: anything still outstanding is not paid. */
export function paidStanding(s: InvoiceSums): readonly [string, Tone] {
  if (s.overdueFils > 0) return ['Overdue', 'bad'];
  if (s.outstandingFils > 0) return ['Not paid yet', 'warn'];
  return s.paidFils > 0 ? ['All paid', 'good'] : ['Nothing due', 'calm'];
}
