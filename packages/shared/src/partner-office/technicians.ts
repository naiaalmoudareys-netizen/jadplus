/**
 * Per-technician numbers for the partner office (ADR 0025; S5 "real data only", S6, S8): for each technician of
 * the company, jobs finished, SLA targets met, average rating, repeat visits and open jobs, over the last 30
 * days or one Dubai month, compared with JAD+'s targets (PARTNER_TARGETS).
 *
 * A job counts for the technician it is assigned to (requests.technician_id), as in GET /api/partner/stats.
 * Ratings are averaged, never listed one by one. Only the technician's own company office sees this; owners
 * and tenants never see scorecards (S8).
 */
import { z } from 'zod';
import { monthRange, monthSchema } from '../periods.js';
import { PARTNER_TARGETS, wholePercent } from './rules.js';

const DAY = 86_400_000;

/** How far back "recent" looks when no month is asked for. */
export const TECHNICIAN_STATS_DAYS = 30;

/** GET /api/partner/technician-stats?month=YYYY-MM (no month: the last 30 days). */
export const technicianStatsQuery = z.strictObject({ month: monthSchema.optional() });

/** The instants [start, end) the numbers cover: one Dubai month, or the 30 days up to now. */
export function technicianStatsPeriod(
  month: string | null,
  now: number,
): { readonly start: number; readonly end: number } {
  if (month !== null) return monthRange(month);
  return { start: now - TECHNICIAN_STATS_DAYS * DAY, end: now + 1 };
}

/** What was recorded in the period, one row per fact, each with the technician the job was assigned to. */
export interface TechnicianFacts {
  /** Jobs finished (completed, or closed after the resident confirmed or the clock closed it). */
  readonly done: readonly { readonly technicianId: string | null }[];
  /** SLA targets measured (S4); excused ones are not held against anyone (A7). */
  readonly outcomes: readonly {
    readonly technicianId: string | null;
    readonly outcome: 'met' | 'missed' | 'excused';
  }[];
  readonly ratings: readonly { readonly technicianId: string | null; readonly stars: number }[];
  /** Return visits after the resident said the work was not done (A5). */
  readonly repeatVisits: readonly { readonly technicianId: string | null }[];
  /** Jobs open now (not bound to the period). */
  readonly open: readonly { readonly technicianId: string | null }[];
}

export interface TechnicianFigures {
  readonly technicianId: string;
  readonly name: string;
  readonly jobsDone: number;
  readonly onTime: { readonly met: number; readonly total: number };
  readonly onTimePercent: number | null;
  readonly rating: { readonly average: number | null; readonly count: number };
  readonly repeatVisits: number;
  readonly repeatVisitPercent: number | null;
  readonly openJobs: number;
  /** Against PARTNER_TARGETS; null when there is nothing to measure yet (S5: no made-up 100 %). */
  readonly meets: {
    readonly onTime: boolean | null;
    readonly rating: boolean | null;
    readonly repeatVisits: boolean | null;
  };
}

const countFor = (rows: readonly { readonly technicianId: string | null }[], id: string): number =>
  rows.filter((r) => r.technicianId === id).length;

/** One line per technician of the team, in the team's order. Facts of other technicians are left out. */
export function technicianFigures(
  team: readonly { readonly id: string; readonly name: string }[],
  facts: TechnicianFacts,
): TechnicianFigures[] {
  return team.map(({ id, name }) => {
    const jobsDone = countFor(facts.done, id);
    const outcomes = facts.outcomes.filter((o) => o.technicianId === id && o.outcome !== 'excused');
    const met = outcomes.filter((o) => o.outcome === 'met').length;
    const stars = facts.ratings.filter((r) => r.technicianId === id).map((r) => r.stars);
    const average =
      stars.length === 0 ? null : Math.round((stars.reduce((a, b) => a + b, 0) / stars.length) * 10) / 10;
    const repeatVisits = countFor(facts.repeatVisits, id);
    const onTimePercent = wholePercent(met, outcomes.length);
    const repeatVisitPercent = wholePercent(repeatVisits, jobsDone);
    return {
      technicianId: id,
      name,
      jobsDone,
      onTime: { met, total: outcomes.length },
      onTimePercent,
      rating: { average, count: stars.length },
      repeatVisits,
      repeatVisitPercent,
      openJobs: countFor(facts.open, id),
      meets: {
        onTime: onTimePercent === null ? null : onTimePercent >= PARTNER_TARGETS.onTimePercent,
        rating: average === null ? null : average >= PARTNER_TARGETS.averageRating,
        repeatVisits:
          repeatVisitPercent === null ? null : repeatVisitPercent <= PARTNER_TARGETS.repeatVisitPercent,
      },
    };
  });
}

const int = z.number().int();

/** GET /api/partner/technician-stats */
export const technicianStatsResponse = z.object({
  /** The month asked for, or null for the last 30 days. */
  month: z.string().nullable(),
  days: int.nullable(),
  targets: z.object({ onTimePercent: int, averageRating: z.number(), repeatVisitPercent: int }),
  technicians: z.array(
    z.object({
      technicianId: z.string(),
      name: z.string(),
      jobsDone: int,
      onTime: z.object({ met: int, total: int }),
      onTimePercent: int.nullable(),
      rating: z.object({ average: z.number().nullable(), count: int }),
      repeatVisits: int,
      repeatVisitPercent: int.nullable(),
      openJobs: int,
      meets: z.object({
        onTime: z.boolean().nullable(),
        rating: z.boolean().nullable(),
        repeatVisits: z.boolean().nullable(),
      }),
    }),
  ),
});
export type TechnicianStats = z.infer<typeof technicianStatsResponse>;
