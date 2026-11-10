/** Partner invoices for owners (ADR 0026): amounts, due wording, Home, Payments order, "I have paid", inbox. */
import type { InboxItem, OwnerInvoice } from '@jadplus/shared';
import { describe, expect, it } from 'vitest';
import { attentionItems } from '../src/home/attention.js';
import { langOf } from '../src/i18n/lang.js';
import { inboxTarget, inboxText } from '../src/inbox/wording.js';
import {
  aedFromFils,
  dueText,
  invoiceStatusKey,
  invoicesForHome,
  orderInvoices,
  paidOnDate,
} from '../src/invoices/logic.js';

const en = langOf('en');
const fr = langOf('fr');
const ar = langOf('ar');

const NOW = Date.UTC(2026, 10, 10, 6, 0, 0); // 10:00 Dubai, Tue 10 Nov 2026
const TODAY = '2026-11-10';

const invoice = (over: Partial<OwnerInvoice>): OwnerInvoice => ({
  id: 'inv1',
  number: 'INV-DF-0001',
  requestId: 'r1',
  ref: 'JAD-AB12CD',
  status: 'issued',
  overdue: false,
  issueDate: '2026-11-01',
  dueDate: '2026-11-15',
  lines: [{ kind: 'quote', fils: 100_000 }],
  subtotalFils: 100_000,
  vatFils: 5_000,
  totalFils: 105_000,
  trn: '100000000000003',
  claimedPaidOn: null,
  paidOn: null,
  paidMethod: null,
  partnerName: 'Demo Fixers LLC',
  paymentInstructions: 'IBAN AE00 0000 0000 0000 0000 000',
  actions: ['claim_paid'],
  ...over,
});

describe('ADR 0026: invoice amounts and wording', () => {
  it('shows AED from fils, whole dirhams without decimals and fils when present', () => {
    expect(aedFromFils(105_000, 'en')).toBe('AED 1,050');
    expect(aedFromFils(105_050, 'en')).toBe('AED 1,050.50');
    expect(aedFromFils(5, 'en')).toBe('AED 0.05');
  });

  it('words the due date: today, tomorrow, a date, overdue, paid, cancelled', () => {
    expect(dueText(invoice({ dueDate: TODAY }), TODAY, en)).toBe('Due today');
    expect(dueText(invoice({ dueDate: '2026-11-11' }), TODAY, en)).toBe('Due tomorrow');
    expect(dueText(invoice({}), TODAY, en)).toBe('Due 15 Nov 2026');
    expect(dueText(invoice({ dueDate: '2026-11-01', overdue: true }), TODAY, en)).toBe(
      'Overdue: was due 1 Nov 2026',
    );
    expect(dueText(invoice({ status: 'paid', paidOn: '2026-11-09' }), TODAY, en)).toBe('Paid on 9 Nov 2026');
    expect(dueText(invoice({ status: 'cancelled' }), TODAY, en)).toBe('');
    expect(dueText(invoice({ dueDate: TODAY }), TODAY, fr)).toBe('À payer aujourd’hui');
  });

  it('the status says Overdue only while nobody has said it is paid', () => {
    expect(en.t(invoiceStatusKey(invoice({ overdue: true })))).toBe('Overdue');
    expect(en.t(invoiceStatusKey(invoice({ status: 'claimed_paid', overdue: true })))).toBe(
      'Waiting for the partner to confirm',
    );
    expect(en.t(invoiceStatusKey(invoice({ status: 'paid' })))).toBe('Paid');
  });
});

describe('ADR 0026: Home and Payments', () => {
  it('Home shows unpaid invoices due within 3 days or overdue, earliest first; not after "I have paid"', () => {
    const list = [
      invoice({ id: 'later', dueDate: '2026-11-20' }),
      invoice({ id: 'soon', dueDate: '2026-11-13' }),
      invoice({ id: 'late', dueDate: '2026-11-05', overdue: true }),
      invoice({ id: 'claimed', status: 'claimed_paid', dueDate: TODAY }),
      invoice({ id: 'paid', status: 'paid', dueDate: TODAY }),
    ];
    expect(invoicesForHome(list, TODAY).map((i) => i.id)).toEqual(['late', 'soon']);
  });

  it('adds "Invoice to pay" for owners only, opening the request', () => {
    const base = {
      requests: [],
      overdue: null,
      now: NOW,
      t: en.t,
      label: () => '',
      arrival: () => null,
      invoices: [invoice({ requestId: 'r9', dueDate: TODAY })],
      invoiceDetail: (i: OwnerInvoice) => `${aedFromFils(i.totalFils, 'en')} · ${dueText(i, TODAY, en)}`,
    };
    expect(attentionItems({ ...base, owner: true })).toEqual([
      {
        kind: 'invoice',
        title: 'Invoice to pay',
        detail: 'AED 1,050 · Due today',
        target: { requestId: 'r9' },
      },
    ]);
    expect(attentionItems({ ...base, owner: false })).toEqual([]);
  });

  it('Payments lists unpaid first by due date, then the rest newest first', () => {
    const list = [
      invoice({ id: 'paid-old', status: 'paid', issueDate: '2026-10-01' }),
      invoice({ id: 'b', dueDate: '2026-11-20' }),
      invoice({ id: 'cancelled-new', status: 'cancelled', issueDate: '2026-11-08' }),
      invoice({ id: 'a', status: 'claimed_paid', dueDate: '2026-11-12' }),
    ];
    expect(orderInvoices(list).map((i) => i.id)).toEqual(['a', 'b', 'cancelled-new', 'paid-old']);
  });
});

describe('ADR 0026: "I have paid" date', () => {
  it('today and yesterday on the Dubai calendar', () => {
    expect(paidOnDate('today', '', TODAY)).toEqual({ date: TODAY });
    expect(paidOnDate('yesterday', '', TODAY)).toEqual({ date: '2026-11-09' });
  });

  it('another date must be real, not in the future, at most a year back', () => {
    expect(paidOnDate('other', ' 2026-11-01 ', TODAY)).toEqual({ date: '2026-11-01' });
    expect(paidOnDate('other', '2026-02-30', TODAY)).toEqual({ problem: 'invoice.dateInvalid' });
    expect(paidOnDate('other', '1/11/2026', TODAY)).toEqual({ problem: 'invoice.dateInvalid' });
    expect(paidOnDate('other', '2026-11-11', TODAY)).toEqual({ problem: 'invoice.dateFuture' });
    expect(paidOnDate('other', '2025-11-01', TODAY)).toEqual({ problem: 'invoice.dateOld' });
  });
});

describe('ADR 0026: invoice notifications', () => {
  const item = (over: Partial<InboxItem>): InboxItem => ({
    id: 'i1',
    kind: 'invoice_issued',
    requestId: 'r1',
    tenancyId: null,
    ref: 'JAD-AB12CD',
    at: NOW,
    read: false,
    data: { amountAed: 1050, dueOn: '2026-11-24', invoiceNumber: 'INV-DF-0001' },
    ...over,
  });

  it('a new invoice asks the owner to pay the partner directly', () => {
    expect(inboxText(item({}), en)).toEqual({
      title: 'New invoice to pay',
      detail: 'AED 1,050, due 24 Nov 2026. Pay the partner directly. · JAD-AB12CD',
      icon: 'receipt-outline',
      needsYou: true,
      urgent: false,
    });
  });

  it('overdue, paid, not received, cancelled and the partner office reminder name the invoice', () => {
    expect(inboxText(item({ kind: 'invoice_overdue' }), en).detail).toBe(
      'INV-DF-0001 (AED 1,050) was due 24 Nov 2026. · JAD-AB12CD',
    );
    expect(inboxText(item({ kind: 'invoice_paid' }), en).title).toBe('Payment received');
    expect(inboxText(item({ kind: 'invoice_not_received' }), en).needsYou).toBe(true);
    expect(inboxText(item({ kind: 'invoice_cancelled' }), en).detail).toBe(
      'INV-DF-0001 was cancelled. Nothing to pay on it. · JAD-AB12CD',
    );
    expect(inboxText(item({ kind: 'invoice_paid_claimed' }), en).detail).toBe(
      'Confirm INV-DF-0001 when the money arrives. · JAD-AB12CD',
    );
    expect(inboxText(item({ kind: 'invoice_paid' }), ar).detail).toContain('INV-DF-0001');
  });

  it('owner items open the request; the partner office item opens the job', () => {
    expect(inboxTarget(item({}), 'owner')).toEqual({ requestId: 'r1' });
    expect(inboxTarget(item({ kind: 'invoice_paid_claimed' }), 'partner_admin')).toEqual({ jobId: 'r1' });
  });
});
