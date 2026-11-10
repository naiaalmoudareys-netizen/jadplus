import { describe, expect, it } from 'vitest';
import {
  aed,
  ago,
  dateTime,
  dayText,
  deadlineText,
  duration,
  preferredText,
  windowText,
} from '../src/lib/format';
import { onTimeText, ratingText } from '../src/lib/stats';

const MIN = 60_000;
const HOUR = 60 * MIN;
// 10 Nov 2026, 12:00 in Dubai (08:00 UTC).
const NOW = Date.UTC(2026, 10, 10, 8, 0);

describe('times and deadlines (Dubai time)', () => {
  it('says how long in plain words', () => {
    expect(duration(20_000)).toBe('under 1 min');
    expect(duration(45 * MIN)).toBe('45 min');
    expect(duration(2 * HOUR)).toBe('2 h');
    expect(duration(2 * HOUR + 10 * MIN)).toBe('2 h 10 min');
    expect(duration(30 * HOUR)).toBe('1 day');
    expect(duration(72 * HOUR)).toBe('3 days');
    expect(duration(-5 * MIN)).toBe('under 1 min');
  });

  it('R4: a deadline reads "Due in" before it and "Overdue by" after it', () => {
    expect(deadlineText(null, NOW)).toBeNull();
    expect(deadlineText(NOW + 3 * HOUR, NOW)).toBe('Due in 3 h');
    expect(deadlineText(NOW - 15 * MIN, NOW)).toBe('Overdue by 15 min');
    expect(ago(NOW - 10_000, NOW)).toBe('just now');
    expect(ago(NOW - 5 * MIN, NOW)).toBe('5 min ago');
  });

  it('shows dates and clocks in Dubai time, whatever the computer’s zone', () => {
    expect(dayText('2026-11-03')).toBe('3 Nov 2026');
    expect(dateTime(NOW)).toBe('10 Nov 2026, 12:00');
    // 22:30 UTC is already the next day in Dubai.
    expect(dateTime(Date.UTC(2026, 10, 10, 22, 30))).toBe('11 Nov 2026, 02:30');
    expect(windowText(NOW + 2 * HOUR, NOW + 4 * HOUR, NOW)).toBe('Today 14:00-16:00');
    expect(windowText(NOW + 24 * HOUR, NOW + 26 * HOUR, NOW)).toBe('11 Nov 2026, 12:00-14:00');
    expect(preferredText({ date: '2026-11-12', slot: 'morning' })).toBe(
      '12 Nov 2026 · Morning (9:00 - 12:00)',
    );
  });

  it('writes dirham amounts with thousands separators', () => {
    expect(aed(1250)).toBe('AED 1,250');
    expect(aed(980.5)).toBe('AED 980.50');
    expect(aed(1234567)).toBe('AED 1,234,567');
  });
});

describe('partner numbers (S5: real data only)', () => {
  it('shows a dash, not a made-up figure, when nothing was measured or rated', () => {
    expect(onTimeText({ met: 0, total: 0 })).toBe('—');
    expect(onTimeText({ met: 11, total: 12 })).toBe('92 %');
    expect(ratingText({ average: null, count: 0 })).toBe('—');
    expect(ratingText({ average: 4.6, count: 5 })).toBe('4.6 / 5');
  });
});
