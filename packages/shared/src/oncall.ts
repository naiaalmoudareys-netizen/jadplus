/**
 * Weekly on-call rota (BUILD_SPEC section 11, E6, E7): JAD+ Admin plus a second person each week, alerted
 * when an emergency escalates. Weeks start on Monday (Dubai time).
 */
import type { UserRole } from './auth.js';

const DAY_MS = 86_400_000;

export const ON_CALL_POSITIONS = ['first', 'second'] as const;
export type OnCallPosition = (typeof ON_CALL_POSITIONS)[number];

/** True for a real calendar date (YYYY-MM-DD) that is a Monday. */
export function isMonday(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const t = Date.parse(`${date}T00:00:00Z`);
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === date && new Date(t).getUTCDay() === 1;
}

/** The Monday that starts the week containing this Dubai date. */
export function weekStarting(dubaiDay: string): string {
  const t = Date.parse(`${dubaiDay}T00:00:00Z`);
  const back = (new Date(t).getUTCDay() + 6) % 7;
  return new Date(t - back * DAY_MS).toISOString().slice(0, 10);
}

/**
 * Section 11: the first person on call is a JAD+ Admin; the second may be an admin or a JAD+ viewer (staff
 * who can see requests). Partner, owner and tenant accounts are never on the JAD+ rota.
 */
export function canBeOnCall(position: OnCallPosition, roles: readonly UserRole[]): boolean {
  if (position === 'first') return roles.includes('jad_admin');
  return roles.includes('jad_admin') || roles.includes('jad_viewer');
}

/** E6/E7: the "Needs action" list warns about this week and the next when someone is missing on the rota. */
export const ON_CALL_WEEKS_CHECKED = 2;

export interface OnCallGap {
  /** The Monday the week starts (YYYY-MM-DD). */
  readonly week: string;
  readonly missing: readonly OnCallPosition[];
}

/**
 * E6/E7: weeks (this one and the next) where the first or second person is missing. `filled` holds the
 * rota places taken by an active account; a week with nobody means an unacknowledged emergency reaches
 * nobody named at JAD+.
 */
export function onCallGaps(
  today: string,
  filled: readonly { readonly week: string; readonly position: OnCallPosition }[],
): OnCallGap[] {
  const first = Date.parse(`${weekStarting(today)}T00:00:00Z`);
  const gaps: OnCallGap[] = [];
  for (let i = 0; i < ON_CALL_WEEKS_CHECKED; i += 1) {
    const week = new Date(first + i * 7 * DAY_MS).toISOString().slice(0, 10);
    const missing = ON_CALL_POSITIONS.filter((p) => !filled.some((f) => f.week === week && f.position === p));
    if (missing.length > 0) gaps.push({ week, missing });
  }
  return gaps;
}
