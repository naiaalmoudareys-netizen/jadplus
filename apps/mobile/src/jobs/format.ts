/** How jobs are described on the partner screens (R3: "clock and next action due"). */
import { EMERGENCY_TYPE_LABELS, dubaiClock, type PartnerJob } from '@jadplus/shared';

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

export function jobTitle(job: PartnerJob): string {
  if (!job.emergency) return 'Maintenance request';
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
export function arrivalLabel(job: PartnerJob): string | null {
  if (job.arrivalWindow === null) return null;
  return `Arriving ${dubaiClock(job.arrivalWindow.start)}-${dubaiClock(job.arrivalWindow.end)}`;
}
