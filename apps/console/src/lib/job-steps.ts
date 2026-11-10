/**
 * The partner office's job page (ADR 0025; R3, E4, E8, A2, A3, A7): which steps the office can take now for its
 * technicians, and where the job stands on the progress tracker. The API decides the steps (jobflow.ts gives
 * `actions` in the request detail); acknowledging an emergency (E4) is the one step before any of those.
 */
import type { JobAction, Status } from '@jadplus/shared';

export type OfficeStep =
  'acknowledge' | 'book_visit' | 'send_quote' | 'start_work' | 'work_done' | 'no_access' | 'make_safe';

/** The order the steps are offered in. "On my way" stays with the technician in the field. */
const STEP_ORDER: readonly OfficeStep[] = [
  'book_visit',
  'start_work',
  'work_done',
  'send_quote',
  'no_access',
  'make_safe',
];

export const STEP_LABELS: Readonly<Record<OfficeStep, string>> = {
  acknowledge: 'Acknowledge the emergency',
  book_visit: 'Book the visit',
  send_quote: 'Send a quote',
  start_work: 'Start the work',
  work_done: 'Work finished',
  no_access: 'No access at the door',
  make_safe: 'Record make-safe work',
};

/**
 * E4: an emergency still "assigned" has not been acknowledged (acknowledging moves it to "scheduled"), so the
 * only step is to acknowledge it with a technician and an arrival window.
 */
export function officeSteps(
  r: { readonly emergency: boolean; readonly status: Status },
  actions: readonly JobAction[],
): OfficeStep[] {
  if (r.emergency && r.status === 'assigned') return ['acknowledge'];
  return STEP_ORDER.filter((s) => actions.some((a) => a === s));
}

/** "Send a revised quote" once a first quote was declined (A3). */
export function quoteStepLabel(quoteRevision: number | null): string {
  return quoteRevision === null ? 'Send a quote' : 'Send a revised quote';
}

export const TRACKER_STAGES = ['received', 'booked', 'working', 'done', 'closed'] as const;
export type TrackerStage = (typeof TRACKER_STAGES)[number];

export const TRACKER_LABELS: Readonly<Record<TrackerStage, string>> = {
  received: 'Received',
  booked: 'Acknowledged / visit booked',
  working: 'In progress',
  done: 'Done',
  closed: 'Closed',
};

/** Where a job stands; null when it left the normal path (cancelled). */
export function trackerStage(status: Status): TrackerStage | null {
  switch (status) {
    case 'awaiting_owner':
    case 'submitted':
    case 'assigned':
    case 'quote_sent':
    case 'reopened':
      return 'received';
    case 'scheduled':
    case 'on_hold':
      return 'booked';
    case 'in_progress':
      return 'working';
    case 'completed':
      return 'done';
    case 'closed':
      return 'closed';
    case 'cancelled':
      return null;
  }
}

/** Each stage as done, current or still to come. */
export function trackerSteps(
  status: Status,
): { readonly stage: TrackerStage; readonly state: 'done' | 'current' | 'todo' }[] {
  const current = trackerStage(status);
  const at = current === null ? -1 : TRACKER_STAGES.indexOf(current);
  return TRACKER_STAGES.map((stage, i) => ({
    stage,
    state: i < at ? 'done' : i === at ? (stage === 'closed' ? 'done' : 'current') : 'todo',
  }));
}

/** Visit lengths the office may book (30 minutes to 4 hours, jobflow.ts visitWindowAllowed). */
export const VISIT_LENGTHS: readonly { readonly minutes: number; readonly label: string }[] = [
  { minutes: 30, label: '30 min' },
  { minutes: 60, label: '1 hour' },
  { minutes: 90, label: '1 h 30 min' },
  { minutes: 120, label: '2 hours' },
  { minutes: 180, label: '3 hours' },
  { minutes: 240, label: '4 hours' },
];
