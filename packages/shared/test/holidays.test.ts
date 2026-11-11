/** Public holidays JAD+ Admin keeps (E20, S4; ADR 0028). */
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CALENDAR,
  DEFAULT_HOLIDAYS,
  DEFAULT_HOLIDAY_LIST,
  addWorkingMinutes,
  calendarFromAnswer,
  calendarWithHolidays,
  holidayBody,
  holidayChangeProblem,
  holidayDateParam,
  holidayEditable,
  preferredDays,
} from '../src/index.js';

const TODAY = '2026-11-11';
const ON_FILE = new Set(['2026-12-02', '2026-11-01']);

describe('editable holidays (E20)', () => {
  it('E20: only days strictly after today (Dubai) can be added or removed', () => {
    expect(holidayEditable('2026-11-12', TODAY)).toBe(true);
    expect(holidayEditable(TODAY, TODAY)).toBe(false);
    expect(holidayEditable('2026-11-10', TODAY)).toBe(false);
    expect(holidayChangeProblem({ kind: 'add', date: TODAY }, TODAY, ON_FILE)).toBe('not_future');
    expect(holidayChangeProblem({ kind: 'remove', date: '2026-11-01' }, TODAY, ON_FILE)).toBe('not_future');
  });

  it('E20: a day that is already a holiday cannot be added twice; only a holiday can be removed', () => {
    expect(holidayChangeProblem({ kind: 'add', date: '2026-12-02' }, TODAY, ON_FILE)).toBe('already_holiday');
    expect(holidayChangeProblem({ kind: 'add', date: '2026-12-24' }, TODAY, ON_FILE)).toBeNull();
    expect(holidayChangeProblem({ kind: 'remove', date: '2026-12-24' }, TODAY, ON_FILE)).toBe('not_holiday');
    expect(holidayChangeProblem({ kind: 'remove', date: '2026-12-02' }, TODAY, ON_FILE)).toBeNull();
  });

  it('E20: a holiday has a real date and a plain name of 2 to 80 characters; unknown keys are refused', () => {
    expect(holidayBody.parse({ date: '2027-03-09', name: '  Eid al-Fitr  ' })).toEqual({
      date: '2027-03-09',
      name: 'Eid al-Fitr',
    });
    expect(holidayBody.safeParse({ date: '2027-02-30', name: 'Eid' }).success).toBe(false);
    expect(holidayBody.safeParse({ date: '09-03-2027', name: 'Eid' }).success).toBe(false);
    expect(holidayBody.safeParse({ date: '2027-03-09', name: 'E' }).success).toBe(false);
    expect(holidayBody.safeParse({ date: '2027-03-09', name: 'x'.repeat(81) }).success).toBe(false);
    expect(holidayBody.safeParse({ date: '2027-03-09', name: '<b>Eid</b>' }).success).toBe(false);
    expect(holidayBody.safeParse({ date: '2027-03-09', name: 'Eid', extra: 1 }).success).toBe(false);
    expect(holidayDateParam.safeParse({ date: '2027-03-09' }).success).toBe(true);
    expect(holidayDateParam.safeParse({ date: 'tomorrow' }).success).toBe(false);
  });

  it('E20/S4: a holiday added for a working day stops the working-hour clock and is not offered as a day', () => {
    // Thursday 12 Nov 2026, 17:00 Dubai: 4 working hours end Friday 12:00, or Monday 12:00 if Friday is a holiday.
    const thursday5pm = Date.UTC(2026, 10, 12, 13);
    expect(addWorkingMinutes(thursday5pm, 240, DEFAULT_CALENDAR)).toBe(Date.UTC(2026, 10, 13, 8));
    const withFriday = calendarWithHolidays([...DEFAULT_CALENDAR.holidays, '2026-11-13']);
    expect(addWorkingMinutes(thursday5pm, 240, withFriday)).toBe(Date.UTC(2026, 10, 16, 8));
    expect(preferredDays(TODAY, DEFAULT_CALENDAR)).toContain('2026-11-13');
    expect(preferredDays(TODAY, withFriday)).not.toContain('2026-11-13');
  });

  it('E20: the apps use the API’s list, or the shipped calendar when it cannot be read', () => {
    expect(calendarFromAnswer(null)).toBe(DEFAULT_CALENDAR);
    const cal = calendarFromAnswer({ today: TODAY, holidays: [{ date: '2026-11-13', name: 'Test day' }] });
    expect([...cal.holidays]).toEqual(['2026-11-13']);
    expect(cal.hours).toBe(DEFAULT_CALENDAR.hours);
  });

  it('E20: the shipped list matches the default calendar, one row per date', () => {
    expect(DEFAULT_HOLIDAY_LIST).toHaveLength(DEFAULT_HOLIDAYS.length);
    expect(new Set(DEFAULT_HOLIDAY_LIST.map((h) => h.date))).toEqual(DEFAULT_CALENDAR.holidays);
  });
});
