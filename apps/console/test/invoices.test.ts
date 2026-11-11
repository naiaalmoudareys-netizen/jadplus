// Partner invoices on the console (ADR 0026): status words, the issue form's checks, "mark paid" and totals.
import { describe, expect, it } from 'vitest';
import {
  awaitingConfirmation,
  checkAmount,
  invoiceStatusText,
  issueBody,
  paidBody,
  paidStanding,
  sumInvoices,
} from '../src/lib/invoices';

const ID = 'req_0001';
const TRN = '100200300400500';
const draft = {
  requestId: ID,
  approvedFils: 100_000,
  amount: '',
  trn: TRN,
  paymentInstructions: 'Bank transfer to the account on our letterhead.',
  dueInDays: '14',
};

describe('invoice status words (ADR 0026 §3)', () => {
  it('an issued invoice past its due date reads "Overdue"', () => {
    expect(invoiceStatusText({ status: 'issued', overdue: true })).toEqual(['Overdue', 'bad']);
    expect(invoiceStatusText({ status: 'issued', overdue: false })[0]).toBe('Waiting for payment');
  });

  it('"I have paid" stays visible even when overdue, so the office confirms it', () => {
    expect(invoiceStatusText({ status: 'claimed_paid', overdue: true })[0]).toBe('Owner says paid');
  });

  it('lists only the invoices waiting for the office to confirm the owner\'s "I have paid"', () => {
    const list = [
      { id: 'a', status: 'issued' as const },
      { id: 'b', status: 'claimed_paid' as const },
      { id: 'c', status: 'paid' as const },
    ];
    expect(awaitingConfirmation(list).map((i) => i.id)).toEqual(['b']);
  });
});

describe('issue form (ADR 0026 §1: never more than the owner approved, 5% VAT)', () => {
  it('empty amount invoices the full approved amount with 5% VAT', () => {
    const c = checkAmount(100_000, '');
    expect(c).toEqual({
      ok: true,
      totals: { subtotalFils: 100_000, vatFils: 5_000, totalFils: 105_000 },
      amountAed: undefined,
    });
  });

  it('a lower amount is sent in AED; VAT rounds to the nearest fils', () => {
    const c = checkAmount(100_000, '250.10');
    expect(c.ok && c.totals).toEqual({ subtotalFils: 25_010, vatFils: 1_251, totalFils: 26_261 });
    expect(c.ok && c.amountAed).toBe(250.1);
  });

  it('refuses more than approved, zero, and badly typed amounts', () => {
    expect(checkAmount(100_000, '1000.01')).toEqual({
      ok: false,
      problem: 'An invoice cannot be more than the owner approved.',
    });
    expect(checkAmount(100_000, '0').ok).toBe(false);
    expect(checkAmount(100_000, '12.345').ok).toBe(false);
    expect(checkAmount(100_000, 'abc').ok).toBe(false);
  });

  it('builds the API body, removing spaces typed in the TRN', () => {
    const r = issueBody({ ...draft, trn: '100 200 300 400 500', amount: '500' });
    expect(r).toEqual({
      ok: true,
      body: {
        requestId: ID,
        trn: TRN,
        paymentInstructions: draft.paymentInstructions,
        dueInDays: 14,
        amountAed: 500,
      },
    });
  });

  it('names the field that is wrong', () => {
    expect(issueBody({ ...draft, trn: '123' })).toEqual({ ok: false, problem: 'A UAE TRN is 15 digits.' });
    expect(issueBody({ ...draft, paymentInstructions: 'IBAN' }).ok).toBe(false);
    expect(issueBody({ ...draft, dueInDays: '61' })).toEqual({
      ok: false,
      problem: 'Days to pay must be a whole number from 0 to 60.',
    });
  });
});

describe('mark paid (ADR 0026 §3)', () => {
  it('accepts today or a past date, not a future one or over a year back', () => {
    expect(paidBody('2026-11-10', 'cash', '2026-11-11')).toEqual({
      ok: true,
      body: { paidOn: '2026-11-10', method: 'cash' },
    });
    expect(paidBody('2026-11-12', 'cash', '2026-11-11').ok).toBe(false);
    expect(paidBody('2025-11-01', 'card', '2026-11-11').ok).toBe(false);
    expect(paidBody('', 'card', '2026-11-11').ok).toBe(false);
  });
});

describe('who has paid (ADR 0026 §4)', () => {
  const row = (outstandingFils: number, overdueFils: number, paidFils: number) => ({
    count: 1,
    outstandingFils,
    overdueFils,
    paidFils,
  });

  it('adds up the per-partner totals', () => {
    expect(sumInvoices([row(100, 50, 0), row(0, 0, 300)])).toEqual({
      count: 2,
      outstandingFils: 100,
      overdueFils: 50,
      paidFils: 300,
    });
    expect(sumInvoices([]).count).toBe(0);
  });

  it('reads overdue first, then not paid, then all paid', () => {
    expect(paidStanding(row(100, 100, 0))[0]).toBe('Overdue');
    expect(paidStanding(row(100, 0, 0))[0]).toBe('Not paid yet');
    expect(paidStanding(row(0, 0, 100))[0]).toBe('All paid');
    expect(paidStanding(row(0, 0, 0))[0]).toBe('Nothing due');
  });
});
