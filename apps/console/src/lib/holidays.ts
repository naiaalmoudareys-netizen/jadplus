/**
 * Pure rules behind the Holidays section of Settings (E20, ADR 0028): which holidays can still change, and what
 * is wrong with a holiday about to be added, in the same words the API uses.
 */
import {
  HOLIDAY_PROBLEM_TEXT,
  addDays,
  holidayBody,
  holidayChangeProblem,
  type AdminHolidays,
  type HolidayBody,
} from '@jadplus/shared';

type Row = AdminHolidays['holidays'][number];

/** Days after today (can change), and today and earlier (read-only, newest first). */
export function splitHolidays(rows: readonly Row[]): { upcoming: Row[]; past: Row[] } {
  return {
    upcoming: rows.filter((h) => h.editable),
    past: rows.filter((h) => !h.editable).reverse(),
  };
}

/** The first day a holiday can be added for (the date picker's minimum). */
export function firstEditableDay(today: string): string {
  return addDays(today, 1);
}

/** The holiday to send, or what to fix first. */
export function holidayToAdd(
  form: Readonly<{ date: string; name: string }>,
  today: string,
  rows: readonly Row[],
): { body: HolidayBody } | { problem: string } {
  const parsed = holidayBody.safeParse(form);
  if (!parsed.success) {
    return { problem: parsed.error.issues[0]?.message ?? 'Check the date and the name.' };
  }
  const onFile = new Set(rows.map((h) => h.date));
  const problem = holidayChangeProblem({ kind: 'add', date: parsed.data.date }, today, onFile);
  return problem === null ? { body: parsed.data } : { problem: HOLIDAY_PROBLEM_TEXT[problem] };
}
