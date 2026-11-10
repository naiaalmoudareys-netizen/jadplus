/**
 * The dispatch day view (ADR 0025; R3, E4): each technician's visits on a 09:00-18:00 grid in 30-minute steps,
 * drawn with CSS grid lines only (classes gs-N / ge-N, no inline styles: the CSP forbids them). A visit that
 * runs past the edges is clipped and marked; one entirely outside the day's hours is listed apart.
 */
import { dayStart } from './dates';

export const DAY_START_MINUTE = 9 * 60;
export const DAY_END_MINUTE = 18 * 60;
export const STEP_MINUTES = 30;
/** 18 half-hour columns, so grid lines 1 to 19. */
export const COLUMNS = (DAY_END_MINUTE - DAY_START_MINUTE) / STEP_MINUTES;

export interface Placement {
  /** Grid line the block starts on (1 to COLUMNS). */
  readonly start: number;
  /** Grid line the block ends on (2 to COLUMNS + 1). */
  readonly end: number;
  readonly clippedBefore: boolean;
  readonly clippedAfter: boolean;
}

/** Where a visit sits on the grid of `date` (Dubai), or null when it falls outside 09:00-18:00 that day. */
export function placeVisit(windowStart: number, windowEnd: number, date: string): Placement | null {
  const base = dayStart(date);
  if (base === null) return null;
  const from = (windowStart - base) / 60_000;
  const to = (windowEnd - base) / 60_000;
  if (to <= DAY_START_MINUTE || from >= DAY_END_MINUTE || to <= from) return null;
  const start = Math.max(1, Math.floor((from - DAY_START_MINUTE) / STEP_MINUTES) + 1);
  const end = Math.min(COLUMNS + 1, Math.ceil((to - DAY_START_MINUTE) / STEP_MINUTES) + 1);
  return {
    start,
    end: Math.max(end, start + 1),
    clippedBefore: from < DAY_START_MINUTE,
    clippedAfter: to > DAY_END_MINUTE,
  };
}

/** "09:00" … "17:00": the hour labels over the grid (each spans two columns). */
export function hourLabels(): string[] {
  const hours: string[] = [];
  for (let m = DAY_START_MINUTE; m < DAY_END_MINUTE; m += 60) {
    hours.push(`${String(m / 60).padStart(2, '0')}:00`);
  }
  return hours;
}

/** Technicians in the order the office chooses from: suggested ones first (best first), then the rest. */
export function choiceOrder<T extends { readonly id: string }>(
  technicians: readonly T[],
  suggested: readonly string[],
): { readonly technician: T; readonly suggested: boolean }[] {
  const first = suggested
    .map((id) => technicians.find((t) => t.id === id))
    .filter((t): t is T => t !== undefined);
  const rest = technicians.filter((t) => !suggested.includes(t.id));
  return [
    ...first.map((technician) => ({ technician, suggested: true })),
    ...rest.map((technician) => ({ technician, suggested: false })),
  ];
}
