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
