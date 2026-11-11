/**
 * UAE public holidays kept by JAD+ Admin (BUILD_SPEC E20, S4; ADR 0028). Islamic holiday dates are only
 * confirmed close to the day, so JAD+ Admin adds and removes them in the console instead of waiting for a new
 * release. Only days after today (Dubai) can change: today and the past stay as they were, so clocks already
 * running and past figures stay fair.
 *
 * Pure rules and payloads; the API keeps the list in the `holidays` table (migration 0025).
 */
import { z } from 'zod';
import { DEFAULT_CALENDAR, DEFAULT_HOLIDAYS, DEFAULT_HOURS, type WorkingCalendar } from './calendar.js';
import { plainText } from './admin-platform.js';
import { calendarDate } from './partner-office/schemas.js';

export const HOLIDAY_NAME_MIN = 2;
export const HOLIDAY_NAME_MAX = 80;

export type Holiday = Readonly<{ date: string; name: string }>;

/** The holidays JAD+ shipped with, as rows (what migration 0025 seeds). */
export const DEFAULT_HOLIDAY_LIST: readonly Holiday[] = DEFAULT_HOLIDAYS.map(([date, name]) => ({
  date,
  name,
}));

/** E20: the working calendar (DEFAULT_HOURS) with these holiday dates. */
export function calendarWithHolidays(dates: Iterable<string>): WorkingCalendar {
  return { hours: DEFAULT_HOURS, holidays: new Set(dates) };
}

/** E20: a holiday can be added or removed only for a day strictly after today (Dubai). */
export function holidayEditable(date: string, today: string): boolean {
  return date > today;
}

export type HolidayProblem = 'not_future' | 'already_holiday' | 'not_holiday';

/** Why this change cannot be made, or null when it can (E20). `holidays` are the dates on file now. */
export function holidayChangeProblem(
  change: Readonly<{ kind: 'add' | 'remove'; date: string }>,
  today: string,
  holidays: ReadonlySet<string>,
): HolidayProblem | null {
  if (!holidayEditable(change.date, today)) return 'not_future';
  if (change.kind === 'add' && holidays.has(change.date)) return 'already_holiday';
  if (change.kind === 'remove' && !holidays.has(change.date)) return 'not_holiday';
  return null;
}

export const HOLIDAY_PROBLEM_TEXT: Readonly<Record<HolidayProblem, string>> = {
  not_future: 'Only days after today can change: today and past days stay as they were.',
  already_holiday: 'That day is already a holiday.',
  not_holiday: 'That day is not a holiday.',
};

// ---- Payloads (strict: unknown keys rejected, C-VAL-1) ----

/** POST /api/admin/holidays. */
export const holidayBody = z.strictObject({
  date: calendarDate,
  name: plainText(HOLIDAY_NAME_MAX).pipe(
    z.string().min(HOLIDAY_NAME_MIN, `Give a name of at least ${String(HOLIDAY_NAME_MIN)} characters.`),
  ),
});
export type HolidayBody = z.infer<typeof holidayBody>;

/** DELETE /api/admin/holidays/:date. */
export const holidayDateParam = z.strictObject({ date: calendarDate });

const holidayView = z.object({ date: z.string(), name: z.string() });

/** GET /api/admin/holidays: every holiday on file, oldest first, with whether it can still change. */
export const adminHolidaysResponse = z.object({
  today: z.string(),
  holidays: z.array(holidayView.extend({ editable: z.boolean(), addedAt: z.number() })),
});
export type AdminHolidays = z.infer<typeof adminHolidaysResponse>;

/** POST /api/admin/holidays (201) and DELETE /api/admin/holidays/:date. */
export const holidayChangedResponse = z.object({
  date: z.string(),
  name: z.string(),
  removed: z.boolean(),
});

/** GET /api/calendar (every signed-in person): today and the holidays from today on, for offering days. */
export const calendarResponse = z.object({ today: z.string(), holidays: z.array(holidayView) });
export type CalendarAnswer = z.infer<typeof calendarResponse>;

/** The working calendar from the API's answer, or the one JAD+ shipped with when there is no answer. */
export function calendarFromAnswer(answer: CalendarAnswer | null): WorkingCalendar {
  return answer === null ? DEFAULT_CALENDAR : calendarWithHolidays(answer.holidays.map((h) => h.date));
}
