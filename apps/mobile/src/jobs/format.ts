/** How jobs are described on the partner screens (R3: "clock and next action due"). */
import {
  EMERGENCY_TYPE_LABELS,
  VISIT_SLOTS,
  dubaiClock,
  type PartnerJob,
  type RequestSummary,
  type UnitLocation,
} from '@jadplus/shared';

const MIN = 60_000;

const STATUS_LABELS: Readonly<Record<PartnerJob['status'], string>> = {
  awaiting_owner: 'Waiting for owner',
  submitted: 'Submitted',
  assigned: 'New: acknowledge',
  quote_sent: 'Quote sent',
  scheduled: 'Scheduled',
  in_progress: 'In progress',
  on_hold: 'On hold',
  completed: 'Completed',
  reopened: 'Reopened',
  closed: 'Closed',
  cancelled: 'Cancelled',
};

export function statusLabel(status: PartnerJob['status']): string {
  return STATUS_LABELS[status];
}

const RESIDENT_STATUS_LABELS: Readonly<Record<RequestSummary['status'], string>> = {
  awaiting_owner: 'Waiting for the owner',
  submitted: 'Received by JAD+',
  assigned: 'Sent to the service partner',
  quote_sent: 'Quote waiting for the owner',
  scheduled: 'Technician on the way',
  in_progress: 'Work in progress',
  on_hold: 'On hold',
  completed: 'Work completed',
  reopened: 'Reopened',
  closed: 'Closed',
  cancelled: 'Cancelled',
};

/** What a resident sees as the status of their request. */
export function residentStatusLabel(status: RequestSummary['status']): string {
  return RESIDENT_STATUS_LABELS[status];
}

/** "JAD288-1102 · Building B · JAD 288" */
export function placeLabel(location: UnitLocation | null): string {
  if (location === null) return 'Unit details with JAD+';
  return [location.unitName, location.building, location.project].filter((x) => x !== null).join(' · ');
}

/** An emergency by its kind ("Water leak"); a routine request by its service ("Furnishing"). */
export function jobTitle(job: Pick<PartnerJob, 'emergency' | 'emergencyType' | 'serviceName'>): string {
  if (!job.emergency) return job.serviceName ?? 'Service request';
  return job.emergencyType === null ? 'Emergency' : EMERGENCY_TYPE_LABELS[job.emergencyType];
}

/** "Acknowledge in 12 min", "Overdue by 3 min", or null when nothing is due. */
export function dueLabel(job: PartnerJob, now: number): string | null {
  if (job.nextDueAt === null) return null;
  const minutes = Math.ceil((job.nextDueAt - now) / MIN);
  const action = job.nextDueKind === 'emergency_ack' ? 'Acknowledge' : 'Due';
  if (minutes > 0) return `${action} in ${formatMinutes(minutes)}`;
  return `Overdue by ${formatMinutes(Math.max(1, -minutes))}`;
}

function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/** Overdue jobs are shown in red. */
export function isOverdue(job: PartnerJob, now: number): boolean {
  return job.nextDueAt !== null && job.nextDueAt <= now;
}

/** E4: whether this job is an emergency still waiting for this partner's acknowledgement. */
export function needsAcknowledgement(job: PartnerJob): boolean {
  return job.emergency && job.status === 'assigned';
}

/** "Arriving 14:30-16:00" in Dubai time, once acknowledged. */
export function arrivalLabel(job: Pick<PartnerJob, 'arrivalWindow'>): string | null {
  if (job.arrivalWindow === null) return null;
  return `Arriving ${dubaiClock(job.arrivalWindow.start)}-${dubaiClock(job.arrivalWindow.end)}`;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Tue 10 Nov" from a Dubai date (YYYY-MM-DD). */
export function dayLabel(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  return `${WEEKDAYS[d.getUTCDay()] ?? ''} ${String(d.getUTCDate())} ${MONTHS[d.getUTCMonth()] ?? ''}`;
}

/** "Preferred: Tue 10 Nov · Morning (9:00 - 12:00)", or null when none was given (ADR 0013). */
export function preferredVisitLabel(job: Pick<PartnerJob, 'preferredVisit'>): string | null {
  const v = job.preferredVisit;
  if (v === null) return null;
  const slot = VISIT_SLOTS.find((s) => s.key === v.slot);
  return `Preferred: ${dayLabel(v.date)} · ${slot === undefined ? v.slot : `${slot.label} (${slot.hours})`}`;
}
