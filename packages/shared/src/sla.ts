/**
 * SLA targets and clocks (BUILD_SPEC S4, A6, E20). Emergency clocks run 24/7, including Eid and public
 * holidays; routine clocks count working minutes only. While a request is on hold (parts/access, A6) or
 * waiting for the owner, the clock is paused (lifecycle.ts clockPaused).
 *
 * Each service's first deadline (first contact, booking, report, quote) is in service-targets.ts (ADR 0030);
 * later milestones of the report and consultation flows follow with those flows.
 */
import { addWorkingMinutes, workingMinutesBetween, type WorkingCalendar } from './calendar.js';
import { EMERGENCY_ACK_MINUTES, EMERGENCY_ON_SITE_MINUTES } from './emergency.js';

/** Mirrors the sla_outcomes.metric CHECK list in apps/api/migrations/0005_requests.sql. */
export const SLA_METRICS = [
  'emergency_ack',
  'emergency_on_site',
  'routine_response',
  'routine_visit',
  'quote_after_visit',
  'service_milestone',
] as const;
export type SlaMetric = (typeof SLA_METRICS)[number];

export type ClockKind = '24x7' | 'working';

export interface SlaTarget {
  readonly metric: SlaMetric;
  readonly minutes: number;
  readonly clock: ClockKind;
}

/** Working day length (09:00-18:00) used to turn "working days" into working minutes. */
export const WORKING_DAY_MINUTES = 9 * 60;

/** S4 maintenance targets, as proposed in the plan (p.10). */
export const MAINTENANCE_SLA = {
  emergencyAck: { metric: 'emergency_ack', minutes: EMERGENCY_ACK_MINUTES, clock: '24x7' },
  emergencyOnSite: { metric: 'emergency_on_site', minutes: EMERGENCY_ON_SITE_MINUTES, clock: '24x7' },
  routineResponse: { metric: 'routine_response', minutes: 4 * 60, clock: 'working' },
  routineVisit: { metric: 'routine_visit', minutes: 2 * WORKING_DAY_MINUTES, clock: 'working' },
  // "Quote 24 h after visit": the plan says hours, not working hours, so this clock runs 24/7 (ADR 0004).
  quoteAfterVisit: { metric: 'quote_after_visit', minutes: 24 * 60, clock: '24x7' },
} as const satisfies Record<string, SlaTarget>;

/** A closed interval [from, to) during which the clock was paused; `to` null = still paused. */
export interface Pause {
  readonly from: number;
  readonly to: number | null;
}

function clockMinutes(clock: ClockKind, a: number, b: number, cal: WorkingCalendar): number {
  if (b <= a) return 0;
  return clock === '24x7' ? (b - a) / 60_000 : workingMinutesBetween(a, b, cal);
}

/** Minutes counted on the clock between `start` and `now`, leaving out paused time. */
export function elapsedMinutes(
  clock: ClockKind,
  start: number,
  now: number,
  pauses: readonly Pause[],
  cal: WorkingCalendar,
): number {
  let total = clockMinutes(clock, start, now, cal);
  for (const p of pauses) {
    const from = Math.max(p.from, start);
    const to = Math.min(p.to ?? now, now);
    total -= clockMinutes(clock, from, to, cal);
  }
  return Math.max(0, total);
}

/**
 * When the target falls due, given the pauses so far. Null while the clock is paused (no deadline runs).
 * Pauses must not overlap each other.
 */
export function dueAt(
  target: SlaTarget,
  start: number,
  pauses: readonly Pause[],
  cal: WorkingCalendar,
): number | null {
  if (pauses.some((p) => p.to === null)) return null;
  const resumedAt = Math.max(start, ...pauses.map((p) => p.to ?? start));
  const used = elapsedMinutes(target.clock, start, resumedAt, pauses, cal);
  const remaining = Math.max(0, target.minutes - used);
  return target.clock === '24x7'
    ? resumedAt + remaining * 60_000
    : addWorkingMinutes(resumedAt, remaining, cal);
}

/** Whether the target was met: done no later than its due time. */
export function slaMet(due: number, doneAt: number): boolean {
  return doneAt <= due;
}
