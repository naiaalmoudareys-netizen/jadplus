/**
 * Calendar dates and times as JAD+ staff type them: everything is Dubai time (UTC+4, no daylight saving),
 * whatever the computer's own clock zone.
 */
import { addDays, dubaiDate } from '@jadplus/shared';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Today in Dubai, YYYY-MM-DD. */
export function today(now: number): string {
  return dubaiDate(now);
}

/** A day `days` after (or before) a YYYY-MM-DD date. */
export function shiftDay(date: string, days: number): string {
  return addDays(date, days);
}

/** The instant of a Dubai date and time ("2026-11-12", "14:30"), or null when either is not valid. */
export function dubaiInstant(date: string, time: string): number | null {
  if (!DATE.test(date) || !TIME.test(time)) return null;
  const t = Date.parse(`${date}T${time}:00+04:00`);
  return Number.isNaN(t) ? null : t;
}

/** The start of a Dubai day as an instant (00:00), or null for a date that is not valid. */
export function dayStart(date: string): number | null {
  return dubaiInstant(date, '00:00');
}

/** The end of a Dubai day (the next day's 00:00), or null. */
export function dayEnd(date: string): number | null {
  const start = dayStart(date);
  return start === null ? null : start + 86_400_000;
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;

/** "Monday" for 1 (0 = Sunday, as JavaScript and the working calendar count). */
export function weekdayName(day: number): string {
  return WEEKDAYS[day] ?? String(day);
}

/** "Thursday" for a YYYY-MM-DD date. */
export function weekdayOf(date: string): string {
  return weekdayName(new Date(`${date}T00:00:00Z`).getUTCDay());
}
