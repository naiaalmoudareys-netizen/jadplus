/** Partner invoice rules (ADR 0026): VAT, totals, amount cap, numbers, overdue, ageing, who may do what. */
import { describe, expect, it } from 'vitest';
import {
  ageDays,
  ageingBucket,
  approvedFils,
  canInvoiceStep,
  claimInvoicePaidBody,
  invoiceActions,
  invoiceNumber,
  invoiceSubtotal,
  invoiceTotals,
  invoiceableJob,
  isOverdue,
  issueInvoiceBody,
  markInvoicePaidBody,
  paidOnProblem,
  partnerShortCode,
  trnSchema,
  vatFils,
} from '../src/index.js';

const TODAY = '2026-11-10';

describe('ADR 0026: VAT and totals in fils', () => {
  it('5% VAT on whole fils, halves rounded up, never floating-point drift', () => {
    expect(vatFils(100_000)).toBe(5_000); // AED 1,000.00 → AED 50.00
    expect(vatFils(10)).toBe(1); // 0.5 fils → 1
    expect(vatFils(9)).toBe(0); // 0.45 fils → 0
    expect(vatFils(29)).toBe(1); // 1.45 fils → 1
    expect(vatFils(30)).toBe(2); // 1.5 fils → 2
    expect(vatFils(0)).toBe(0);
    expect(vatFils(123_456_789)).toBe(6_172_839); // 6,172,839.45 → 6,172,839
  });

  it('rejects amounts that are not whole fils', () => {
    expect(() => vatFils(10.5)).toThrow(RangeError);
    expect(() => vatFils(-1)).toThrow(RangeError);
  });

  it('total = subtotal + VAT', () => {
    expect(invoiceTotals(45_010)).toEqual({ subtotalFils: 45_010, vatFils: 2_251, totalFils: 47_261 });
  });
});

describe('ADR 0026 §1: never more than the owner approved', () => {
  const approved = { quoteFils: 40_000, makeSafeFils: 5_000 };

  it('L4/E8: the approved quote plus the make-safe work is the default subtotal', () => {
    expect(approvedFils(approved)).toBe(45_000);
    expect(invoiceSubtotal(approved, null)).toEqual({ ok: true, fils: 45_000 });
  });

  it('a lower amount is allowed, a higher one is refused', () => {
    expect(invoiceSubtotal(approved, 30_000)).toEqual({ ok: true, fils: 30_000 });
    expect(invoiceSubtotal(approved, 45_001).ok).toBe(false);
  });

  it('nothing approved, nothing to invoice', () => {
    expect(invoiceSubtotal({ quoteFils: 0, makeSafeFils: 0 }, null).ok).toBe(false);
  });

  it('A4: only finished work: completed, confirmed or auto-closed', () => {
    expect(invoiceableJob('completed', null)).toBe(true);
    expect(invoiceableJob('closed', 'confirmed')).toBe(true);
    expect(invoiceableJob('closed', 'auto_closed')).toBe(true);
    expect(invoiceableJob('closed', 'quote_declined')).toBe(false);
    expect(invoiceableJob('in_progress', null)).toBe(false);
    expect(invoiceableJob('cancelled', 'cancelled_by_requester')).toBe(false);
  });
});

describe('ADR 0026: invoice numbers per partner', () => {
  it('initials of the company name, legal words left out', () => {
    expect(partnerShortCode('Fictional Fixers LLC')).toBe('FF');
    expect(partnerShortCode('Primary Fixers L.L.C.')).toBe('PF');
    expect(partnerShortCode('Cool Air Tech Services FZE')).toBe('CATS');
    expect(partnerShortCode('Sparkle')).toBe('SPA');
    expect(partnerShortCode('LLC')).toBe('JP');
  });

  it('numbered in order, four digits', () => {
    expect(invoiceNumber('FF', 1)).toBe('INV-FF-0001');
    expect(invoiceNumber('FF', 12_345)).toBe('INV-FF-12345');
  });
});

describe('ADR 0026: overdue and ageing', () => {
  it('overdue is derived: past the due date and not paid', () => {
    expect(isOverdue({ status: 'issued', dueDate: '2026-11-09' }, TODAY)).toBe(true);
    expect(isOverdue({ status: 'claimed_paid', dueDate: '2026-11-09' }, TODAY)).toBe(true);
    expect(isOverdue({ status: 'issued', dueDate: TODAY }, TODAY)).toBe(false);
    expect(isOverdue({ status: 'paid', dueDate: '2026-01-01' }, TODAY)).toBe(false);
    expect(isOverdue({ status: 'cancelled', dueDate: '2026-01-01' }, TODAY)).toBe(false);
  });

  it('ageing buckets 0-14, 15-30, 31-60, 60+ days since issue', () => {
    expect(ageingBucket(TODAY, TODAY)).toBe('0-14');
    expect(ageingBucket('2026-10-27', TODAY)).toBe('0-14'); // 14 days
    expect(ageingBucket('2026-10-26', TODAY)).toBe('15-30');
    expect(ageingBucket('2026-10-11', TODAY)).toBe('15-30'); // 30 days
    expect(ageingBucket('2026-10-10', TODAY)).toBe('31-60');
    expect(ageingBucket('2026-09-11', TODAY)).toBe('31-60'); // 60 days
    expect(ageingBucket('2026-09-10', TODAY)).toBe('60+');
    expect(ageDays('2026-11-12', TODAY)).toBe(0);
  });
});

describe('ADR 0026 §3: who may do what', () => {
  it('the partner office confirms payment, says it did not arrive, or cancels', () => {
    expect(invoiceActions('partner_admin', 'issued')).toEqual(['mark_paid', 'cancel']);
    expect(invoiceActions('partner_admin', 'claimed_paid')).toEqual([
      'mark_paid',
      'mark_not_received',
      'cancel',
    ]);
    expect(invoiceActions('partner_admin', 'paid')).toEqual([]);
    expect(invoiceActions('partner_admin', 'cancelled')).toEqual([]);
  });

  it('the owner can only say "I have paid", once, on an issued invoice', () => {
    expect(invoiceActions('owner', 'issued')).toEqual(['claim_paid']);
    expect(invoiceActions('owner', 'claimed_paid')).toEqual([]);
    expect(canInvoiceStep('owner', 'mark_paid', 'issued')).toBe(false);
    expect(canInvoiceStep('partner_admin', 'claim_paid', 'issued')).toBe(false);
  });

  it('a payment date is not in the future nor over a year back', () => {
    expect(paidOnProblem(TODAY, TODAY)).toBeNull();
    expect(paidOnProblem('2026-11-11', TODAY)).not.toBeNull();
    expect(paidOnProblem('2025-11-09', TODAY)).not.toBeNull();
  });
});

describe('ADR 0026: payloads (C-VAL-1)', () => {
  const valid = {
    requestId: 'r-1',
    trn: '100 1234 5678 9003',
    paymentInstructions: 'IBAN AE07 0000 0000 0000',
  };

  it('TRN: 15 digits, spaces and dashes removed', () => {
    expect(trnSchema.parse('100-123-456-789-003')).toBe('100123456789003');
    expect(trnSchema.safeParse('10012345678900').success).toBe(false);
    expect(trnSchema.safeParse('10012345678900A').success).toBe(false);
  });

  it('issue: due in 14 days by default, unknown keys and fractions of fils refused', () => {
    const body = issueInvoiceBody.parse(valid);
    expect(body.dueInDays).toBe(14);
    expect(body.trn).toBe('100123456789003');
    expect(issueInvoiceBody.safeParse({ ...valid, totalFils: 1 }).success).toBe(false);
    expect(issueInvoiceBody.safeParse({ ...valid, amountAed: 10.005 }).success).toBe(false);
    expect(issueInvoiceBody.safeParse({ ...valid, amountAed: 10.05 }).success).toBe(true);
    expect(issueInvoiceBody.safeParse({ ...valid, dueInDays: 61 }).success).toBe(false);
    expect(issueInvoiceBody.safeParse({ ...valid, paymentInstructions: 'x'.repeat(501) }).success).toBe(
      false,
    );
  });

  it('paid: a real date and a known method; claim: a real date', () => {
    expect(markInvoicePaidBody.safeParse({ paidOn: TODAY, method: 'card' }).success).toBe(true);
    expect(markInvoicePaidBody.safeParse({ paidOn: TODAY, method: 'crypto' }).success).toBe(false);
    expect(claimInvoicePaidBody.safeParse({ paidOn: '2026-02-30' }).success).toBe(false);
  });
});
