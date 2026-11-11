/**
 * Who is told, beyond the request's own people (ADR 0027):
 *
 * - V1: a building notice reaches every owner and current tenant of a unit in that building (or, for a
 *   project-wide notice, anywhere in the project), each person once.
 * - E12: a building management alert goes to the contacts kept for the unit's building and for its whole
 *   project. Building contacts are not JAD+ users; their details stay encrypted until the moment of sending.
 * - E5-E7: outside working hours, a partner's emergency alert (new job, 15-minute reminder) also goes to the
 *   technician the partner named as its after-hours contact for that week.
 */
import { placeCovers, type Place } from './admin-platform.js';
import { dubaiDate, isWorkingTime, type WorkingCalendar } from './calendar.js';
import type { NotificationTemplate, RecipientKind } from './messages.js';
import { weekStarting } from './oncall.js';

/** A person's home as far as notices are concerned: an owned unit or a current tenancy. */
export interface Home {
  readonly userId: string;
  readonly project: string | null;
  readonly building: string | null;
}

/** V1: the people a notice for `target` goes to, each once, in the order first met. */
export function noticeAudience(target: Place, homes: readonly Home[]): string[] {
  const people = homes
    .filter((h) => h.project !== null && placeCovers(target, { project: h.project, building: h.building }))
    .map((h) => h.userId);
  return [...new Set(people)];
}

/** E12: the building contacts that cover a unit at `unit` (its building's own and the project-wide ones). */
export function contactsCovering<C extends Place>(contacts: readonly C[], unit: Place): C[] {
  return contacts.filter((c) => placeCovers(c, unit));
}

/** The partner alerts that wake the after-hours contact too: the new emergency (E1, E6) and the reminder (E5). */
const AFTER_HOURS_TEMPLATES: ReadonlySet<NotificationTemplate> = new Set<NotificationTemplate>([
  'emergency_new_job',
  'emergency_reminder',
]);

/**
 * E5-E7: the week (Monday, Dubai) whose after-hours contact must also receive this alert, or null when the
 * alert is not for a partner, not an emergency call to act, or was raised during working hours (then the
 * partner's alert line and office are enough).
 */
export function afterHoursWeek(
  alert: {
    readonly recipientKind: RecipientKind;
    readonly template: NotificationTemplate;
    readonly at: number;
  },
  cal: WorkingCalendar,
): string | null {
  if (alert.recipientKind !== 'partner' || !AFTER_HOURS_TEMPLATES.has(alert.template)) return null;
  if (isWorkingTime(alert.at, cal)) return null;
  return weekStarting(dubaiDate(alert.at));
}
