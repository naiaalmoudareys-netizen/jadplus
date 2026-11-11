// Consultation words on the partner office's job page (ADR 0031; O5, P5).
import { CONSULTATION_CONSENT_VERSION } from '@jadplus/shared';
import { describe, expect, it } from 'vitest';
import { answerLines, bestTimeText, consentLine, stepName } from '../src/lib/consultation';

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
