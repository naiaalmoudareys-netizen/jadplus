/**
 * Partner invoices (ADR 0026): after paid work the partner office issues an invoice in JAD+; the owner pays the
 * partner directly and may say so; the office marks it paid, says the money has not arrived, or cancels it.
 * Some stay unpaid, and some pass their due date (the daily invoice clock tells the owner).
 */
import { dubaiDate } from '@jadplus/shared';
import { post } from './actors.js';
import type { Company, Provider } from './company.js';
import type { Party } from './jobs.js';
import { DAY, HOUR } from './sim.js';

/** A fictional tax registration number and payment line (no contact details, as the API requires). */
const TRN = '100000000000003';
const instructions = (p: Provider): string =>
  `Bank transfer to IBAN AE07 0000 0000 0000 0000 000 (${p.name}). Please quote the invoice number.`;

export async function invoiceStory(c: Company, x: Party, requestId: string, p: Provider): Promise<void> {
  const fate = c.r.next();
  const overdue = fate >= 0.55 && fate < 0.67;
  const inv = await post<{ id: string }>(c.w, p.office, '/api/partner/invoices', {
    requestId,
    trn: TRN,
    paymentInstructions: instructions(p),
    dueInDays: overdue ? 7 : 14,
  });
  if (fate >= 0.4 && fate < 0.67) return;
  await c.sim.wait(c.r.int(1, 9) * DAY);
  const paidOn = dubaiDate(c.sim.now - c.r.int(0, 1) * DAY);
  if (fate < 0.25) {
    await post(c.w, p.office, `/api/partner/invoices/${inv.id}/paid`, {
      paidOn,
      method: c.r.pick(['bank_transfer', 'card'] as const),
    });
    return;
  }
  if (fate >= 0.93) {
    await post(c.w, p.office, `/api/partner/invoices/${inv.id}/cancel`, {
      reason: 'Issued with the wrong amount; a corrected invoice follows.',
    });
    return;
  }
  await post(c.w, x.owner.actor, `/api/owner/invoices/${inv.id}/claim-paid`, { paidOn });
  if (fate >= 0.85) {
    await c.sim.wait(c.r.int(4, 30) * HOUR);
    await post(c.w, p.office, `/api/partner/invoices/${inv.id}/not-received`);
    return;
  }
  if (fate >= 0.78) return;
  await c.sim.wait(c.r.int(4, 48) * HOUR);
  await post(c.w, p.office, `/api/partner/invoices/${inv.id}/paid`, { paidOn, method: 'bank_transfer' });
}
