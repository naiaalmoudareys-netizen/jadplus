/** Tenancy rules (ADR 0021): R2, A1, U4, U5, C-PD-1, C-VAL-1. */
import { describe, expect, it } from 'vitest';
import {
  addDays,
  daysBetween,
  endingSoon,
  extensionAllowed,
  inboxRecipients,
  inviteTenantBody,
  jobActions,
  maskContact,
  tenancyDatesAllowed,
  type JobState,
} from '../src/index.js';

const TODAY = '2026-11-10';

describe('tenancy dates', () => {
  it('R2: end after start, at most 3 years, start at most 30 days back, end not past', () => {
    expect(tenancyDatesAllowed('2026-11-15', '2027-11-14', TODAY)).toBe(true);
    expect(tenancyDatesAllowed('2026-10-20', '2027-10-19', TODAY)).toBe(true);
    expect(tenancyDatesAllowed('2026-09-01', '2027-08-31', TODAY)).toBe(false);
    expect(tenancyDatesAllowed('2026-12-01', '2026-11-30', TODAY)).toBe(false);
    expect(tenancyDatesAllowed('2026-11-15', '2030-11-14', TODAY)).toBe(false);
  });

  it('U5: an extension only moves the end later', () => {
    expect(extensionAllowed('2026-12-31', '2027-06-30', TODAY)).toBe(true);
    expect(extensionAllowed('2026-12-31', '2026-12-01', TODAY)).toBe(false);
    expect(extensionAllowed('2026-10-31', '2026-11-05', TODAY)).toBe(false);
  });

  it('U4: "ending soon" is the last 30 days', () => {
    expect(endingSoon('2026-12-10', TODAY)).toBe(true);
    expect(endingSoon('2026-12-11', TODAY)).toBe(false);
    expect(endingSoon('2026-11-09', TODAY)).toBe(false);
    expect(daysBetween(TODAY, addDays(TODAY, 30))).toBe(30);
  });
});

describe('invitation', () => {
  it('C-VAL-1: a name and exactly one of email or mobile', () => {
    const base = {
      sfUnitId: 'a0X000000000001AAA',
      name: 'Nadia Example',
      startsOn: TODAY,
      endsOn: '2027-11-09',
    };
    expect(inviteTenantBody.safeParse({ ...base, email: 'demo@jadplus.ae' }).success).toBe(true);
    expect(inviteTenantBody.safeParse(base).success).toBe(false);
    expect(
      inviteTenantBody.safeParse({ ...base, email: 'demo@jadplus.ae', phone: '+971500000000' }).success,
    ).toBe(false);
  });

  it('C-PD-1: the owner sees the contact masked', () => {
    expect(maskContact('nadia.tenant@example.com')).toBe('n•••t@example.com');
    expect(maskContact('+971500000000')).toBe('+971 •• ••• 0000');
  });
});

describe('owner approval (A1)', () => {
  const waiting: JobState = {
    status: 'awaiting_owner',
    isEmergency: false,
    acknowledged: false,
    pendingQuote: false,
    quotesSent: 0,
    hasPartner: false,
    rated: false,
    closeReason: null,
    visit: 'none',
    makeSafeRecorded: false,
    raisedByMe: true,
  };

  it('A1: only the owner approves or declines; the tenant can still cancel their own request', () => {
    expect(jobActions('owner', { ...waiting, raisedByMe: false })).toEqual([
      'approve_request',
      'decline_request',
    ]);
    expect(jobActions('tenant', waiting)).toEqual(['cancel']);
  });

  it('A1: the approval goes to the owner; the answer to the tenant who asked', () => {
    expect(inboxRecipients('approval_needed', 'owner', 'tenant')).toEqual(['owner']);
    expect(inboxRecipients('request_approved', 'owner', 'tenant')).toEqual(['tenant']);
    expect(inboxRecipients('work_done', 'owner', 'tenant')).toEqual(['owner', 'tenant']);
    expect(inboxRecipients('work_done', 'owner', 'owner')).toEqual(['owner']);
  });
});
