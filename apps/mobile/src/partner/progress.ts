/**
 * The technician's job page in plain rules (R3; Naya, 10-Nov-2026 "make the job page simpler"), tested without
 * a phone: where the job stands on the tracker (New → Booked → On the way → Working → Done → Confirmed) and
 * which steps the "More" list offers next to the one big button.
 */
import type { JobAction, PartnerJob, RequestDetail } from '@jadplus/shared';
import { needsAcknowledgement } from '../jobs/format.js';
import type { NextStep } from './logic.js';

/** One stop on the tracker. Emergencies show "Acknowledged" (E4) where routine jobs show "Booked". */
export type TrackStep = 'new' | 'booked' | 'acknowledged' | 'on_the_way' | 'working' | 'done' | 'confirmed';

/**
 * How the job is moving: on its way, paused for the owner (a quote waiting, L4; or a tenant's request
 * waiting for approval, A1), on hold (A6), finished and confirmed, or cancelled.
 */
export type TrackState = 'moving' | 'owner' | 'hold' | 'complete' | 'cancelled';

export interface JobProgress {
  readonly steps: readonly TrackStep[];
  /** The index in `steps` of the last step reached (0 = New). */
  readonly reached: number;
  readonly state: TrackState;
}

type Visit = RequestDetail['visit'];
type Quote = RequestDetail['quote'];

const NEW = 0;
const BOOKED = 1;
const ON_THE_WAY = 2;
const WORKING = 3;
const DONE = 4;
const CONFIRMED = 5;

/** The step the live visit shows (A8): "arrived" is set when the work starts. A finished visit counts as none. */
function visitStep(visit: Visit): number {
  if (visit === null) return NEW;
  if (visit.status === 'arrived') return WORKING;
  if (visit.status === 'on_the_way') return ON_THE_WAY;
  return visit.status === 'booked' ? BOOKED : NEW;
}

function reachedStep(job: Pick<PartnerJob, 'status' | 'emergency'>, visit: Visit): number {
  switch (job.status) {
    case 'closed':
      return CONFIRMED;
    case 'completed':
      return DONE;
    case 'in_progress':
      return WORKING;
    default: {
      // An acknowledged emergency has its arrival window before any visit is booked (E4).
      const acknowledged = job.emergency && job.status !== 'submitted' && !needsAcknowledgement(job);
      const booked = job.status === 'scheduled' || acknowledged ? BOOKED : NEW;
      return Math.max(booked, visitStep(visit));
    }
  }
}

function stateOf(status: PartnerJob['status'], quote: Quote): TrackState {
  if (status === 'closed') return 'complete';
  if (status === 'cancelled') return 'cancelled';
  if (status === 'on_hold') return 'hold';
  if (status === 'quote_sent' || status === 'awaiting_owner' || quote?.status === 'pending') return 'owner';
  return 'moving';
}

/** R3: the tracker for a job, from its status, whether it was acknowledged, the visit and the latest quote. */
export function jobProgress(
  job: Pick<PartnerJob, 'status' | 'emergency'>,
  detail: Pick<RequestDetail, 'visit' | 'quote'> | null,
): JobProgress {
  const visit = detail?.visit ?? null;
  const steps: TrackStep[] = [
    'new',
    job.emergency ? 'acknowledged' : 'booked',
    'on_the_way',
    'working',
    'done',
  ];
  if (job.status === 'closed') steps.push('confirmed');
  return { steps, reached: reachedStep(job, visit), state: stateOf(job.status, detail?.quote ?? null) };
}

/** The partner's steps in the order the "More" list shows them. */
const MORE_ORDER = [
  'on_my_way',
  'start_work',
  'book_visit',
  'send_quote',
  'make_safe',
  'no_access',
  'work_done',
] as const satisfies readonly JobAction[];

export type MoreAction = (typeof MORE_ORDER)[number];

/** The steps the API allows now (`actions`) other than the one on the big button. */
export function moreActions(actions: readonly JobAction[], primary: NextStep | null): MoreAction[] {
  return MORE_ORDER.filter((a) => actions.includes(a) && a !== primary);
}

/** "I'm on my way" (A8) and "Start work" happen with one tap; every other step opens its form. */
export type OneTap = Extract<MoreAction, 'on_my_way' | 'start_work'>;
export type JobForm = Exclude<MoreAction, OneTap> | 'acknowledge';
export type JobStep = JobForm | OneTap;

export function isOneTap(step: JobStep): step is OneTap {
  return step === 'on_my_way' || step === 'start_work';
}
