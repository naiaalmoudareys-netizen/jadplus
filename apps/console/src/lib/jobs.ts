/**
 * The partner office's jobs board (ADR 0023; R3, E4, S4): open jobs split into "Needs you now", "Upcoming" and
 * "Waiting on the owner", each with the reason it is there.
 */
import { EMERGENCY_TYPE_LABELS, type PartnerJob } from '@jadplus/shared';
import { duration } from './format';

const HOUR = 3_600_000;
/** A deadline this close counts as "now". */
export const DUE_SOON_MS = 2 * HOUR;

export type BoardColumn = 'now' | 'upcoming' | 'waiting';

export const BOARD_TITLES: Readonly<Record<BoardColumn, string>> = {
  now: 'Needs you now',
  upcoming: 'Upcoming',
  waiting: 'Waiting on the owner',
};

const BOARD_ORDER: readonly BoardColumn[] = ['now', 'upcoming', 'waiting'];

export interface Placement {
  readonly column: BoardColumn;
  /** Why it is in "Needs you now" or "Waiting on the owner"; null for plain upcoming work. */
  readonly reason: string | null;
}

/** Where one job goes on the board, and why. */
export function placeJob(
  job: Pick<PartnerJob, 'status' | 'emergency' | 'nextDueAt' | 'technicianId'>,
  now: number,
): Placement {
  if (job.status === 'quote_sent') return { column: 'waiting', reason: 'Quote with the owner' };
  if (job.status === 'awaiting_owner') return { column: 'waiting', reason: 'Owner to approve' };
  if (job.status === 'completed') return { column: 'waiting', reason: 'Resident to confirm the work' };
  if (job.emergency && job.status === 'assigned') return { column: 'now', reason: 'Emergency: acknowledge' };
  if (job.nextDueAt !== null && job.nextDueAt < now) return { column: 'now', reason: 'Overdue' };
  if (job.status === 'reopened') return { column: 'now', reason: 'Reopened: not done' };
  if (job.technicianId === null && job.status !== 'on_hold') {
    return { column: 'now', reason: 'No technician yet' };
  }
  if (job.nextDueAt !== null && job.nextDueAt - now <= DUE_SOON_MS)
    return { column: 'now', reason: 'Due soon' };
  return { column: 'upcoming', reason: null };
}

export interface BoardGroup<J> {
  readonly column: BoardColumn;
  readonly title: string;
  readonly jobs: readonly { readonly job: J; readonly reason: string | null }[];
}

/** Every column, in order, keeping the API's order inside each (emergencies first, then by deadline). */
export function groupJobs<J extends Pick<PartnerJob, 'status' | 'emergency' | 'nextDueAt' | 'technicianId'>>(
  jobs: readonly J[],
  now: number,
): BoardGroup<J>[] {
  const placed = jobs.map((job) => ({ job, ...placeJob(job, now) }));
  return BOARD_ORDER.map((column) => ({
    column,
    title: BOARD_TITLES[column],
    jobs: placed.filter((p) => p.column === column).map(({ job, reason }) => ({ job, reason })),
  }));
}

/** "Acknowledge in 12 min" (E4), "Due in 3 h", "Overdue by 5 min", or null when nothing is due. */
export function jobClock(job: Pick<PartnerJob, 'nextDueAt' | 'nextDueKind'>, now: number): string | null {
  if (job.nextDueAt === null) return null;
  if (job.nextDueAt < now) return `Overdue by ${duration(now - job.nextDueAt)}`;
  const left = duration(job.nextDueAt - now);
  return job.nextDueKind === 'emergency_ack' ? `Acknowledge in ${left}` : `Due in ${left}`;
}

/** "Water leak (emergency)" or the service name. */
export function jobWhat(job: Pick<PartnerJob, 'emergency' | 'emergencyType' | 'serviceName'>): string {
  if (job.emergency) {
    return job.emergencyType === null
      ? 'Emergency'
      : `${EMERGENCY_TYPE_LABELS[job.emergencyType]} (emergency)`;
  }
  return job.serviceName ?? 'Service request';
}

/** "JAD288-1102 · Building B · JAD 288". */
export function placeText(location: PartnerJob['location']): string {
  if (location === null) return 'Unit details with JAD+';
  return [location.unitName, location.building, location.project].filter((x) => x !== null).join(' · ');
}
