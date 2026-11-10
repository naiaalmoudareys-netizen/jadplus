/**
 * Plain rules behind the technician's tabs and job page (R3, S5, S8), tested without a phone: today's visits,
 * how the queue is grouped, the one "Next step" on a job, the maps link for a unit, and the on-time share.
 */
import {
  dubaiDate,
  type JobAction,
  type PartnerJob,
  type PartnerStats,
  type UnitLocation,
} from '@jadplus/shared';
import { isOverdue, needsAcknowledgement } from '../jobs/format.js';

/** The periods the "My numbers" switch offers (GET /api/partner/stats?days=). */
export const STATS_PERIODS = [7, 30, 90] as const;
export type StatsPeriod = (typeof STATS_PERIODS)[number];

export interface TodayJobs {
  /** New emergencies still waiting to be acknowledged (E4), shown first in red. */
  readonly urgent: readonly PartnerJob[];
  /** Jobs whose arrival window starts today (Dubai date), earliest first. */
  readonly visits: readonly PartnerJob[];
}

/** Today: unacknowledged emergencies, then the visits whose window starts on today's Dubai date. */
export function todayJobs(jobs: readonly PartnerJob[], now: number): TodayJobs {
  const today = dubaiDate(now);
  const urgent = jobs.filter(needsAcknowledgement);
  const visits = jobs
    .filter((j) => !needsAcknowledgement(j))
    .flatMap((j) => (j.arrivalWindow !== null && dubaiDate(j.arrivalWindow.start) === today ? [j] : []))
    .sort((a, b) => (a.arrivalWindow?.start ?? 0) - (b.arrivalWindow?.start ?? 0));
  return { urgent, visits };
}

export type JobGroup = 'now' | 'upcoming' | 'owner';

/**
 * The queue in three groups, each keeping the API's order (emergencies first, then by deadline): "Needs you
 * now" (new emergencies and anything overdue), "Waiting on the owner" (a quote sent, L4) and "Upcoming"
 * (everything else). Empty groups are left out.
 */
export function groupJobs(
  jobs: readonly PartnerJob[],
  now: number,
): { readonly group: JobGroup; readonly jobs: readonly PartnerJob[] }[] {
  const groupOf = (j: PartnerJob): JobGroup => {
    if (needsAcknowledgement(j) || isOverdue(j, now)) return 'now';
    return j.status === 'quote_sent' ? 'owner' : 'upcoming';
  };
  const order: readonly JobGroup[] = ['now', 'upcoming', 'owner'];
  return order
    .map((group) => ({ group, jobs: jobs.filter((j) => groupOf(j) === group) }))
    .filter((g) => g.jobs.length > 0);
}

export type NextStep = 'acknowledge' | 'work_done' | 'book_visit' | 'on_my_way' | 'start_work';

/**
 * The one step shown at the top of a job: acknowledge a new emergency (E4); finish work in progress; book the
 * first visit; "I'm on my way" on a booked visit (A8); then start the work. Null when nothing is the partner's
 * to do now (e.g. a quote waiting for the owner). `actions` are what the API allows now.
 */
export function nextStep(
  job: Pick<PartnerJob, 'status' | 'emergency'>,
  actions: readonly JobAction[],
  hasVisit: boolean,
): NextStep | null {
  if (needsAcknowledgement(job)) return 'acknowledge';
  if (actions.includes('work_done')) return 'work_done';
  if (actions.includes('book_visit') && !hasVisit) return 'book_visit';
  if (actions.includes('on_my_way')) return 'on_my_way';
  if (actions.includes('start_work')) return 'start_work';
  return null;
}

/**
 * "I'm on my way" and "Start work" are done with one tap on the "Next step" button itself, so the page does
 * not show them a second time below. The other steps need a form further down; null for those.
 */
export function oneTapAction(step: NextStep | null): Extract<JobAction, 'on_my_way' | 'start_work'> | null {
  return step === 'on_my_way' || step === 'start_work' ? step : null;
}

/**
 * A maps search for the unit's building (no coordinates exist): Apple Maps on iPhone, Google Maps elsewhere.
 * Only the building, project and address are sent, never the unit number. Null when nothing is known.
 */
export function mapsLink(location: UnitLocation | null, platform: 'ios' | 'android'): string | null {
  if (location === null) return null;
  const query = [location.building, location.project, location.address]
    .filter((x): x is string => x !== null && x.trim() !== '')
    .map((x) => x.trim())
    .join(', ');
  if (query === '') return null;
  const q = encodeURIComponent(query);
  return platform === 'ios'
    ? `https://maps.apple.com/?q=${q}`
    : `https://www.google.com/maps/search/?api=1&query=${q}`;
}

/** On time as a whole percent (S4, S5), or null when nothing was measured in the period. */
export function onTimePercent(onTime: PartnerStats['onTime']): number | null {
  if (onTime.total <= 0) return null;
  return Math.round((Math.min(onTime.met, onTime.total) / onTime.total) * 100);
}

/** The average rating with one decimal ("4.6"), or null when no one has rated yet. */
export function ratingText(rating: PartnerStats['rating']): string | null {
  return rating.average === null || rating.count === 0 ? null : rating.average.toFixed(1);
}
