/** Flow C "consultation" rules (ADR 0031): O5, O6, P5, S4. */
import { describe, expect, it } from 'vitest';
import {
  CONSULTATION_CONSENT_VERSION,
  CONSULTATION_QUESTIONS,
  CONSULTATION_SERVICE_CODES,
  CONSULTATION_STAGES,
  CONSULTATION_STEP_IDS,
  DEFAULT_CALENDAR,
  SERVICES,
  STATUSES,
  addWorkingMinutes,
  answersProblem,
  canConsultationTransition,
  canTransition,
  closeConsultationBody,
  consultationActions,
  consultationConsentText,
  consultationJobActions,
  consultationTimeline,
  contactMeetsDeadline,
  contactSharedWith,
  currentStage,
  dueAfterContact,
  jobActions,
  nextStages,
  raiseConsultationBody,
  stageMeetsDeadline,
  type JobState,
  type Role,
  type Status,
} from '../src/index.js';

const NOW = Date.UTC(2026, 10, 9, 8, 0, 0);
const TODAY = '2026-11-09';

const job = (over: Partial<JobState> = {}): JobState => ({
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
  raisedByMe: true,
  flow: 'consultation',
  consultationOutcome: null,
  ...over,
});

const raise = {
  sfUnitId: 'a0X000000000001AAA',
  serviceCode: 'mortgage',
  answers: { purpose: 'buying', amount: '1m_3m' },
  bestDate: '2026-11-10',
  bestSlot: 'morning',
  providerId: 'p-1',
  consent: true,
  consentVersion: CONSULTATION_CONSENT_VERSION,
};

describe('consultation services and questions (O5)', () => {
  it('O5: the consultation services are exactly the catalogue services with flow "consultation"', () => {
    expect([...CONSULTATION_SERVICE_CODES].sort()).toEqual(
      SERVICES.filter((s) => s.flow === 'consultation')
        .map((s) => s.code)
        .sort(),
    );
  });

  it('O5: each service asks 1 to 3 questions and has stages', () => {
    for (const code of CONSULTATION_SERVICE_CODES) {
      expect(CONSULTATION_QUESTIONS[code].length).toBeGreaterThanOrEqual(1);
      expect(CONSULTATION_QUESTIONS[code].length).toBeLessThanOrEqual(3);
      expect(CONSULTATION_STAGES[code].length).toBeGreaterThan(0);
    }
    expect(CONSULTATION_STAGES.mortgage.map((s) => s.label)).toEqual([
      'Pre-approval',
      'Bank valuation',
      'Offer',
    ]);
    expect(CONSULTATION_STAGES['golden-visa'].map((s) => s.id)).toEqual([
      'eligibility',
      'documents',
      'submitted',
      'approved',
    ]);
  });

  it('O5: every step id is listed once (the database CHECK list)', () => {
    expect(new Set(CONSULTATION_STEP_IDS).size).toBe(CONSULTATION_STEP_IDS.length);
    expect(CONSULTATION_STEP_IDS).toContain('contact_made');
    expect(CONSULTATION_STEP_IDS).toContain('did_not_proceed');
  });

  it('O5: the answers must be exactly the service questions with offered answers', () => {
    expect(answersProblem('mortgage', { purpose: 'buying', amount: 'over_5m' }, TODAY)).toBeNull();
    expect(answersProblem('mortgage', { purpose: 'buying' }, TODAY)).toBe('Answer every question.');
    expect(answersProblem('mortgage', { purpose: 'gift', amount: 'over_5m' }, TODAY)).not.toBeNull();
    expect(answersProblem('golden-visa', { applicants: 'me', extra: 'x' }, TODAY)).toBe('Unknown question.');
  });

  it('O5: a date answer is a real date from today to a year ahead', () => {
    const ok = { furnished: 'furnished', available_from: '2026-12-01' };
    expect(answersProblem('leasing', ok, TODAY)).toBeNull();
    expect(answersProblem('leasing', { ...ok, available_from: '2026-11-08' }, TODAY)).not.toBeNull();
    expect(answersProblem('leasing', { ...ok, available_from: '2026-02-30' }, TODAY)).not.toBeNull();
    expect(answersProblem('leasing', { ...ok, available_from: '2028-01-01' }, TODAY)).not.toBeNull();
  });
});

describe('consent (ADR 0031)', () => {
  it('O5: nothing is sent without the consent switch and the current wording', () => {
    expect(raiseConsultationBody.safeParse(raise).success).toBe(true);
    expect(raiseConsultationBody.safeParse({ ...raise, consent: false }).success).toBe(false);
    const noConsent = Object.fromEntries(Object.entries(raise).filter(([k]) => k !== 'consent'));
    expect(raiseConsultationBody.safeParse(noConsent).success).toBe(false);
    expect(raiseConsultationBody.safeParse({ ...raise, consentVersion: 'old' }).success).toBe(false);
    expect(raiseConsultationBody.safeParse({ ...raise, serviceCode: 'maintenance' }).success).toBe(false);
    expect(raiseConsultationBody.safeParse({ ...raise, extra: 1 }).success).toBe(false);
  });

  it('the consent names the provider', () => {
    expect(consultationConsentText('Harbor Real Estate')).toBe(
      'Share my name, unit and contact details with Harbor Real Estate so they can contact me.',
    );
  });

  it('contact details only for the consented office, while it has the open request', () => {
    const office = { role: 'partner_admin' as Role, partnerId: 'p-1' };
    const facts = { consentPartnerId: 'p-1', assignedPartnerId: 'p-1', status: 'in_progress' as Status };
    expect(contactSharedWith(office, facts)).toBe(true);
    expect(contactSharedWith({ ...office, role: 'partner' }, facts)).toBe(false);
    expect(contactSharedWith({ ...office, partnerId: 'p-2' }, { ...facts, assignedPartnerId: 'p-2' })).toBe(
      false,
    );
    expect(contactSharedWith(office, { ...facts, assignedPartnerId: 'p-2' })).toBe(false);
    expect(contactSharedWith(office, { ...facts, status: 'closed' })).toBe(false);
  });
});

describe('stages and steps (O5, P5)', () => {
  const state = (status: Status, steps: string[]) => ({ serviceCode: 'mortgage', status, steps });

  it('P5: contact made first, then stages forward only, then close', () => {
    expect(consultationActions('partner_admin', state('assigned', []))).toEqual(['contact_made']);
    expect(consultationActions('partner_admin', state('in_progress', ['contact_made']))).toEqual([
      'move_stage',
      'close',
    ]);
    const atOffer = ['contact_made', 'pre_approval', 'offer'];
    expect(consultationActions('partner_admin', state('in_progress', atOffer))).toEqual(['close']);
    expect(consultationActions('partner_admin', state('completed', [...atOffer, 'done']))).toEqual([]);
  });

  it('P5: technicians, owners and staff take no provider step', () => {
    for (const role of ['partner', 'owner', 'jad_admin'] as const) {
      expect(consultationActions(role, state('assigned', []))).toEqual([]);
    }
  });

  it('P5: the next stages come after the furthest one reached (skipping allowed)', () => {
    expect(nextStages('mortgage', ['contact_made'])).toEqual(['pre_approval', 'bank_valuation', 'offer']);
    expect(currentStage('mortgage', ['contact_made', 'bank_valuation'])).toBe('bank_valuation');
    expect(nextStages('mortgage', ['contact_made', 'bank_valuation'])).toEqual(['offer']);
  });

  it('P5: "Did not proceed" needs the reason the owner sees', () => {
    expect(closeConsultationBody.safeParse({ outcome: 'done' }).success).toBe(true);
    expect(closeConsultationBody.safeParse({ outcome: 'did_not_proceed' }).success).toBe(false);
    expect(
      closeConsultationBody.safeParse({ outcome: 'did_not_proceed', note: 'Bank declined.' }).success,
    ).toBe(true);
  });

  it('every status move matches lifecycle.ts, except the owner\'s "No longer needed" while in progress', () => {
    for (const role of ['owner', 'partner_admin'] as const) {
      for (const from of STATUSES) {
        for (const to of STATUSES) {
          if (!canConsultationTransition(role, from, to)) continue;
          if (role === 'owner' && from === 'in_progress' && to === 'cancelled') continue;
          expect(canTransition(role === 'partner_admin' ? 'partner' : role, from, to)).toBe(true);
        }
      }
    }
  });
});

describe("the owner's steps on a consultation (jobflow.ts)", () => {
  it('O5: "No longer needed" at any time before the provider finishes', () => {
    for (const status of ['assigned', 'in_progress'] as const) {
      expect(jobActions('owner', job({ status }))).toEqual(['cancel']);
    }
    expect(jobActions('owner', job({ status: 'completed' }))).toEqual(['confirm_done']);
  });

  it('P5: rating only after a consultation that was done and closed', () => {
    const closed = job({ status: 'closed', closeReason: 'confirmed', consultationOutcome: 'done' });
    expect(consultationJobActions('owner', closed)).toEqual(['rate']);
    expect(consultationJobActions('owner', { ...closed, consultationOutcome: 'did_not_proceed' })).toEqual(
      [],
    );
    expect(consultationJobActions('owner', { ...closed, rated: true })).toEqual([]);
  });

  it('no visit-journey step on a consultation for the provider or a tenant', () => {
    expect(jobActions('partner_admin', job())).toEqual([]);
    expect(jobActions('partner', job({ status: 'in_progress' }))).toEqual([]);
    expect(jobActions('tenant', job({ status: 'completed' }))).toEqual([]);
  });
});

describe('deadlines (S4)', () => {
  const first = { at: NOW + 9 * 3_600_000, kind: 'first_contact' };

  it('S4: contact made meets the first-contact deadline (mortgage first call included)', () => {
    expect(contactMeetsDeadline(first)).toBe(true);
    expect(contactMeetsDeadline({ at: NOW, kind: 'eligibility_answer' })).toBe(false);
    expect(dueAfterContact('mortgage', NOW, first, DEFAULT_CALENDAR)).toBeNull();
    expect(dueAfterContact('property-management', NOW, first, DEFAULT_CALENDAR)).toBeNull();
  });

  it('S4: leasing listing within 3 working days of contact; met by reaching "Listed"', () => {
    const next = dueAfterContact('leasing', NOW, first, DEFAULT_CALENDAR);
    expect(next).toEqual({ at: addWorkingMinutes(NOW, 27 * 60, DEFAULT_CALENDAR), kind: 'listing' });
    expect(stageMeetsDeadline('leasing', 'listed', next)).toBe(true);
    expect(stageMeetsDeadline('leasing', 'viewings', next)).toBe(true);
  });

  it('S4: resale valuation and sales plan within 3 working days of contact', () => {
    const next = dueAfterContact('resale', NOW, first, DEFAULT_CALENDAR);
    expect(next?.kind).toBe('valuation_plan');
    expect(stageMeetsDeadline('resale', 'valuation_plan', next)).toBe(true);
  });

  it('S4: Golden Visa eligibility answer keeps its first deadline until "Eligibility" is reached', () => {
    const eligibility = { at: NOW + 18 * 3_600_000, kind: 'eligibility_answer' };
    expect(dueAfterContact('golden-visa', NOW, eligibility, DEFAULT_CALENDAR)).toEqual(eligibility);
    expect(stageMeetsDeadline('golden-visa', 'eligibility', eligibility)).toBe(true);
    expect(stageMeetsDeadline('mortgage', 'pre_approval', eligibility)).toBe(false);
  });
});

describe("the owner's timeline (ADR 0031)", () => {
  it('O5: done / current / next', () => {
    const items = consultationTimeline('mortgage', 'in_progress', [
      { step: 'contact_made', note: null, at: NOW },
      { step: 'pre_approval', note: 'Pre-approved.', at: NOW + 1 },
    ]);
    expect(items.map((i) => [i.id, i.state])).toEqual([
      ['contact_made', 'done'],
      ['pre_approval', 'done'],
      ['bank_valuation', 'current'],
      ['offer', 'next'],
      ['done', 'next'],
    ]);
    expect(items[1]?.note).toBe('Pre-approved.');
  });

  it('P5: did not proceed shows the stages never reached', () => {
    const items = consultationTimeline('mortgage', 'completed', [
      { step: 'contact_made', note: null, at: NOW },
      { step: 'did_not_proceed', note: 'The bank declined.', at: NOW + 1 },
    ]);
    expect(items.map((i) => [i.id, i.state])).toEqual([
      ['contact_made', 'done'],
      ['pre_approval', 'not_reached'],
      ['bank_valuation', 'not_reached'],
      ['offer', 'not_reached'],
      ['did_not_proceed', 'done'],
    ]);
  });

  it('a skipped stage counts as done; a cancelled request has no current step', () => {
    const skipped = consultationTimeline('mortgage', 'in_progress', [
      { step: 'contact_made', note: null, at: NOW },
      { step: 'offer', note: null, at: NOW + 1 },
    ]);
    expect(skipped.slice(1, 4).map((i) => i.state)).toEqual(['done', 'done', 'done']);
    const cancelled = consultationTimeline('golden-visa', 'cancelled', []);
    expect(cancelled.every((i) => i.state === 'not_reached')).toBe(true);
  });
});
