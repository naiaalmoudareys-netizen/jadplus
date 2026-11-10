/**
 * JAD+ working calendar for SLA clocks (BUILD_SPEC E20, section 11).
 * Working week Monday to Friday, 09:00 to 18:00 Dubai time (UTC+4, no daylight saving),
 * minus UAE public holidays. Emergency clocks do NOT use this calendar (they run 24/7).
 *
 * Pure functions: the calendar is always passed in, never read from global state.
 */

const DUBAI_OFFSET_MS = 4 * 3_600_000;
const DAY_MS = 86_400_000;
/** Safety bound for loops: no SLA spans more than ~1 year of calendar days. */
const MAX_DAYS = 400;

/** 0 = Sunday … 6 = Saturday (same as Date#getUTCDay). */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface WorkingHours {
  /** Minutes after midnight (Dubai) the working day starts, e.g. 540 = 09:00. */
  readonly startMinute: number;
  /** Minutes after midnight (Dubai) the working day ends, e.g. 1080 = 18:00. */
  readonly endMinute: number;
  readonly days: readonly Weekday[];
}

export interface WorkingCalendar {
  readonly hours: WorkingHours;
  /** ISO dates (YYYY-MM-DD, Dubai) that are public holidays. */
  readonly holidays: ReadonlySet<string>;
}

export const DEFAULT_HOURS: WorkingHours = { startMinute: 9 * 60, endMinute: 18 * 60, days: [1, 2, 3, 4, 5] };

/**
 * UAE public holidays. Islamic dates depend on the moon sighting and must be confirmed
 * against the official announcement each year (editable in the admin console).
 */
export const DEFAULT_HOLIDAYS: readonly (readonly [string, string])[] = [
  ['2026-01-01', "New Year's Day"],
  ['2026-03-19', 'Eid al-Fitr (expected)'],
  ['2026-03-20', 'Eid al-Fitr (expected)'],
  ['2026-03-21', 'Eid al-Fitr (expected)'],
  ['2026-05-26', 'Arafat Day (expected)'],
  ['2026-05-27', 'Eid al-Adha (expected)'],
  ['2026-05-28', 'Eid al-Adha (expected)'],
  ['2026-05-29', 'Eid al-Adha (expected)'],
  ['2026-06-16', 'Hijri New Year (expected)'],
  ['2026-08-25', "Prophet's Birthday (expected)"],
  ['2026-12-01', 'Commemoration Day'],
  ['2026-12-02', 'National Day'],
  ['2026-12-03', 'National Day'],
  ['2027-01-01', "New Year's Day"],
  ['2027-03-09', 'Eid al-Fitr (expected)'],
  ['2027-03-10', 'Eid al-Fitr (expected)'],
  ['2027-03-11', 'Eid al-Fitr (expected)'],
  ['2027-05-15', 'Arafat Day (expected)'],
  ['2027-05-16', 'Eid al-Adha (expected)'],
  ['2027-05-17', 'Eid al-Adha (expected)'],
  ['2027-05-18', 'Eid al-Adha (expected)'],
  ['2027-06-06', 'Hijri New Year (expected)'],
  ['2027-08-14', "Prophet's Birthday (expected)"],
  ['2027-12-01', 'Commemoration Day'],
  ['2027-12-02', 'National Day'],
  ['2027-12-03', 'National Day'],
];

export const DEFAULT_CALENDAR: WorkingCalendar = {
  hours: DEFAULT_HOURS,
  holidays: new Set(DEFAULT_HOLIDAYS.map(([day]) => day)),
};

/** Start of the next Dubai calendar day after instant `t` (UTC ms). */
function nextDubaiMidnight(t: number): number {
  return Math.floor((t + DUBAI_OFFSET_MS) / DAY_MS) * DAY_MS + DAY_MS - DUBAI_OFFSET_MS;
}

/** Dubai calendar date (YYYY-MM-DD) of instant `t`. */
export function dubaiDate(t: number): string {
  return new Date(t + DUBAI_OFFSET_MS).toISOString().slice(0, 10);
}

/** Working window [open, close) in UTC ms for the Dubai day containing `t`, or null if it is not a working day. */
function workingWindow(t: number, cal: WorkingCalendar): readonly [number, number] | null {
  const dayStartLocal = Math.floor((t + DUBAI_OFFSET_MS) / DAY_MS) * DAY_MS;
  const weekday = new Date(dayStartLocal).getUTCDay() as Weekday;
  if (
    !cal.hours.days.includes(weekday) ||
    cal.holidays.has(new Date(dayStartLocal).toISOString().slice(0, 10))
  ) {
    return null;
  }
  const dayStartUtc = dayStartLocal - DUBAI_OFFSET_MS;
  return [dayStartUtc + cal.hours.startMinute * 60_000, dayStartUtc + cal.hours.endMinute * 60_000];
}

/** The instant at which `minutes` working minutes have passed after `start`. */
export function addWorkingMinutes(start: number, minutes: number, cal: WorkingCalendar): number {
  if (minutes <= 0) return start;
  let remaining = minutes * 60_000;
  let t = start;
  for (let i = 0; i < MAX_DAYS; i++) {
    const window = workingWindow(t, cal);
    if (window && t < window[1]) {
      const from = Math.max(t, window[0]);
      const take = Math.min(remaining, window[1] - from);
      remaining -= take;
      t = from + take;
      if (remaining <= 0) return t;
    }
    t = nextDubaiMidnight(t);
  }
  return t;
}

/** Working minutes between instants `a` and `b` (0 if b <= a). */
export function workingMinutesBetween(a: number, b: number, cal: WorkingCalendar): number {
  if (b <= a) return 0;
  let total = 0;
  let t = a;
  for (let i = 0; i < MAX_DAYS && t < b; i++) {
    const window = workingWindow(t, cal);
    if (window) {
      const from = Math.max(t, window[0]);
      const to = Math.min(b, window[1]);
      if (to > from) total += to - from;
    }
    t = nextDubaiMidnight(t);
  }
  return total / 60_000;
}

/** True when `t` falls inside working hours. */
export function isWorkingTime(t: number, cal: WorkingCalendar): boolean {
  const window = workingWindow(t, cal);
  return window !== null && t >= window[0] && t < window[1];
}
