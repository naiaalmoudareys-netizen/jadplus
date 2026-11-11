// Consultation words on the partner office's job page (ADR 0031; O5, P5).
import { CONSULTATION_CONSENT_VERSION } from '@jadplus/shared';
import { describe, expect, it } from 'vitest';
import {
  answerLines,
  bestTimeText,
  consentLine,
  contactFact,
  currentStageText,
  stepName,
} from '../src/lib/consultation';

describe('consultation on the job page (O5, P5)', () => {
  it('O5: the owner answers in the service order, with dates as days', () => {
    expect(
      answerLines({
        serviceCode: 'leasing',
        answers: { available_from: '2026-12-15', furnished: 'not_sure' },
      }),
    ).toEqual([
      { question: 'Furnished?', answer: 'Not sure yet' },
      { question: 'Available from', answer: '15 Dec 2026' },
    ]);
  });

  it('P5: steps are named per service', () => {
    expect(stepName('mortgage', 'bank_valuation')).toBe('Bank valuation');
    expect(stepName('resale', 'valuation_plan')).toBe('Valuation & plan');
    expect(stepName('leasing', 'contact_made')).toBe('Contact made');
    expect(stepName('leasing', 'did_not_proceed')).toBe('Did not proceed');
  });

  it('the best time to call and the consent the owner gave', () => {
    expect(bestTimeText({ bestTime: { date: '2026-11-10', slot: 'morning' } })).toBe(
      '10 Nov 2026 · Morning (9:00 - 12:00)',
    );
    expect(bestTimeText({ bestTime: null })).toBe('-');
    const at = Date.parse('2026-11-09T12:00:00+04:00');
    expect(
      consentLine({ consent: { providerName: 'Harbor (demo)', at, version: CONSULTATION_CONSENT_VERSION } }),
    ).toBe(
      `“Share my name, unit and contact details with Harbor (demo) so they can contact me.” Agreed 9 Nov 2026, 12:00 (wording ${CONSULTATION_CONSENT_VERSION}).`,
    );
  });
});

describe('consultation facts instead of visit facts (ADR 0031)', () => {
  const at = Date.parse('2026-11-09T12:00:00+04:00');
  it('O5: answered means the owner was contacted, not that a visit was booked', () => {
    expect(contactFact({ steps: [] })).toEqual({ text: 'Not contacted yet', tone: 'warn' });
    expect(contactFact({ steps: [{ step: 'contact_made', note: null, at }] })).toEqual({
      text: 'Contact made 9 Nov 2026, 12:00',
      tone: 'good',
    });
  });

  it('P5: the current stage, or how the consultation ended', () => {
    expect(currentStageText({ serviceCode: 'mortgage', status: 'assigned', steps: [] })).toBe('Contact made');
    expect(
      currentStageText({
        serviceCode: 'mortgage',
        status: 'in_progress',
        steps: [{ step: 'contact_made', note: null, at }],
      }),
    ).not.toBe('Contact made');
    expect(
      currentStageText({
        serviceCode: 'leasing',
        status: 'closed',
        steps: [
          { step: 'contact_made', note: null, at },
          { step: 'did_not_proceed', note: null, at },
        ],
      }),
    ).toBe('Did not proceed');
  });
});
