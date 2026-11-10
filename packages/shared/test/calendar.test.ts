import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CALENDAR,
  addWorkingMinutes,
  dubaiDate,
  isWorkingTime,
  workingMinutesBetween,
  type WorkingCalendar,
} from '../src/calendar.js';

/** Dubai local time → UTC ms (Dubai is UTC+4 all year). */
const dubai = (iso: string): number => Date.parse(`${iso}+04:00`);

describe('working calendar (E20, section 11)', () => {
  it('counts 4 working hours inside one working day', () => {
    // Monday 2 Nov 2026, 10:00 Dubai
    expect(addWorkingMinutes(dubai('2026-11-02T10:00:00'), 240, DEFAULT_CALENDAR)).toBe(
      dubai('2026-11-02T14:00:00'),
    );
  });

  it('carries over the evening and skips the weekend', () => {
    // Friday 6 Nov 2026, 17:00 + 4 working hours → Monday 9 Nov 12:00
    expect(addWorkingMinutes(dubai('2026-11-06T17:00:00'), 240, DEFAULT_CALENDAR)).toBe(
      dubai('2026-11-09T12:00:00'),
    );
  });

  it('starts at opening time when raised before 09:00', () => {
    expect(addWorkingMinutes(dubai('2026-11-02T06:30:00'), 60, DEFAULT_CALENDAR)).toBe(
      dubai('2026-11-02T10:00:00'),
    );
  });

  it('pauses routine clocks on public holidays (E20)', () => {
    // Tue 1 Dec 2026 – Thu 3 Dec are holidays; Mon 30 Nov 17:00 + 2 h → Fri 4 Dec 10:00
    expect(addWorkingMinutes(dubai('2026-11-30T17:00:00'), 120, DEFAULT_CALENDAR)).toBe(
      dubai('2026-12-04T10:00:00'),
    );
  });

  it('measures working minutes between two instants', () => {
    expect(
      workingMinutesBetween(dubai('2026-11-06T17:00:00'), dubai('2026-11-09T12:00:00'), DEFAULT_CALENDAR),
    ).toBe(240);
    expect(
      workingMinutesBetween(dubai('2026-11-09T12:00:00'), dubai('2026-11-06T17:00:00'), DEFAULT_CALENDAR),
    ).toBe(0);
  });

  it('respects edited working hours', () => {
    const saturdayOpen: WorkingCalendar = {
      hours: { startMinute: 600, endMinute: 900, days: [6] },
      holidays: new Set(),
    };
    expect(isWorkingTime(dubai('2026-11-07T11:00:00'), saturdayOpen)).toBe(true);
    expect(isWorkingTime(dubai('2026-11-09T11:00:00'), saturdayOpen)).toBe(false);
  });

  it('gives the Dubai date of an instant', () => {
    expect(dubaiDate(Date.parse('2026-11-08T21:30:00Z'))).toBe('2026-11-09');
  });

  it('returns the start for zero minutes', () => {
    const t = dubai('2026-11-02T10:00:00');
    expect(addWorkingMinutes(t, 0, DEFAULT_CALENDAR)).toBe(t);
  });
});
