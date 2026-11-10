// Partner office pure logic (ADR 0025): job steps and progress, the dispatch grid, the rate-card draft.
import { describe, expect, it } from 'vitest';
import { COLUMNS, choiceOrder, hourLabels, placeVisit } from '../src/lib/dispatch';
import { officeSteps, quoteStepLabel, trackerStage, trackerSteps } from '../src/lib/job-steps';
import {
  draftBody,
  draftChange,
  draftFrom,
  earliestStart,
  filsToInput,
  priceChange,
} from '../src/lib/rate-card';
import { STATS_DAYS } from '../src/lib/stats';

/** A Dubai time on 12 Nov 2026 as an instant. */
const at = (hhmm: string): number => Date.parse(`2026-11-12T${hhmm}:00+04:00`);
const DAY = '2026-11-12';

describe('job steps (R3, E4, E8, A3, A7)', () => {
  it('E4: an emergency not yet acknowledged offers only "acknowledge"', () => {
    expect(officeSteps({ emergency: true, status: 'assigned' }, [])).toEqual(['acknowledge']);
    expect(officeSteps({ emergency: true, status: 'assigned' }, ['book_visit'])).toEqual(['acknowledge']);
  });

  it('R3: offers only the steps the API allows, in working order; field-only steps stay in the app', () => {
    expect(
      officeSteps({ emergency: false, status: 'scheduled' }, [
        'on_my_way',
        'no_access',
        'start_work',
        'book_visit',
        'send_quote',
      ]),
    ).toEqual(['book_visit', 'start_work', 'send_quote', 'no_access']);
    expect(officeSteps({ emergency: true, status: 'in_progress' }, ['work_done', 'make_safe'])).toEqual([
      'work_done',
      'make_safe',
    ]);
    expect(officeSteps({ emergency: false, status: 'closed' }, ['rate'])).toEqual([]);
  });

  it('A3: after a first quote the next one is a revised quote', () => {
    expect(quoteStepLabel(null)).toBe('Send a quote');
    expect(quoteStepLabel(1)).toBe('Send a revised quote');
  });

  it('places each status on the progress tracker', () => {
    expect(trackerStage('assigned')).toBe('received');
    expect(trackerStage('scheduled')).toBe('booked');
    expect(trackerStage('in_progress')).toBe('working');
    expect(trackerStage('completed')).toBe('done');
    expect(trackerStage('closed')).toBe('closed');
    expect(trackerStage('cancelled')).toBeNull();
    expect(trackerSteps('in_progress').map((s) => s.state)).toEqual([
      'done',
      'done',
      'current',
      'todo',
      'todo',
    ]);
    expect(trackerSteps('closed').every((s) => s.state === 'done')).toBe(true);
    expect(trackerSteps('cancelled').every((s) => s.state === 'todo')).toBe(true);
  });
});

describe('dispatch day grid (R3)', () => {
  it('has 18 half-hour columns with hour labels from 09:00 to 17:00', () => {
    expect(COLUMNS).toBe(18);
    expect(hourLabels()).toEqual([
      '09:00',
      '10:00',
      '11:00',
      '12:00',
      '13:00',
      '14:00',
      '15:00',
      '16:00',
      '17:00',
    ]);
  });

  it('places a visit on grid lines in Dubai time', () => {
    expect(placeVisit(at('09:00'), at('11:00'), DAY)).toEqual({
      start: 1,
      end: 5,
      clippedBefore: false,
      clippedAfter: false,
    });
    expect(placeVisit(at('14:15'), at('14:45'), DAY)).toMatchObject({ start: 11, end: 13 });
  });

  it('clips a visit that runs past the day, and leaves out one outside 09:00-18:00', () => {
    expect(placeVisit(at('08:00'), at('10:00'), DAY)).toEqual({
      start: 1,
      end: 3,
      clippedBefore: true,
      clippedAfter: false,
    });
    expect(placeVisit(at('17:00'), at('20:00'), DAY)).toMatchObject({
      start: 17,
      end: 19,
      clippedAfter: true,
    });
    expect(placeVisit(at('19:00'), at('21:00'), DAY)).toBeNull();
    expect(placeVisit(at('10:00'), at('11:00'), '2026-11-13')).toBeNull();
    expect(placeVisit(at('10:00'), at('11:00'), 'not a date')).toBeNull();
  });

  it('E17: lists the suggested technicians first, best first, then the rest', () => {
    const team = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    expect(choiceOrder(team, ['c', 'a', 'gone']).map((o) => [o.technician.id, o.suggested])).toEqual([
      ['c', true],
      ['a', true],
      ['b', false],
    ]);
  });
});

describe('rate card draft (S9, P1)', () => {
  let n = 0;
  const key = (): string => {
    n += 1;
    return `k${String(n)}`;
  };

  it('starts from the current card, prices shown in AED', () => {
    expect(filsToInput(12000)).toBe('120');
    expect(filsToInput(9550)).toBe('95.50');
    const draft = draftFrom(
      [{ serviceCode: 'maintenance', item: 'AC service', unit: 'per_job', priceFils: 15000 }],
      key,
    );
    expect(draft).toMatchObject([
      { serviceCode: 'maintenance', item: 'AC service', unit: 'per_job', price: '150' },
    ]);
    expect(draftFrom([], key)).toHaveLength(1);
  });

  it('S9/P1: a new card starts 60 days from today at the earliest', () => {
    expect(earliestStart('2026-11-10')).toBe('2027-01-09');
    const line = { key: 'x', serviceCode: 'maintenance', item: 'AC service', unit: 'per_job', price: '150' };
    expect(draftBody('2027-01-08', [line], '2026-11-10')).toMatchObject({ ok: false });
    expect(draftBody('2027-01-09', [line], '2026-11-10')).toEqual({
      ok: true,
      body: {
        effectiveFrom: '2027-01-09',
        items: [{ serviceCode: 'maintenance', item: 'AC service', unit: 'per_job', priceAed: 150 }],
      },
    });
  });

  it('says which line is wrong: missing price, too many decimals, a line listed twice', () => {
    const base = { key: 'x', serviceCode: 'maintenance', item: 'AC service', unit: 'per_job', price: '150' };
    expect(draftBody('2027-02-01', [base, { ...base, price: '' }], '2026-11-10')).toEqual({
      ok: false,
      problem: 'Line 2: give a price in AED.',
    });
    expect(draftBody('2027-02-01', [{ ...base, price: '1.234' }], '2026-11-10')).toMatchObject({
      ok: false,
      problem: 'Line 1: Use at most 2 decimals.',
    });
    expect(draftBody('2027-02-01', [base, { ...base, item: 'ac service ' }], '2026-11-10')).toMatchObject({
      ok: false,
      problem: 'List each item once.',
    });
  });

  it('compares each proposed price with today’s', () => {
    expect(priceChange(11000, 10000)).toBe('+10 %');
    expect(priceChange(9500, 10000)).toBe('−5 %');
    expect(priceChange(10000, 10000)).toBe('Same');
    expect(priceChange(10000, null)).toBe('New');
    const card = [{ serviceCode: 'maintenance', item: 'AC service', unit: 'per_job', priceFils: 10000 }];
    const line = { key: 'x', serviceCode: 'maintenance', item: ' ac SERVICE', unit: 'per_job', price: '110' };
    expect(draftChange(line, card)).toBe('+10 %');
    expect(draftChange({ ...line, unit: 'per_hour' }, card)).toBe('New');
    expect(draftChange({ ...line, price: '' }, card)).toBe('—');
  });
});

describe('recent numbers (S5)', () => {
  it('looks back 7, 30 or 90 days', () => {
    expect(STATS_DAYS).toEqual(['7', '30', '90']);
  });
});
