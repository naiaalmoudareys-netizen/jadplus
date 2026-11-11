/** Consultation screens (ADR 0031; O5, S4): the words for every question, answer and stage, and the dates offered. */
import { CONSULTATION_QUESTIONS, CONSULTATION_STEP_IDS, consultationConsentText } from '@jadplus/shared';
import { describe, expect, it } from 'vitest';
import { isMessageKey, langOf } from '../src/i18n/lang.js';
import { availableFromChoices, contactWithin, stepLabel } from '../src/requests/consultationWords.js';

const en = langOf('en');
const ar = langOf('ar');

describe('consultation words (O5)', () => {
  it('O5: every question, answer and stage has its own words in the app', () => {
    for (const questions of Object.values(CONSULTATION_QUESTIONS)) {
      for (const q of questions) {
        expect(isMessageKey(`cons.q.${q.id}`)).toBe(true);
        if (q.kind === 'choice') for (const o of q.options) expect(isMessageKey(`cons.o.${o.id}`)).toBe(true);
      }
    }
    for (const id of CONSULTATION_STEP_IDS) expect(isMessageKey(`cons.step.${id}`)).toBe(true);
    expect(stepLabel('bank_valuation', en.t)).toBe('Bank valuation');
    expect(stepLabel('a_new_stage', en.t)).toBe('a_new_stage');
  });

  it('the English consent in the app is the consent wording recorded by the API', () => {
    expect(en.t('cons.consent', { provider: 'Harbor (demo)' })).toBe(
      consultationConsentText('Harbor (demo)'),
    );
    expect(ar.t('cons.consent', { provider: 'Harbor (demo)' })).toContain('Harbor (demo)');
  });

  it('S4: "will contact you within" follows the service first deadline', () => {
    expect(contactWithin('mortgage', en.t)).toBe('1 working day');
    expect(contactWithin('golden-visa', en.t)).toBe('2 working days');
    expect(
      en.t('cons.sent.line', { provider: 'Harbor (demo)', target: contactWithin('leasing', en.t) }),
    ).toBe('Sent. Harbor (demo) will contact you within 1 working day.');
  });

  it('O5: "Available from" offers now and the 1st of the next five months', () => {
    expect(availableFromChoices('2026-11-11')).toEqual([
      '2026-11-11',
      '2026-12-01',
      '2027-01-01',
      '2027-02-01',
      '2027-03-01',
      '2027-04-01',
    ]);
  });
});
