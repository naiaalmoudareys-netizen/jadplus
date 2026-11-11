/**
 * The working calendar the API runs on (BUILD_SPEC E20, S4; ADR 0028): working hours from packages/shared
 * (DEFAULT_HOURS) and the UAE public holidays JAD+ Admin keeps in the `holidays` table (migration 0025).
 * Every working-hour clock, the preferred visit days and the after-hours rule read it through loadCalendar.
 */
import { calendarWithHolidays, type Holiday, type WorkingCalendar } from '@jadplus/shared';

export interface HolidayRow {
  date: string;
  name: string;
  added_at: number;
}

/** Every holiday on file, oldest first. */
export async function loadHolidays(db: D1Database): Promise<HolidayRow[]> {
  const { results } = await db
    .prepare('SELECT date, name, added_at FROM holidays ORDER BY date')
    .all<HolidayRow>();
  return results;
}

/** Holidays from `fromDate` (YYYY-MM-DD, Dubai) on, oldest first. */
export async function loadHolidaysFrom(db: D1Database, fromDate: string): Promise<Holiday[]> {
  const { results } = await db
    .prepare('SELECT date, name FROM holidays WHERE date >= ? ORDER BY date')
    .bind(fromDate)
    .all<{ date: string; name: string }>();
  return results;
}

/** E20: the working calendar with the holidays on file now. */
export async function loadCalendar(db: D1Database): Promise<WorkingCalendar> {
  const { results } = await db.prepare('SELECT date FROM holidays').all<{ date: string }>();
  return calendarWithHolidays(results.map((r) => r.date));
}
