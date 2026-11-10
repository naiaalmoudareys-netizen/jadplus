/**
 * How times, deadlines and statuses read on the console (ADR 0023). All times are Dubai time (UTC+4, no
 * daylight saving), whatever the computer's own clock zone. English only: the console is for staff.
 */
import { VISIT_SLOTS, dubaiClock, dubaiDate, type Status, type VisitSlot } from '@jadplus/shared';

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

/** "1 day", "2 h 10 min", "45 min", "under 1 min". */
export function duration(ms: number): string {
  const span = Math.max(0, ms);
  if (span < MIN) return 'under 1 min';
  if (span < HOUR) return `${Math.floor(span / MIN)} min`;
  if (span < DAY) {
    const hours = Math.floor(span / HOUR);
    const minutes = Math.floor((span % HOUR) / MIN);
    return minutes === 0 ? `${hours} h` : `${hours} h ${minutes} min`;
  }
  const days = Math.floor(span / DAY);
  return days === 1 ? '1 day' : `${days} days`;
}

/** "5 min ago", "just now". */
export function ago(at: number, now: number): string {
  return now - at < MIN ? 'just now' : `${duration(now - at)} ago`;
}

/** "Due in 2 h", "Overdue by 10 min", or null when nothing is due. */
export function deadlineText(dueAt: number | null, now: number): string | null {
  if (dueAt === null) return null;
  return dueAt >= now ? `Due in ${duration(dueAt - now)}` : `Overdue by ${duration(now - dueAt)}`;
}

/** "10 Nov 2026" for a YYYY-MM-DD date. */
export function dayText(date: string): string {
  const [year, month, day] = date.split('-');
  const name = MONTHS[Number(month) - 1];
  if (year === undefined || day === undefined || name === undefined) return date;
  return `${String(Number(day))} ${name} ${year}`;
}

/** "10 Nov 2026, 14:05" (Dubai time). */
export function dateTime(at: number): string {
  return `${dayText(dubaiDate(at))}, ${dubaiClock(at)}`;
}

/** "Today 14:00-16:00", or "11 Nov 2026, 14:00-16:00" when the window is on another day. */
export function windowText(start: number, end: number, now: number): string {
  const clock = `${dubaiClock(start)}-${dubaiClock(end)}`;
  return dubaiDate(start) === dubaiDate(now) ? `Today ${clock}` : `${dayText(dubaiDate(start))}, ${clock}`;
}

/** "12 Nov 2026 · Morning (9:00 - 12:00)": when the owner would like the visit (ADR 0013). */
export function preferredText(visit: { date: string; slot: VisitSlot }): string {
  const slot = VISIT_SLOTS.find((s) => s.key === visit.slot);
  return slot === undefined ? dayText(visit.date) : `${dayText(visit.date)} · ${slot.label} (${slot.hours})`;
}

/** Status names as JAD+ staff read them. */
export const STATUS_LABELS: Readonly<Record<Status, string>> = {
  awaiting_owner: 'Waiting for the owner',
  submitted: 'Received, no partner yet',
  assigned: 'With the partner',
  quote_sent: 'Quote with the owner',
  scheduled: 'Visit booked',
  in_progress: 'In progress',
  on_hold: 'On hold',
  completed: 'Done, to be confirmed',
  reopened: 'Reopened',
  closed: 'Closed',
  cancelled: 'Cancelled',
};

/** Colour families from docs/DESIGN.md. */
export type Tone = 'good' | 'warn' | 'bad' | 'calm';

const STATUS_TONES: Readonly<Record<Status, Tone>> = {
  awaiting_owner: 'warn',
  submitted: 'warn',
  assigned: 'calm',
  quote_sent: 'warn',
  scheduled: 'calm',
  in_progress: 'calm',
  on_hold: 'warn',
  completed: 'good',
  reopened: 'bad',
  closed: 'good',
  cancelled: 'calm',
};

export function statusTone(status: Status): Tone {
  return STATUS_TONES[status];
}

/** "AED 1,250" (no decimals when whole). */
export function aed(amount: number): string {
  const fixed = Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
  const [whole = '0', cents] = fixed.split('.');
  const groups: string[] = [];
  for (let end = whole.length; end > 0; end -= 3) groups.unshift(whole.slice(Math.max(0, end - 3), end));
  const grouped = groups.join(',');
  return cents === undefined ? `AED ${grouped}` : `AED ${grouped}.${cents}`;
}

/** Money stored in fils (1 AED = 100 fils): "AED 1,250.50". */
export function fils(amount: number): string {
  return aed(amount / 100);
}

/** "92 %", or "—" when there was nothing to measure (S5: never a made-up figure). */
export function percentText(value: number | null): string {
  return value === null ? '—' : `${String(value)} %`;
}

/** "4.6 / 5", or "—" with no ratings. */
export function starsText(value: number | null): string {
  return value === null ? '—' : `${value.toFixed(1)} / 5`;
}

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

/** "November 2026" for "2026-11". */
export function monthText(month: string): string {
  const [year, m] = month.split('-');
  const name = MONTH_NAMES[Number(m) - 1];
  return name === undefined || year === undefined ? month : `${name} ${year}`;
}

/** The month `delta` months from "YYYY-MM" (negative goes back). */
export function shiftMonth(month: string, delta: number): string {
  const [y = 1970, m = 1] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 + delta, 1)).toISOString().slice(0, 7);
}

/** "2 h 30 min" for minutes, or "—" with no data. */
export function minutesText(minutes: number | null): string {
  return minutes === null ? '—' : duration(minutes * MIN);
}

/** "snake_case_words" or "camelCase" as "Snake case words", for codes the console has no label for. */
export function humanize(code: string): string {
  const words = code
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
    .toLowerCase();
  return words === '' ? code : words.charAt(0).toUpperCase() + words.slice(1);
}

/** "1.2 MB", "350 KB". */
export function bytesText(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${String(Math.max(1, Math.round(bytes / 1024)))} KB`;
}
