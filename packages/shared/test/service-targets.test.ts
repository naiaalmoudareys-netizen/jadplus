/** First deadline per service (S4) and provider companies (S7, S10, P6; ADR 0030). */
import { describe, expect, it } from 'vitest';
import { reassignedDue } from '../src/admin-ops.js';
import { DEFAULT_CALENDAR } from '../src/calendar.js';
import { calendarWithHolidays } from '../src/holidays.js';
import {
  NEW_PROVIDER_REASON,
  addProviderBody,
  canMarkHandledByJad,
  sameProviderName,
} from '../src/providers.js';
import { partnerCompliance, suspensionReason } from '../src/scorecard.js';
import {
  FIRST_RESPONSE,
  firstResponseDue,
  firstResponseMetric,
  firstResponseTarget,
} from '../src/service-targets.js';
import { SERVICES } from '../src/services.js';

/** Dubai local time → UTC ms (Dubai is UTC+4 all year). */
const dubai = (iso: string): number => Date.parse(`${iso}+04:00`);
const MONDAY_10 = dubai('2026-11-09T10:00:00');
const due = (code: string, at = MONDAY_10, cal = DEFAULT_CALENDAR) => firstResponseDue(code, at, cal);

describe('first deadline per service (S4)', () => {
  it('S4: every service in the catalogue has a first-response target; education has no clock', () => {
    expect(Object.keys(FIRST_RESPONSE).sort()).toEqual(SERVICES.map((s) => s.code).sort());
    expect(firstResponseTarget('education')).toBeNull();
    expect(due('education')).toBeNull();
  });

  it('S4: maintenance keeps its 4-working-hour answer', () => {
    expect(due('maintenance')).toEqual({ at: dubai('2026-11-09T14:00:00'), kind: 'routine_response' });
  });

  it('S4: snagging is booked within 48 hours, round the clock (weekends count)', () => {
    expect(due('snagging', dubai('2026-11-13T17:00:00'))).toEqual({
      at: dubai('2026-11-15T17:00:00'),
      kind: 'snagging_booking',
    });
  });

  it('S4: first contact within 1 working day for handover, property management, leasing, resale, mortgage', () => {
    for (const code of ['handover', 'property-management', 'leasing', 'resale', 'mortgage']) {
      expect(due(code)).toEqual({ at: dubai('2026-11-10T10:00:00'), kind: 'first_contact' });
    }
    // Raised Friday 17:00: one working hour on Friday, eight on Monday.
    expect(due('leasing', dubai('2026-11-13T17:00:00'))?.at).toBe(dubai('2026-11-16T17:00:00'));
  });

  it('S4/E20: a public holiday on the calendar does not count as a working day', () => {
    const cal = calendarWithHolidays(['2026-11-10']);
    expect(due('resale', MONDAY_10, cal)?.at).toBe(dubai('2026-11-11T10:00:00'));
    expect(due('valuation', MONDAY_10, cal)?.at).toBe(dubai('2026-11-13T10:00:00'));
  });

  it('S4: valuation report 3, Golden Visa eligibility 2, furnishing quote 2, interior proposal 5 working days', () => {
    expect(due('valuation')).toEqual({ at: dubai('2026-11-12T10:00:00'), kind: 'valuation_report' });
    expect(due('golden-visa')).toEqual({ at: dubai('2026-11-11T10:00:00'), kind: 'eligibility_answer' });
    expect(due('furnishing')).toEqual({ at: dubai('2026-11-11T10:00:00'), kind: 'service_quote' });
    expect(due('interior-design')).toEqual({ at: dubai('2026-11-16T10:00:00'), kind: 'design_proposal' });
  });

  it('S4: an unknown service never goes without a deadline (maintenance target)', () => {
    expect(due('teleport')?.kind).toBe('routine_response');
  });

  it('S4/S5: which first answer meets which deadline, and on which scorecard metric', () => {
    expect(firstResponseMetric('routine_response', 'visit')).toBe('routine_response');
    expect(firstResponseMetric('routine_response', 'quote')).toBe('routine_response');
    expect(firstResponseMetric('first_contact', 'quote')).toBe('service_milestone');
    expect(firstResponseMetric('snagging_booking', 'visit')).toBe('service_milestone');
    expect(firstResponseMetric('snagging_booking', 'quote')).toBeNull();
    expect(firstResponseMetric('service_quote', 'quote')).toBe('service_milestone');
    expect(firstResponseMetric('design_proposal', 'visit')).toBeNull();
    expect(firstResponseMetric('valuation_report', 'visit')).toBeNull();
    expect(firstResponseMetric('eligibility_answer', 'quote')).toBeNull();
    expect(firstResponseMetric('routine_visit', 'visit')).toBeNull();
    expect(firstResponseMetric(null, 'visit')).toBeNull();
  });

  it('S4/E6: a job JAD+ Admin moves gets the service’s first deadline from now', () => {
    expect(reassignedDue(false, MONDAY_10, DEFAULT_CALENDAR, 'mortgage')).toEqual({
      at: dubai('2026-11-10T10:00:00'),
      kind: 'first_contact',
    });
    expect(reassignedDue(false, MONDAY_10, DEFAULT_CALENDAR, 'education')).toBeNull();
    expect(reassignedDue(true, MONDAY_10, DEFAULT_CALENDAR, 'maintenance')?.kind).toBe('emergency_ack');
  });
});

describe('provider companies (ADR 0030)', () => {
  it('S7/S10: a new provider starts with the reason the daily check gives when nothing is on file', () => {
    const nothing = partnerCompliance({ licence: null, insurance: null }, '2026-11-09');
    expect(nothing.action).toBe('suspend');
    expect(NEW_PROVIDER_REASON).toBe(suspensionReason(nothing));
  });

  it('C-VAL-1: adding a provider needs a name, a known kind and the office admin’s name and email', () => {
    const ok = {
      name: 'Harbor Real Estate (demo)',
      kind: 'jad_group',
      adminName: 'Layla Haddad',
      adminEmail: 'harbor.re.demo@jadplus.ae',
    };
    expect(addProviderBody.safeParse(ok).success).toBe(true);
    expect(addProviderBody.safeParse({ ...ok, kind: 'franchise' }).success).toBe(false);
    expect(addProviderBody.safeParse({ ...ok, adminEmail: 'not-an-email' }).success).toBe(false);
    expect(addProviderBody.safeParse({ ...ok, name: '<b>Harbor</b>' }).success).toBe(false);
    expect(addProviderBody.safeParse({ ...ok, phone: '+971500000000' }).success).toBe(false);
  });

  it('the same company name twice is recognised whatever the case or spacing', () => {
    expect(sameProviderName('Harbor  Real Estate', ' harbor real estate')).toBe(true);
    expect(sameProviderName('Harbor Real Estate', 'Harbor Property Management')).toBe(false);
  });

  it('ADR 0030: only a waiting routine request with no provider can be marked as handled by JAD+', () => {
    expect(canMarkHandledByJad({ status: 'submitted', partnerId: null, emergency: false })).toBe(true);
    expect(canMarkHandledByJad({ status: 'submitted', partnerId: 'p-1', emergency: false })).toBe(false);
    expect(canMarkHandledByJad({ status: 'assigned', partnerId: null, emergency: false })).toBe(false);
    expect(canMarkHandledByJad({ status: 'submitted', partnerId: null, emergency: true })).toBe(false);
    expect(canMarkHandledByJad({ status: 'closed', partnerId: null, emergency: false })).toBe(false);
  });
});
