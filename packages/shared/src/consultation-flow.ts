/**
 * Flow C "consultation" rules (ADR 0031; BUILD_SPEC O5, O6, P5, S4): who may do what on a consultation and when,
 * how its deadlines move, and the owner's timeline. Pure functions: the API enforces them and the apps only show
 * the buttons they allow.
 *
 * A consultation uses the request statuses of lifecycle.ts:
 *   assigned (sent to the provider) → in_progress ("Contact made") → completed (Done / Did not proceed)
 *   → closed (the owner closes it, or it closes by itself after 72 hours, A4).
 * One difference from a visit: the owner may say "No longer needed" (cancel) at any time while the provider
 * works on it, also in progress, because nothing is booked in the home and nothing is charged.
 */
import { addWorkingMinutes, type WorkingCalendar } from './calendar.js';
import {
  CONSULTATION_OUTCOMES,
  isConsultationService,
  stagesFor,
  type ConsultationOutcome,
} from './consultation.js';
import type { JobAction, JobState } from './jobflow.js';
import { OPEN_STATUSES, type CloseReason, type Role, type Status } from './lifecycle.js';
import { WORKING_DAY_MINUTES } from './sla.js';

/** The provider office's steps on a consultation (partner_admin, in the console). */
export const CONSULTATION_ACTIONS = ['contact_made', 'move_stage', 'close'] as const;
export type ConsultationAction = (typeof CONSULTATION_ACTIONS)[number];

type TransitionTable = Readonly<Partial<Record<Status, readonly Status[]>>>;

/**
 * Status moves on a consultation, per role. Everything not listed is refused. Apart from the owner's
 * in_progress → cancelled ("No longer needed"), each move is one lifecycle.ts also allows (tested).
 */
const CONSULTATION_TRANSITIONS: Readonly<Partial<Record<Role, TransitionTable>>> = {
  owner: {
    submitted: ['cancelled'],
    assigned: ['cancelled'],
    in_progress: ['cancelled'],
    completed: ['closed'],
  },
  partner_admin: {
    assigned: ['in_progress'], // contact made
    in_progress: ['completed'], // done / did not proceed
  },
};

export function canConsultationTransition(role: Role, from: Status, to: Status): boolean {
  return CONSULTATION_TRANSITIONS[role]?.[from]?.includes(to) ?? false;
}

/** The consultation's history as the rules need it. */
export interface ConsultationState {
  readonly serviceCode: string;
  readonly status: Status;
  /** Step ids recorded so far, oldest first (contact_made, stages, done / did_not_proceed). */
  readonly steps: readonly string[];
}

export function outcomeOf(steps: readonly string[]): ConsultationOutcome | null {
  return CONSULTATION_OUTCOMES.find((o) => steps.includes(o)) ?? null;
}

/** The furthest stage reached (by the service's order), or null before any stage. */
export function currentStage(code: string, steps: readonly string[]): string | null {
  const stages = stagesFor(code);
  let at = -1;
  stages.forEach((s, i) => {
    if (steps.includes(s.id)) at = i;
  });
  return stages[at]?.id ?? null;
}

/** The stages the provider may move to now: any stage after the current one (forward only, skipping allowed). */
export function nextStages(code: string, steps: readonly string[]): readonly string[] {
  const stages = stagesFor(code).map((s) => s.id);
  const current = currentStage(code, steps);
  return stages.slice(current === null ? 0 : stages.indexOf(current) + 1);
}

/** O5/P5: the steps the provider office may take now. Technicians (role partner) take none. */
export function consultationActions(role: Role, s: ConsultationState): ConsultationAction[] {
  if (role !== 'partner_admin' || !isConsultationService(s.serviceCode)) return [];
  if (outcomeOf(s.steps) !== null) return [];
  const contacted = s.steps.includes('contact_made');
  if (!contacted) {
    return canConsultationTransition(role, s.status, 'in_progress') ? ['contact_made'] : [];
  }
  if (s.status !== 'in_progress') return [];
  return nextStages(s.serviceCode, s.steps).length > 0 ? ['move_stage', 'close'] : ['close'];
}

const RATEABLE: ReadonlySet<CloseReason> = new Set<CloseReason>(['confirmed', 'auto_closed']);

/**
 * The request-page actions (jobflow.ts) on a consultation: the owner's "No longer needed" (cancel), closing it
 * once the provider has finished (confirm_done), and the rating after a consultation that was done. Nobody else
 * takes the visit journey's steps on a consultation (no visit, no quote, no "not done").
 */
export function consultationJobActions(role: Role, s: JobState): JobAction[] {
  if (role !== 'owner') return [];
  const actions: JobAction[] = [];
  if (canConsultationTransition(role, s.status, 'cancelled')) actions.push('cancel');
  if (s.status === 'completed') actions.push('confirm_done');
  if (
    s.status === 'closed' &&
    s.hasPartner &&
    !s.rated &&
    s.consultationOutcome === 'done' &&
    s.closeReason !== null &&
    RATEABLE.has(s.closeReason)
  ) {
    actions.push('rate');
  }
  return actions;
}

/**
 * S4: the later deliverable of some consultations, which becomes the deadline once contact is made.
 * minutes null: the first deadline already is this deliverable and keeps running (Golden Visa: the eligibility
 * answer within 2 working days of the request; first contact alone does not answer it).
 */
interface Milestone {
  readonly kind: string;
  /** Reaching this stage (or a later one) delivers it. */
  readonly stage: string;
  readonly minutes: number | null;
}

export const CONSULTATION_MILESTONES: Readonly<Record<string, Milestone>> = {
  leasing: { kind: 'listing', stage: 'listed', minutes: 3 * WORKING_DAY_MINUTES },
  resale: { kind: 'valuation_plan', stage: 'valuation_plan', minutes: 3 * WORKING_DAY_MINUTES },
  'golden-visa': { kind: 'eligibility_answer', stage: 'eligibility', minutes: null },
};

export interface ConsultationDue {
  readonly at: number;
  readonly kind: string;
}

/** S4: whether "Contact made" meets the request's current deadline (first contact, or first call for a mortgage). */
export function contactMeetsDeadline(due: ConsultationDue | null): boolean {
  return due?.kind === 'first_contact';
}

/** S4: the deadline after "Contact made": the service's next deliverable, if it has one. */
export function dueAfterContact(
  code: string,
  contactAt: number,
  current: ConsultationDue | null,
  cal: WorkingCalendar,
): ConsultationDue | null {
  const m = CONSULTATION_MILESTONES[code];
  if (m === undefined) return null;
  if (m.minutes === null) return current?.kind === m.kind ? current : null;
  return { at: addWorkingMinutes(contactAt, m.minutes, cal), kind: m.kind };
}

/** S4: whether reaching `stage` delivers the deliverable the current deadline is for. */
export function stageMeetsDeadline(code: string, stage: string, current: ConsultationDue | null): boolean {
  const m = CONSULTATION_MILESTONES[code];
  if (m === undefined || current?.kind !== m.kind) return false;
  const ids = stagesFor(code).map((s) => s.id);
  return ids.indexOf(stage) >= ids.indexOf(m.stage);
}

export type TimelineState = 'done' | 'current' | 'next' | 'not_reached';

export interface TimelineItem {
  /** contact_made, a stage id, done or did_not_proceed. */
  readonly id: string;
  readonly state: TimelineState;
  readonly note: string | null;
  readonly at: number | null;
}

export interface RecordedStep {
  readonly step: string;
  readonly note: string | null;
  readonly at: number;
}

/**
 * The owner's simple timeline (ADR 0031): contact made, the service's stages, then the end. A stage the provider
 * skipped counts as done; after the end (or a cancel) the stages never reached show as not reached.
 */
export function consultationTimeline(
  code: string,
  status: Status,
  recorded: readonly RecordedStep[],
): TimelineItem[] {
  const steps = recorded.map((r) => r.step);
  const outcome = outcomeOf(steps);
  const ended = outcome !== null || status === 'cancelled' || status === 'closed';
  const ids = ['contact_made', ...stagesFor(code).map((s) => s.id), outcome ?? 'done'];
  // The furthest of contact and stages reached (the end itself does not mark the stages before it as done).
  const furthest = ids.slice(0, -1).reduce((best, id, i) => (steps.includes(id) ? i : best), -1);
  let currentGiven = false;
  return ids.map((id, i) => {
    const hit = recorded.find((r) => r.step === id);
    let state: TimelineState;
    if (hit !== undefined || i < furthest) state = 'done';
    else if (ended) state = 'not_reached';
    else if (!currentGiven) {
      state = 'current';
      currentGiven = true;
    } else state = 'next';
    return { id, state, note: hit?.note ?? null, at: hit?.at ?? null };
  });
}

/** What decides whether a provider office may see the owner's contact details on a consultation. */
export interface ContactFacts {
  /** The provider the owner agreed to share with (named on the screen when they sent it). */
  readonly consentPartnerId: string;
  /** The provider the request is with now. */
  readonly assignedPartnerId: string | null;
  readonly status: Status;
}

/**
 * ADR 0031: the owner's name and contact details go only to the provider office they agreed to, while the request
 * is with that provider and still open. Technicians never see them; a provider the request is moved to later does
 * not see them either (the owner did not agree to that one) and works through JAD+ messages.
 */
export function contactSharedWith(
  viewer: { readonly role: Role; readonly partnerId: string | null },
  f: ContactFacts,
): boolean {
  return (
    viewer.role === 'partner_admin' &&
    viewer.partnerId !== null &&
    viewer.partnerId === f.consentPartnerId &&
    viewer.partnerId === f.assignedPartnerId &&
    OPEN_STATUSES.has(f.status)
  );
}
