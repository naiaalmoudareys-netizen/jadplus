/**
 * Partner invoices (ADR 0026): the partner office issues and settles, the owner sees who to pay and says
 * "I have paid". JAD+ never holds the money. L4, E8, A4, C-AZ-1/2, C-PD-2, C-AUD-1.
 */
import {
  invoiceReadyResponse,
  ownerInvoicesResponse,
  partnerInvoice,
  partnerInvoicesResponse,
  requestInvoiceResponse,
} from '@jadplus/shared';
import { describe, expect, it } from 'vitest';
import { rows, world } from './emergency-world.js';
import { PAY, TRN, backdate, get, inboxKinds, issue, issued, job, office, post } from './invoices-world.js';

describe('partner office issues an invoice (ADR 0026 §1)', () => {
  it('L4/E8: approved quote + make-safe, 5% VAT, numbered per partner, due in 14 days; the owner is told', async () => {
    const w = await world();
    const token = await office(w);
    job(w, 'r1', { quoteFils: 40_000, makeSafeFils: 5_010 });
    job(w, 'r2', { status: 'closed', closeReason: 'auto_closed' });
    const ready = invoiceReadyResponse.parse(
      await (await get(w, '/api/partner/invoices/ready', token)).json(),
    );
    expect(ready.jobs.map((j) => [j.requestId, j.approvedFils])).toEqual([
      ['r1', 45_010],
      ['r2', 40_000],
    ]);

    const res = await issue(w, token, 'r1', { trn: '100-1234-5678-9003' });
    expect(res.status).toBe(201);
    const inv = partnerInvoice.parse(await res.json());
    expect(inv).toMatchObject({
      number: 'INV-PF-0001',
      ref: 'JAD-R1',
      status: 'issued',
      overdue: false,
      issueDate: '2026-11-09',
      dueDate: '2026-11-23',
      lines: [
        { kind: 'quote', fils: 40_000 },
        { kind: 'make_safe', fils: 5_010 },
      ],
      subtotalFils: 45_010,
      vatFils: 2_251,
      totalFils: 47_261,
      trn: TRN,
      paymentInstructions: PAY,
      actions: ['mark_paid', 'cancel'],
    });
    const second = partnerInvoice.parse(await (await issue(w, token, 'r2')).json());
    expect(second.number).toBe('INV-PF-0002');
    expect((await get(w, '/api/partner/invoices/ready', token)).status).toBe(200);
    expect(
      invoiceReadyResponse.parse(await (await get(w, '/api/partner/invoices/ready', token)).json()).jobs,
    ).toEqual([]);

    expect(await inboxKinds(w, w.ownerToken)).toContain('invoice_issued');
    expect(await inboxKinds(w, w.tenantToken)).not.toContain('invoice_issued');
  });

  it('C-PD-2: payment instructions are stored only encrypted; the audit entry holds no personal data', async () => {
    const w = await world();
    const token = await office(w);
    const id = await issued(w, token, job(w, 'r1'));
    const [row] = rows(w, 'SELECT payment_instructions_enc FROM invoices WHERE id = ?', id) as {
      payment_instructions_enc: Uint8Array;
    }[];
    expect(new TextDecoder('latin1').decode(row?.payment_instructions_enc ?? new Uint8Array())).not.toContain(
      'IBAN',
    );
    const audit = rows(w, "SELECT detail FROM audit_log WHERE action = 'invoice_issued'") as {
      detail: string;
    }[];
    expect(audit).toHaveLength(1);
    expect(audit[0]?.detail).not.toMatch(/IBAN|AE07|Primary/);
  });

  it('a lower amount is allowed; more than the owner approved, or unfinished work, is refused', async () => {
    const w = await world();
    const token = await office(w);
    job(w, 'r1');
    expect((await issue(w, token, 'r1', { amountAed: 400.01 })).status).toBe(409);
    const lower = await issue(w, token, 'r1', { amountAed: 350.5 });
    expect(partnerInvoice.parse(await lower.json())).toMatchObject({ subtotalFils: 35_050, vatFils: 1_753 });
    expect((await issue(w, token, 'r1')).status).toBe(409); // one invoice per request
    job(w, 'r2', { status: 'in_progress' });
    expect((await issue(w, token, 'r2')).status).toBe(409);
    job(w, 'r3', { quoteFils: 0 });
    expect((await issue(w, token, 'r3')).status).toBe(409);
    job(w, 'r4', { status: 'closed', closeReason: 'quote_declined' });
    expect((await issue(w, token, 'r4')).status).toBe(409);
  });

  it('C-VAL-1: a TRN that is not 15 digits, or unknown fields, are refused', async () => {
    const w = await world();
    const token = await office(w);
    job(w, 'r1');
    expect((await issue(w, token, 'r1', { trn: '12345' })).status).toBe(400);
    expect((await issue(w, token, 'r1', { totalFils: 1 })).status).toBe(400);
    expect((await issue(w, token, 'r1', { paymentInstructions: '' })).status).toBe(400);
  });

  it('P2: payment instructions keep bank details and links but refuse a phone number or email', async () => {
    const w = await world();
    const token = await office(w);
    job(w, 'r1');
    const phone = await issue(w, token, 'r1', {
      paymentInstructions: 'Pay by transfer or call +971 50 000 0000',
    });
    expect(phone.status).toBe(400);
    expect(JSON.stringify(await phone.json())).toContain('phone numbers, emails');
    expect(
      (await issue(w, token, 'r1', { paymentInstructions: 'Send proof to pay@example.com' })).status,
    ).toBe(400);
    const link = await issue(w, token, 'r1', {
      paymentInstructions:
        'Bank: Example Bank. IBAN AE07 0000 0000 0000 0000 000. Or pay online: https://pay.example.com/inv',
    });
    expect(link.status).toBe(201);
  });

  it('C-AZ-1/2: technicians, residents and another company cannot issue or list', async () => {
    const w = await world();
    const token = await office(w);
    const other = await office(w, 'p-backup', 'office.two@example.com');
    job(w, 'r1');
    expect((await issue(w, w.primaryToken, 'r1')).status).toBe(403);
    expect((await issue(w, w.ownerToken, 'r1')).status).toBe(403);
    expect((await issue(w, other, 'r1')).status).toBe(404);
    const id = await issued(w, token, 'r1');
    expect((await get(w, '/api/partner/invoices', w.primaryToken)).status).toBe(403);
    const theirs = partnerInvoicesResponse.parse(await (await get(w, '/api/partner/invoices', other)).json());
    expect(theirs.invoices).toEqual([]);
    expect(
      (await post(w, `/api/partner/invoices/${id}/paid`, other, { paidOn: '2026-11-09', method: 'cash' }))
        .status,
    ).toBe(404);
  });
});

describe('the owner pays the partner directly (ADR 0026 §2-3)', () => {
  it('the owner sees who to pay and how; tenants never see invoices', async () => {
    const w = await world();
    const token = await office(w);
    const id = await issued(w, token, job(w, 'r1'));
    const list = ownerInvoicesResponse.parse(
      await (await get(w, '/api/owner/invoices', w.ownerToken)).json(),
    );
    expect(list.outstandingFils).toBe(42_000);
    expect(list.invoices[0]).toMatchObject({
      id,
      partnerName: 'Primary Fixers LLC',
      paymentInstructions: PAY,
      actions: ['claim_paid'],
    });
    const one = requestInvoiceResponse.parse(
      await (await get(w, '/api/requests/r1/invoice', w.ownerToken)).json(),
    );
    expect(one.invoice?.id).toBe(id);
    expect((await get(w, '/api/owner/invoices', w.tenantToken)).status).toBe(403);
    expect((await get(w, '/api/requests/r1/invoice', w.tenantToken)).status).toBe(403);
  });

  it('C-AZ-2: another owner sees nothing and cannot claim', async () => {
    const w = await world();
    const token = await office(w);
    const id = await issued(w, token, job(w, 'r1'));
    await w.h.addUser({ email: 'other.owner@example.com', roles: ['owner'] });
    const other = await w.h.signIn('other.owner@example.com');
    const list = ownerInvoicesResponse.parse(await (await get(w, '/api/owner/invoices', other)).json());
    expect(list.invoices).toEqual([]);
    expect((await get(w, '/api/requests/r1/invoice', other)).status).toBe(404);
    expect(
      (await post(w, `/api/owner/invoices/${id}/claim-paid`, other, { paidOn: '2026-11-09' })).status,
    ).toBe(404);
  });

  it('"I have paid" asks the office (not the technicians) to confirm; the office confirms or says not received', async () => {
    const w = await world();
    const token = await office(w);
    const id = await issued(w, token, job(w, 'r1'));
    expect(
      (await post(w, `/api/owner/invoices/${id}/claim-paid`, w.ownerToken, { paidOn: '2026-11-10' })).status,
    ).toBe(400);
    const claim = await post(w, `/api/owner/invoices/${id}/claim-paid`, w.ownerToken, {
      paidOn: '2026-11-08',
    });
    expect(await claim.json()).toEqual({ id, status: 'claimed_paid' });
    expect(
      (await post(w, `/api/owner/invoices/${id}/claim-paid`, w.ownerToken, { paidOn: '2026-11-08' })).status,
    ).toBe(409);
    expect(await inboxKinds(w, token)).toContain('invoice_paid_claimed');
    expect(await inboxKinds(w, w.primaryToken)).not.toContain('invoice_paid_claimed');

    expect((await post(w, `/api/partner/invoices/${id}/not-received`, token)).status).toBe(200);
    expect(await inboxKinds(w, w.ownerToken)).toContain('invoice_not_received');
    const again = ownerInvoicesResponse.parse(
      await (await get(w, '/api/owner/invoices', w.ownerToken)).json(),
    );
    expect(again.invoices[0]).toMatchObject({ status: 'issued', claimedPaidOn: null });

    const paid = await post(w, `/api/partner/invoices/${id}/paid`, token, {
      paidOn: '2026-11-09',
      method: 'bank_transfer',
    });
    expect(await paid.json()).toEqual({ id, status: 'paid' });
    expect(await inboxKinds(w, w.ownerToken)).toContain('invoice_paid');
    expect(
      (await post(w, `/api/partner/invoices/${id}/cancel`, token, { reason: 'Issued twice.' })).status,
    ).toBe(409);
    const actions = rows(w, "SELECT action FROM audit_log WHERE target_type = 'invoice' ORDER BY seq") as {
      action: string;
    }[];
    expect(actions.map((a) => a.action)).toEqual([
      'invoice_issued',
      'invoice_payment_claimed',
      'invoice_marked_not_received',
      'invoice_marked_paid',
    ]);
  });
});

describe('partner office list, cancel and overdue (ADR 0026 §3-4)', () => {
  it('totals: outstanding, overdue and paid this month; a cancelled invoice can be replaced', async () => {
    const w = await world();
    const token = await office(w);
    const a = await issued(w, token, job(w, 'r1'));
    const b = await issued(w, token, job(w, 'r2', { quoteFils: 10_000 }));
    await post(w, `/api/partner/invoices/${b}/paid`, token, { paidOn: '2026-11-09', method: 'card' });
    backdate(w, a, 15);
    const list = partnerInvoicesResponse.parse(await (await get(w, '/api/partner/invoices', token)).json());
    expect(list.totals).toEqual({
      outstandingFils: 42_000,
      overdueFils: 42_000,
      paidThisMonthFils: 10_500,
      month: '2026-11',
    });
    const overdue = partnerInvoicesResponse.parse(
      await (await get(w, '/api/partner/invoices?status=overdue', token)).json(),
    );
    expect(overdue.invoices.map((i) => [i.id, i.overdue])).toEqual([[a, true]]);
    expect((await get(w, '/api/partner/invoices?status=late', token)).status).toBe(400);

    expect((await post(w, `/api/partner/invoices/${a}/cancel`, token, { reason: '' })).status).toBe(400);
    expect(
      (await post(w, `/api/partner/invoices/${a}/cancel`, token, { reason: 'Wrong amount.' })).status,
    ).toBe(200);
    expect(await inboxKinds(w, w.ownerToken)).toContain('invoice_cancelled');
    const [row] = rows(w, 'SELECT cancel_reason_enc FROM invoices WHERE id = ?', a) as {
      cancel_reason_enc: Uint8Array;
    }[];
    expect(new TextDecoder('latin1').decode(row?.cancel_reason_enc ?? new Uint8Array())).not.toContain(
      'Wrong',
    );
    const replaced = partnerInvoice.parse(await (await issue(w, token, 'r1')).json());
    expect(replaced.number).toBe('INV-PF-0003');
    const one = requestInvoiceResponse.parse(
      await (await get(w, '/api/requests/r1/invoice', w.ownerToken)).json(),
    );
    expect(one.invoice?.id).toBe(replaced.id);
  });
});
