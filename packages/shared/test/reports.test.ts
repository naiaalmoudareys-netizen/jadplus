/** Flow B, inspection with a report: O3 (snagging choice, snag list, re-inspection), S4 (deadlines), L2. */
import { describe, expect, it } from 'vitest';
import { jobActions, type JobState } from '../src/jobflow.js';
import { canTransition } from '../src/lifecycle.js';
import {
  SNAGGING_CHOICES,
  VALUATION_DISCLAIMER,
  dueAfterBooking,
  dueAfterInspection,
  providerServiceFor,
  reinspectionAllowed,
  reinspectionBookingDue,
  reportActions,
  reportMilestone,
  reportServiceOf,
  reportUpload,
  snaggingTypeFor,
  type ReportState,
} from '../src/reports.js';
import { SERVICES, raiseRequestBody } from '../src/services.js';
import { mayFixSnag, snagStep } from '../src/snags.js';

const HOUR = 3_600_000;
const T = Date.UTC(2026, 10, 9, 8, 0, 0);

const snagging = (over: Partial<ReportState> = {}): ReportState => ({
  service: 'snagging',
  status: 'in_progress',
  reported: false,
  reinspectionRequested: false,
  reinspectionReported: false,
  snags: [],
  ...over,
});

const valuation = (over: Partial<ReportState> = {}): ReportState => ({
  ...snagging(),
  service: 'valuation',
  status: 'assigned',
  ...over,
});

describe('snagging choice (O3)', () => {
  it('O3: soft snagging goes to the handover team, professional to the snagging provider', () => {
    expect(providerServiceFor('snagging', 'soft')).toBe('handover');
    expect(providerServiceFor('snagging', 'professional')).toBe('snagging');
    expect(providerServiceFor('maintenance', null)).toBe('maintenance');
    expect(SNAGGING_CHOICES.soft.priceFromAed).toBeNull();
    expect(SNAGGING_CHOICES.professional.priceFromAed).toBe(999);
  });

  it('O3: only snagging has a choice; left out it is professional (older app versions)', () => {
    expect(snaggingTypeFor('snagging', undefined)).toBe('professional');
    expect(snaggingTypeFor('snagging', 'soft')).toBe('soft');
    expect(snaggingTypeFor('valuation', 'soft')).toBeNull();
  });

  it('O3: the raise body accepts the choice for snagging only', () => {
    const base = {
      sfUnitId: 'a0X000000000001AAA',
      description: 'Pre-handover check.',
      preferredDate: '2026-11-10',
      preferredSlot: 'morning',
    };
    expect(
      raiseRequestBody.safeParse({ ...base, serviceCode: 'snagging', snaggingType: 'soft' }).success,
    ).toBe(true);
    expect(
      raiseRequestBody.safeParse({ ...base, serviceCode: 'maintenance', snaggingType: 'soft' }).success,
    ).toBe(false);
    expect(
      raiseRequestBody.safeParse({ ...base, serviceCode: 'snagging', snaggingType: 'deluxe' }).success,
    ).toBe(false);
  });

  it('O3: the report services are exactly the services with flow "report"', () => {
    const report = SERVICES.filter((s) => s.flow === 'report').map((s) => s.code);
    expect(report.sort()).toEqual(['snagging', 'valuation']);
    expect(
      SERVICES.map((s) => s.code)
        .filter((c) => reportServiceOf(c) !== null)
        .sort(),
    ).toEqual(report.sort());
  });
});

describe('report steps (O3)', () => {
  it('O3: the inspector lists snags and uploads the report during the inspection, not before', () => {
    expect(reportActions('partner', snagging({ status: 'scheduled' }))).toEqual([]);
    expect(reportActions('partner_admin', snagging())).toEqual(['add_snag', 'upload_report']);
    expect(reportActions('owner', snagging())).toEqual([]);
    expect(reportActions('tenant', snagging())).toEqual([]);
  });

  it('O3: a valuation may be reported without a visit', () => {
    for (const status of ['assigned', 'scheduled', 'in_progress'] as const) {
      expect(reportActions('partner', valuation({ status }))).toEqual(['upload_report']);
    }
    expect(reportActions('partner', valuation({ status: 'completed', reported: true }))).toEqual([]);
  });

  it('O3: a snagging report with snags keeps the request open; without snags it finishes', () => {
    expect(reportUpload(snagging({ snags: ['open'] }))).toEqual({ kind: 'snagging', to: 'in_progress' });
    expect(reportUpload(snagging())).toEqual({ kind: 'snagging', to: 'completed' });
    expect(reportUpload(valuation())).toEqual({ kind: 'valuation', to: 'completed' });
    expect(reportUpload(snagging({ reported: true, reinspectionRequested: true }))).toEqual({
      kind: 'reinspection',
      to: 'completed',
    });
  });

  it('O3: the free re-inspection once every snag is fixed, only once, then its report', () => {
    const after = snagging({ reported: true, snags: ['fixed', 'open'] });
    expect(reinspectionAllowed(after)).toBe(false);
    expect(reportActions('owner', after)).toEqual([]);
    const fixed = snagging({ reported: true, snags: ['fixed', 'confirmed'] });
    expect(reportActions('owner', fixed)).toEqual(['request_reinspection']);
    expect(reportActions('partner', fixed)).toEqual([]);
    expect(reinspectionAllowed({ ...fixed, reinspectionRequested: true })).toBe(false);
    expect(reinspectionAllowed(snagging({ reported: true }))).toBe(false);
    expect(
      reportActions('partner', { ...fixed, reinspectionRequested: true, status: 'in_progress' }),
    ).toEqual(['upload_report']);
    expect(
      reportActions('partner', { ...fixed, reinspectionRequested: true, reinspectionReported: true }),
    ).toEqual([]);
  });

  it('O3: the lifecycle allows the report flow moves', () => {
    expect(canTransition('partner', 'assigned', 'completed')).toBe(true);
    expect(canTransition('owner', 'in_progress', 'reopened')).toBe(true);
    expect(canTransition('tenant', 'in_progress', 'reopened')).toBe(false);
  });

  it('O3: no quote, no "work finished", no "not done" on a report request', () => {
    const state: JobState = {
      status: 'in_progress',
      isEmergency: false,
      acknowledged: false,
      pendingQuote: false,
      quotesSent: 0,
      hasPartner: true,
      rated: false,
      closeReason: null,
      visit: 'arrived',
      makeSafeRecorded: false,
      raisedByMe: true,
    };
    expect(jobActions('partner', state)).toContain('work_done');
    expect(jobActions('partner', { ...state, flow: 'report' })).toEqual([]);
    expect(jobActions('owner', { ...state, status: 'completed', flow: 'report' })).toEqual(['confirm_done']);
    expect(jobActions('partner', { ...state, status: 'scheduled', visit: 'booked', flow: 'report' })).toEqual(
      ['book_visit', 'start_work', 'on_my_way', 'no_access'],
    );
  });
});

describe('snag list (O3)', () => {
  it('O3: open → fixed → confirmed, or reopened back to open', () => {
    expect(snagStep('open', 'fix')).toBe('fixed');
    expect(snagStep('fixed', 'confirm')).toBe('confirmed');
    expect(snagStep('fixed', 'reopen')).toBe('open');
    expect(snagStep('open', 'confirm')).toBeNull();
    expect(snagStep('confirmed', 'reopen')).toBeNull();
    expect(snagStep('fixed', 'fix')).toBeNull();
  });

  it('O3: the snagging provider or a handover team may fix; nobody else', () => {
    const office = (partnerId: string | null) => ({ role: 'partner_admin' as const, partnerId });
    expect(mayFixSnag(office('p-inspector'), 'p-inspector', ['p-handover'])).toBe(true);
    expect(mayFixSnag(office('p-handover'), 'p-inspector', ['p-handover'])).toBe(true);
    expect(mayFixSnag(office('p-other'), 'p-inspector', ['p-handover'])).toBe(false);
    expect(mayFixSnag(office(null), null, [])).toBe(false);
    expect(mayFixSnag({ role: 'owner', partnerId: null }, 'p-inspector', ['p-handover'])).toBe(false);
    expect(mayFixSnag({ role: 'jad_admin', partnerId: null }, 'p-inspector', [])).toBe(false);
  });
});

describe('report deadlines (S4)', () => {
  const raised = { at: T + 27 * HOUR, kind: 'valuation_report' };

  it('S4: snagging report within 24 hours of the inspection; the re-inspection report too', () => {
    expect(dueAfterInspection('snagging', false, T, null)).toEqual({
      at: T + 24 * HOUR,
      kind: 'snagging_report',
    });
    expect(dueAfterInspection('snagging', true, T, null)).toEqual({
      at: T + 24 * HOUR,
      kind: 'reinspection_report',
    });
  });

  it('S4: a valuation keeps its 3-working-day report deadline through the visit', () => {
    expect(dueAfterBooking('valuation', T + 2 * HOUR, raised)).toEqual(raised);
    expect(dueAfterInspection('valuation', false, T, raised)).toEqual(raised);
    expect(dueAfterBooking('snagging', T + 2 * HOUR, raised)).toEqual({ at: T + 2 * HOUR, kind: 'visit' });
  });

  it('S4: the free re-inspection is booked within 48 hours', () => {
    expect(reinspectionBookingDue(T)).toEqual({ at: T + 48 * HOUR, kind: 'reinspection_booking' });
  });

  it('S4: the valuation and snagging reports count as the service milestone', () => {
    expect(reportMilestone('valuation_report')).toBe(true);
    expect(reportMilestone('snagging_report')).toBe(true);
    expect(reportMilestone('reinspection_report')).toBe(false);
    expect(reportMilestone(null)).toBe(false);
  });
});

describe('valuation wording (L2)', () => {
  it('L2: the valuation report says it is indicative, not a formal appraisal', () => {
    expect(VALUATION_DISCLAIMER).toBe('Indicative valuation, not a formal appraisal.');
  });
});
