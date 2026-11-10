/** The request journey after the partner (ADR 0018): L4, A2, A3, A4, A5, E10, S5. */
import { describe, expect, it } from 'vitest';
import {
  autoCloseAt,
  bookVisitBody,
  canTransition,
  confirmation,
  jobActions,
  quoteDecision,
  quoteExpiresAt,
  ratingBody,
  sendQuoteBody,
  toFils,
  visitWindowAllowed,
  type JobState,
} from '../src/index.js';

const HOUR = 3_600_000;
const base: JobState = {
  status: 'assigned',
  isEmergency: false,
  acknowledged: false,
  pendingQuote: false,
  quotesSent: 0,
  hasPartner: true,
  rated: false,
  closeReason: null,
  visit: 'none',
  makeSafeRecorded: false,
  raisedByMe: false,
};
const state = (over: Partial<JobState>): JobState => ({ ...base, ...over });

describe('who can do what', () => {
  it('partner: book a visit or quote once a job is theirs; start a booked job; finish one in progress', () => {
    expect(jobActions('partner', state({}))).toEqual(['book_visit', 'send_quote']);
    expect(jobActions('partner', state({ status: 'scheduled' }))).toEqual([
      'book_visit',
      'send_quote',
      'start_work',
    ]);
    expect(jobActions('partner_admin', state({ status: 'in_progress' }))).toEqual([
      'send_quote',
      'work_done',
    ]);
  });

  it('E4: an emergency must be acknowledged before anything else', () => {
    expect(jobActions('partner', state({ isEmergency: true }))).toEqual([]);
    expect(
      jobActions('partner', state({ isEmergency: true, acknowledged: true, status: 'scheduled' })),
    ).toContain('start_work');
  });

  it('A3: no new quote while one waits, and at most a first and one revised quote', () => {
    expect(jobActions('partner', state({ pendingQuote: true }))).not.toContain('send_quote');
    expect(jobActions('partner', state({ quotesSent: 1 }))).toContain('send_quote');
    expect(jobActions('partner', state({ quotesSent: 2 }))).not.toContain('send_quote');
  });

  it('L4: only the owner decides a quote; a tenant never does', () => {
    const quoted = state({ status: 'quote_sent', pendingQuote: true });
    expect(jobActions('owner', quoted)).toEqual(['approve_quote', 'decline_quote']);
    expect(jobActions('tenant', quoted)).toEqual([]);
    expect(jobActions('partner', quoted)).toEqual([]);
  });

  it('E10/S5: the resident confirms finished work, then rates it once', () => {
    expect(jobActions('tenant', state({ status: 'completed' }))).toEqual(['confirm_done', 'not_done']);
    const closed = state({ status: 'closed', closeReason: 'confirmed' });
    expect(jobActions('owner', closed)).toEqual(['rate']);
    expect(jobActions('owner', { ...closed, rated: true })).toEqual([]);
    expect(jobActions('owner', state({ status: 'closed', closeReason: 'quote_expired' }))).toEqual([]);
  });
});

describe('visits, make-safe, cancelling (A7, A8, E8, E19)', () => {
  it('A8/A7: on a booked visit the technician can say they are on the way, or that nobody let them in', () => {
    const booked = state({ status: 'scheduled', visit: 'booked' });
    expect(jobActions('partner', booked)).toEqual(expect.arrayContaining(['on_my_way', 'no_access']));
    const onWay = jobActions('partner', { ...booked, visit: 'on_the_way' });
    expect(onWay).toContain('no_access');
    expect(onWay).not.toContain('on_my_way');
    expect(jobActions('partner', state({ status: 'scheduled' }))).not.toContain('no_access');
  });

  it('E8: make-safe work is recorded once, on an acknowledged emergency only', () => {
    const emergency = state({ isEmergency: true, acknowledged: true, status: 'in_progress' });
    expect(jobActions('partner', emergency)).toContain('make_safe');
    expect(jobActions('partner', { ...emergency, makeSafeRecorded: true })).not.toContain('make_safe');
    expect(jobActions('partner', state({ status: 'in_progress' }))).not.toContain('make_safe');
  });

  it('cancel before the work starts (a tenant only their own request); E19 owner-arranged', () => {
    expect(jobActions('owner', state({}))).toEqual(['cancel', 'arranged_myself']);
    expect(jobActions('owner', state({ status: 'in_progress' }))).toEqual([]);
    expect(jobActions('tenant', state({ status: 'submitted' }))).toEqual([]);
    expect(jobActions('tenant', state({ status: 'submitted', raisedByMe: true }))).toEqual(['cancel']);
    expect(jobActions('tenant', state({ status: 'scheduled', raisedByMe: true }))).toEqual([]);
  });
});

describe('outcomes', () => {
  it('A3: approve books the work; a first decline goes back to the partner; a second decline closes', () => {
    expect(quoteDecision('approve', 1)).toEqual({ to: 'scheduled', closeReason: null });
    expect(quoteDecision('decline', 1)).toEqual({ to: 'assigned', closeReason: null });
    expect(quoteDecision('decline', 2)).toEqual({ to: 'closed', closeReason: 'quote_declined' });
    for (const o of [quoteDecision('approve', 1), quoteDecision('decline', 1), quoteDecision('decline', 2)]) {
      expect(canTransition('owner', 'quote_sent', o.to)).toBe(true);
    }
  });

  it('E10/A5: confirmed closes; not done reopens with the same partner', () => {
    expect(confirmation(true)).toEqual({ to: 'closed', closeReason: 'confirmed' });
    expect(confirmation(false)).toEqual({ to: 'reopened', closeReason: null });
  });

  it('A2: a quote expires 14 days after it is sent; A4: done work closes itself after 72 hours', () => {
    expect(quoteExpiresAt(0)).toBe(14 * 24 * HOUR);
    expect(autoCloseAt(0)).toBe(72 * HOUR);
  });
});

describe('payloads (C-VAL-1)', () => {
  const now = Date.UTC(2026, 10, 10, 6);

  it('a visit window is 30 minutes to 4 hours, within the next 30 days', () => {
    expect(visitWindowAllowed(now + HOUR, now + 3 * HOUR, now)).toBe(true);
    expect(visitWindowAllowed(now + HOUR, now + 6 * HOUR, now)).toBe(false);
    expect(visitWindowAllowed(now - 2 * HOUR, now, now)).toBe(false);
    expect(visitWindowAllowed(now + 40 * 24 * HOUR, now + 41 * 24 * HOUR, now)).toBe(false);
    expect(
      bookVisitBody.safeParse({ technicianId: 't-1', windowStart: 1, windowEnd: 2, extra: 1 }).success,
    ).toBe(false);
  });

  it('quotes are positive AED amounts with at most two decimals, stored as fils', () => {
    expect(sendQuoteBody.safeParse({ amountAed: 450.5, scope: 'Replace the valve' }).success).toBe(true);
    expect(sendQuoteBody.safeParse({ amountAed: 0, scope: 'x' }).success).toBe(false);
    expect(sendQuoteBody.safeParse({ amountAed: 10.123, scope: 'x' }).success).toBe(false);
    expect(toFils(450.5)).toBe(45050);
    expect(toFils(19.99)).toBe(1999);
  });

  it('a rating is 1 to 5 stars', () => {
    expect(ratingBody.safeParse({ stars: 5 }).success).toBe(true);
    expect(ratingBody.safeParse({ stars: 6 }).success).toBe(false);
    expect(ratingBody.safeParse({ stars: 4.5 }).success).toBe(false);
  });
});
