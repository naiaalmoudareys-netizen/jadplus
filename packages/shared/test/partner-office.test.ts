/** Partner office rules (ADR 0025): S5, S6, S7, S9, S10, P1, A2, E5-E7, R3 dispatch, CSV export. */
import { describe, expect, it } from 'vitest';
import {
  addUnavailableBody,
  csvField,
  csvLine,
  daysLeft,
  decideRateChangeBody,
  dubaiDateTime,
  isPdf,
  partnerDocumentStanding,
  raisesPrices,
  rateCardChangeBody,
  rateCardValidUntil,
  rateChangeProblem,
  reviewWatch,
  setAfterHoursBody,
  setSkillsBody,
  skillFor,
  suggestTechnicians,
  verifyDocumentBody,
  weeksFrom,
  wholePercent,
} from '../src/index.js';

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 10, 10, 8, 0, 0);
const TODAY = '2026-11-10';
const bytes = (text: string) => Uint8Array.from(text, (ch) => ch.charCodeAt(0));

describe('rate card (S9, P1)', () => {
  it('P1: a new rate card starts at least 60 days ahead', () => {
    expect(rateChangeProblem('2027-01-09', TODAY, false, null)).toBeNull();
    expect(rateChangeProblem('2027-01-08', TODAY, false, null)).toMatch(/60 days/);
  });

  it('P1: prices cannot go up while the current 12-month card runs; lowering them can', () => {
    expect(rateChangeProblem('2027-03-01', TODAY, true, '2027-05-31')).toMatch(/fixed until 2027-05-31/);
    expect(rateChangeProblem('2027-06-01', TODAY, true, '2027-05-31')).toBeNull();
    expect(rateChangeProblem('2027-03-01', TODAY, false, '2027-05-31')).toBeNull();
  });

  it('S9: a card is valid 12 months less a day, also from 29 February', () => {
    expect(rateCardValidUntil('2027-01-15')).toBe('2028-01-14');
    expect(rateCardValidUntil('2028-02-29')).toBe('2029-02-27');
  });

  it('S9: a raise is a line that costs more than the same line today', () => {
    const line = { serviceCode: 'maintenance', item: 'AC service', unit: 'per_visit', priceFils: 15000 };
    const now = [line];
    expect(raisesPrices([{ ...line, item: 'ac service ', priceFils: 16000 }], now)).toBe(true);
    expect(raisesPrices([{ ...line, priceFils: 14000 }], now)).toBe(false);
    expect(raisesPrices([{ ...line, unit: 'per_hour', priceFils: 99000 }], now)).toBe(false);
  });

  it('S9: prices in AED with at most 2 decimals; each line once', () => {
    const line = { serviceCode: 'maintenance', item: 'AC service', unit: 'per_visit', priceAed: 150.5 };
    expect(rateCardChangeBody.safeParse({ effectiveFrom: '2027-02-01', items: [line] }).success).toBe(true);
    expect(
      rateCardChangeBody.safeParse({ effectiveFrom: '2027-02-01', items: [{ ...line, priceAed: 1.234 }] })
        .success,
    ).toBe(false);
    expect(rateCardChangeBody.safeParse({ effectiveFrom: '2027-02-01', items: [line, line] }).success).toBe(
      false,
    );
    expect(rateCardChangeBody.safeParse({ effectiveFrom: '2027-02-30', items: [line] }).success).toBe(false);
  });

  it('S9: an acceptance names who approved in writing; a rejection says why', () => {
    expect(decideRateChangeBody.safeParse({ decision: 'accept' }).success).toBe(false);
    expect(
      decideRateChangeBody.safeParse({ decision: 'accept', approvedBy: 'Marketing Director' }).success,
    ).toBe(true);
    expect(decideRateChangeBody.safeParse({ decision: 'reject' }).success).toBe(false);
    expect(
      decideRateChangeBody.safeParse({ decision: 'reject', reason: 'Above market quotes' }).success,
    ).toBe(true);
  });
});

describe('documents (S7, S10)', () => {
  it('S10: a PDF is recognised from its bytes', () => {
    expect(isPdf(bytes('%PDF-1.7 ...'))).toBe(true);
    expect(isPdf(bytes('<html>%PDF-'))).toBe(false);
    expect(isPdf(new Uint8Array())).toBe(false);
  });

  it('S7: standing of a verified document; one without an expiry date is valid', () => {
    expect(partnerDocumentStanding(null, TODAY)).toBe('missing');
    expect(partnerDocumentStanding({ expiresOn: null }, TODAY)).toBe('valid');
    expect(partnerDocumentStanding({ expiresOn: '2026-12-01' }, TODAY)).toBe('expiring_soon');
    expect(partnerDocumentStanding({ expiresOn: '2026-11-09' }, TODAY)).toBe('lapsed');
  });

  it('S7: a rejection needs a reason', () => {
    expect(verifyDocumentBody.safeParse({ decision: 'reject' }).success).toBe(false);
    expect(verifyDocumentBody.safeParse({ decision: 'accept' }).success).toBe(true);
  });
});

describe('S6: close to the "low client reviews" line', () => {
  const rating = (stars: number) => ({ at: NOW - DAY, stars });

  it('S6: below 4.0 is flagged; within 0.3 above it is a warning; well above is quiet', () => {
    expect(reviewWatch({ ratings: [rating(3)], missedEmergencies: [], breaches: [] }, NOW)).toEqual([
      { kind: 'low_rating', level: 'flagged', average: 3 },
    ]);
    expect(
      reviewWatch({ ratings: [rating(4), rating(4)], missedEmergencies: [], breaches: [] }, NOW),
    ).toEqual([{ kind: 'low_rating', level: 'warning', average: 4 }]);
    expect(reviewWatch({ ratings: [rating(5)], missedEmergencies: [], breaches: [] }, NOW)).toEqual([]);
  });

  it('S6: one missed emergency in 90 days warns; two are flagged; a breach is flagged', () => {
    expect(reviewWatch({ ratings: [], missedEmergencies: [NOW - DAY], breaches: [] }, NOW)).toEqual([
      { kind: 'missed_emergencies', level: 'warning', count: 1 },
    ]);
    expect(
      reviewWatch(
        {
          ratings: [],
          missedEmergencies: [NOW - DAY, NOW - 2 * DAY],
          breaches: [{ kind: 'safety_breach', at: NOW }],
        },
        NOW,
      ),
    ).toEqual([
      { kind: 'missed_emergencies', level: 'flagged', count: 2 },
      { kind: 'breach', level: 'flagged' },
    ]);
  });
});

describe('dispatch (R3)', () => {
  it('R3: an emergency needs a matching skill; a routine job anyone', () => {
    expect(skillFor('ac_failure')).toBe('ac');
    expect(skillFor('water_leak')).toBe('plumbing');
    expect(skillFor(null)).toBeNull();
  });

  it('R3: suggestions are available technicians with the skill, fewest visits first', () => {
    const team = [
      { id: 'a', skills: ['ac' as const], available: true, visits: 3 },
      { id: 'b', skills: ['ac' as const, 'plumbing' as const], available: true, visits: 1 },
      { id: 'c', skills: ['ac' as const], available: false, visits: 0 },
      { id: 'd', skills: ['general' as const], available: true, visits: 1 },
    ];
    expect(suggestTechnicians(team, 'ac')).toEqual(['b', 'a']);
    expect(suggestTechnicians(team, null)).toEqual(['b', 'd', 'a']);
  });

  it('R3: skills are from the fixed list, each once; days away end on or after they start', () => {
    expect(setSkillsBody.safeParse({ skills: ['ac', 'plumbing'] }).success).toBe(true);
    expect(setSkillsBody.safeParse({ skills: ['ac', 'ac'] }).success).toBe(false);
    expect(setSkillsBody.safeParse({ skills: ['roofing'] }).success).toBe(false);
    expect(addUnavailableBody.safeParse({ from: TODAY, to: TODAY, reason: 'sick' }).success).toBe(true);
    expect(addUnavailableBody.safeParse({ from: TODAY, to: '2026-11-09', reason: 'leave' }).success).toBe(
      false,
    );
  });
});

describe('after-hours weeks (E5-E7)', () => {
  it('E6: weeks start on Monday and follow each other', () => {
    expect(weeksFrom('2026-11-09', 3)).toEqual(['2026-11-09', '2026-11-16', '2026-11-23']);
    expect(setAfterHoursBody.safeParse({ weekStarting: '2026-11-10', technicianId: 't-1' }).success).toBe(
      false,
    );
    expect(setAfterHoursBody.safeParse({ weekStarting: '2026-11-09', technicianId: null }).success).toBe(
      true,
    );
  });
});

describe('figures and export (S5, A2)', () => {
  it('S5: whole percent, null when nothing was measured', () => {
    expect(wholePercent(2, 3)).toBe(67);
    expect(wholePercent(0, 0)).toBeNull();
  });

  it('A2: days left before a quote expires, never negative', () => {
    expect(daysLeft(NOW + 1.5 * DAY, NOW)).toBe(2);
    expect(daysLeft(NOW - DAY, NOW)).toBe(0);
  });

  it('S5: CSV fields are quoted when needed and never carry a spreadsheet formula', () => {
    expect(csvField('Building "B", JVC')).toBe('"Building ""B"", JVC"');
    expect(csvField('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvField('-5')).toBe("'-5");
    expect(csvField(-5)).toBe('-5');
    expect(csvField(null)).toBe('');
    expect(csvLine(['a', 1, null])).toBe('a,1,\r\n');
  });

  it('S5: export times are Dubai local time', () => {
    expect(dubaiDateTime(Date.UTC(2026, 10, 9, 22, 30))).toBe('2026-11-10 02:30');
  });
});
