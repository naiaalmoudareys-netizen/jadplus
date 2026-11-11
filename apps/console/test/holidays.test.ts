/** The Holidays section of Settings (E20, ADR 0028): what can change, and what to fix before adding. */
import { adminHolidaysResponse, holidayChangedResponse } from '@jadplus/shared';
import { describe, expect, it } from 'vitest';
import { firstEditableDay, holidayToAdd, splitHolidays } from '../src/lib/holidays';

const TODAY = '2026-11-11';
const ROWS = adminHolidaysResponse.parse({
  today: TODAY,
  holidays: [
    { date: '2026-01-01', name: "New Year's Day", editable: false, addedAt: 1 },
    { date: '2026-08-25', name: "Prophet's Birthday", editable: false, addedAt: 1 },
    { date: '2026-12-02', name: 'National Day', editable: true, addedAt: 1 },
  ],
}).holidays;

describe('holidays in Settings (E20)', () => {
  it('E20: days after today can change; today and earlier are read-only, newest first', () => {
    const { upcoming, past } = splitHolidays(ROWS);
    expect(upcoming.map((h) => h.date)).toEqual(['2026-12-02']);
    expect(past.map((h) => h.date)).toEqual(['2026-08-25', '2026-01-01']);
    expect(firstEditableDay(TODAY)).toBe('2026-11-12');
    expect(firstEditableDay('2026-12-31')).toBe('2027-01-01');
  });

  it('E20: a holiday to add needs a real future day not already on file and a name of 2-80 characters', () => {
    expect(holidayToAdd({ date: '2026-11-20', name: ' Test day ' }, TODAY, ROWS)).toEqual({
      body: { date: '2026-11-20', name: 'Test day' },
    });
    expect(holidayToAdd({ date: TODAY, name: 'Test day' }, TODAY, ROWS)).toEqual({
      problem: 'Only days after today can change: today and past days stay as they were.',
    });
    expect(holidayToAdd({ date: '2026-12-02', name: 'National Day' }, TODAY, ROWS)).toEqual({
      problem: 'That day is already a holiday.',
    });
    expect(holidayToAdd({ date: '', name: 'Test day' }, TODAY, ROWS)).toHaveProperty('problem');
    expect(holidayToAdd({ date: '2026-11-20', name: 'T' }, TODAY, ROWS)).toHaveProperty('problem');
  });

  it('E20: the answer to an add or a removal is checked', () => {
    expect(
      holidayChangedResponse.safeParse({ date: '2026-11-20', name: 'Test day', removed: true }).success,
    ).toBe(true);
    expect(holidayChangedResponse.safeParse({ date: '2026-11-20' }).success).toBe(false);
  });
});
