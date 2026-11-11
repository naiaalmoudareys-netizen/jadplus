/**
 * Where a request stands on the clock (S4, E4, R3, R4): whether the partner has answered it, and the next
 * deadline with the time left. Shown on the console's job and request pages to the partner and to JAD+ staff;
 * residents never see SLA clocks (S8).
 *
 * "Acknowledged" means: an emergency acknowledged with a technician and an arrival window (E4); a routine
 * request answered by booking the visit (the S4 first response).
 */
import { z } from 'zod';
import { clockPaused, type Status } from './lifecycle.js';

export interface ClockFacts {
  readonly status: Status;
  readonly isEmergency: boolean;
  /** requests.acknowledged_at (emergencies only). */
  readonly acknowledgedAt: number | null;
  /** The first time a visit was booked, if ever. */
  readonly firstVisitBookedAt: number | null;
  readonly nextDueAt: number | null;
  readonly nextDueKind: string | null;
}

export interface RequestClock {
  readonly acknowledged: boolean;
  readonly acknowledgedAt: number | null;
  readonly nextDueAt: number | null;
  readonly nextDueKind: string | null;
  /** Whole minutes to the deadline (negative = late), or null when nothing is due. */
  readonly minutesLeft: number | null;
  /** The clock is paused (on hold, quote with the owner, waiting for the owner: A6). */
  readonly paused: boolean;
}

/** The request's clock at `now`. */
export function requestClock(f: ClockFacts, now: number): RequestClock {
  const acknowledgedAt = f.isEmergency ? f.acknowledgedAt : f.firstVisitBookedAt;
  const due = f.nextDueAt === null || f.nextDueKind === null ? null : f.nextDueAt;
  return {
    acknowledged: acknowledgedAt !== null,
    acknowledgedAt,
    nextDueAt: due,
    nextDueKind: due === null ? null : f.nextDueKind,
    // Rounded down, so "0 minutes left" never shows once the deadline has passed.
    minutesLeft: due === null ? null : Math.floor((due - now) / 60_000),
    paused: clockPaused(f.status),
  };
}

export const requestClockSchema = z.object({
  acknowledged: z.boolean(),
  acknowledgedAt: z.number().int().nullable(),
  nextDueAt: z.number().int().nullable(),
  nextDueKind: z.string().nullable(),
  minutesLeft: z.number().int().nullable(),
  paused: z.boolean(),
});
