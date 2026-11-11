/**
 * The partner office's jobs board (ADR 0023; R3, E4, S4): open jobs split into "Needs you now", "Upcoming" and
 * "Waiting on the owner", each with the reason it is there.
 */
import { EMERGENCY_TYPE_LABELS, type PartnerJob, type RequestClock } from '@jadplus/shared';
import { dateTime, deadlineText, duration, humanize, type Tone } from './format';

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

/** What the next deadline on a request is for (requests.next_due_kind). */
const DUE_KIND_LABELS: Readonly<Record<string, string>> = {
  emergency_ack: 'Acknowledge the emergency',
  emergency_on_site: 'Technician on site',
  routine_response: 'Answer the request',
  routine_visit: 'Visit the unit',
  quote_after_visit: 'Send the quote',
  rebook_after_no_access: 'Book a new visit after no access',
  // S4: each service's first deadline (ADR 0030, packages/shared service-targets.ts).
  snagging_booking: 'Book the inspection',
  first_contact: 'Contact the owner',
  valuation_report: 'Send the valuation report',
  eligibility_answer: 'Answer on eligibility',
  service_quote: 'Send the quote',
  design_proposal: 'Send the design proposal',
  // S4: the report flow's later deadlines (ADR 0032, packages/shared reports.ts).
  snagging_report: 'Send the snagging report',
  reinspection_booking: 'Book the re-inspection',
  reinspection_report: 'Send the re-inspection report',
  // S4: the consultation flow's later deliverables (ADR 0031, packages/shared consultation-flow.ts).
  listing: 'List the unit',
  valuation_plan: 'Send the valuation and sales plan',
};

export function dueKindText(kind: string): string {
  return DUE_KIND_LABELS[kind] ?? humanize(kind);
}

type Clock = Pick<RequestClock, 'acknowledgedAt' | 'nextDueAt' | 'nextDueKind' | 'paused'>;

/**
 * The request page's "Next deadline" (S4, R3, R4): what is due and the time left, e.g. "Visit the unit: due in
 * 3 h (12 Nov 2026, 14:00)". The clock stops while waiting on the owner or on hold (A6).
 */
export function deadlineFact(clock: Clock, now: number): { text: string; tone: Tone } {
  if (clock.paused) return { text: 'Clock paused: waiting on the owner or on hold', tone: 'calm' };
  if (clock.nextDueAt === null || clock.nextDueKind === null) return { text: 'Nothing due', tone: 'calm' };
  const left = deadlineText(clock.nextDueAt, now) ?? '';
  const late = clock.nextDueAt < now;
  return {
    text: `${dueKindText(clock.nextDueKind)}: ${left.charAt(0).toLowerCase()}${left.slice(1)} (${dateTime(clock.nextDueAt)})`,
    tone: late ? 'bad' : clock.nextDueAt - now <= DUE_SOON_MS ? 'warn' : 'good',
  };
}

/** "Acknowledged" (E4) for an emergency; for a routine request the first answer is booking the visit (S4). */
export function acknowledgedFact(clock: Clock, emergency: boolean): { text: string; tone: Tone } {
  if (clock.acknowledgedAt === null) {
    return { text: emergency ? 'Not acknowledged yet' : 'No visit booked yet', tone: 'warn' };
  }
  return {
    text: `${emergency ? 'Acknowledged' : 'Visit first booked'} ${dateTime(clock.acknowledgedAt)}`,
    tone: 'good',
  };
}
