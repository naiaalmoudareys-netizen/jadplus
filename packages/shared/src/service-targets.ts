/**
 * The first deadline of each service (BUILD_SPEC S4; ADR 0030): when a new routine request is raised, its clock
 * (requests.next_due_at / next_due_kind) is set from the service's first-response target here, on the working
 * calendar JAD+ Admin keeps (E20). Before this, every service used the maintenance 4-working-hour clock.
 *
 * Decision (ADR 0030): where the plan's target is a later deliverable that needs the report or consultation
 * flows (leasing listing 3 working days, resale valuation and sales plan 3 working days), the first deadline is
 * "first contact within 1 working day"; the later milestone follows with those flows. Investor education gives
 * the next course date on request, so it has no clock.
 */
import { addWorkingMinutes, type WorkingCalendar } from './calendar.js';
import { MAINTENANCE_SLA, WORKING_DAY_MINUTES, type ClockKind, type SlaMetric } from './sla.js';

const MIN = 60_000;

/**
 * What the first deadline is for (requests.next_due_kind). routine_response is the maintenance one (unchanged).
 * The column is free text (migration 0005, at most 40 characters), so no CHECK list needs to change.
 */
export const FIRST_DUE_KINDS = [
  'routine_response',
  'snagging_booking',
  'first_contact',
  'valuation_report',
  'eligibility_answer',
  'service_quote',
  'design_proposal',
] as const;
export type FirstDueKind = (typeof FIRST_DUE_KINDS)[number];

export interface FirstResponseTarget {
  readonly kind: FirstDueKind;
  readonly minutes: number;
  readonly clock: ClockKind;
  /** The plan's promise in plain words, for JAD+ Admin. */
  readonly text: string;
}

const workingDays = (days: number): number => days * WORKING_DAY_MINUTES;

const firstContact = (text: string): FirstResponseTarget => ({
  kind: 'first_contact',
  minutes: workingDays(1),
  clock: 'working',
  text,
});

/** S4, per service code (every code in SERVICES has an entry; null = no clock). */
export const FIRST_RESPONSE: Readonly<Record<string, FirstResponseTarget | null>> = {
  maintenance: {
    kind: 'routine_response',
    minutes: MAINTENANCE_SLA.routineResponse.minutes,
    clock: 'working',
    text: 'Answer within 4 working hours.',
  },
  // "Booking 48 h": the plan says hours, not working hours, so the clock runs round the clock (as in ADR 0004).
  snagging: {
    kind: 'snagging_booking',
    minutes: 48 * 60,
    clock: '24x7',
    text: 'Inspection booked within 48 hours.',
  },
  handover: firstContact('First contact within 1 working day.'),
  'property-management': firstContact('First contact within 1 working day.'),
  leasing: firstContact('First contact within 1 working day (listing within 3 working days).'),
  resale: firstContact(
    'First contact within 1 working day (valuation and sales plan within 3 working days).',
  ),
  valuation: {
    kind: 'valuation_report',
    minutes: workingDays(3),
    clock: 'working',
    text: 'Valuation report within 3 working days.',
  },
  mortgage: firstContact('First call within 1 working day.'),
  'golden-visa': {
    kind: 'eligibility_answer',
    minutes: workingDays(2),
    clock: 'working',
    text: 'Eligibility answer within 2 working days.',
  },
  furnishing: {
    kind: 'service_quote',
    minutes: workingDays(2),
    clock: 'working',
    text: 'Quote within 2 working days.',
  },
  'interior-design': {
    kind: 'design_proposal',
    minutes: workingDays(5),
    clock: 'working',
    text: 'Proposal within 5 working days.',
  },
  education: null,
};

/**
 * S4: the first-response target of a service, or null when it has no clock (education). An unknown code gets the
 * maintenance target, so a request is never left without a deadline by mistake.
 */
export function firstResponseTarget(code: string): FirstResponseTarget | null {
  if (!Object.hasOwn(FIRST_RESPONSE, code)) return FIRST_RESPONSE.maintenance ?? null;
  return FIRST_RESPONSE[code] ?? null;
}

export interface FirstDue {
  readonly at: number;
  readonly kind: FirstDueKind;
}

/** S4: when the first deadline of a request for this service, raised at `raisedAt`, falls due; null = no clock. */
export function firstResponseDue(code: string, raisedAt: number, cal: WorkingCalendar): FirstDue | null {
  const target = firstResponseTarget(code);
  if (target === null) return null;
  const at =
    target.clock === 'working'
      ? addWorkingMinutes(raisedAt, target.minutes, cal)
      : raisedAt + target.minutes * MIN;
  return { at, kind: target.kind };
}

/** The provider's first answer in today's visit journey: booking a visit, or sending a quote. */
export type FirstAnswer = 'visit' | 'quote';

/**
 * S4/S5: which scorecard metric the provider's first answer settles, or null when that answer does not meet the
 * deadline. Maintenance keeps its own metric (routine_response); the other services count as service_milestone.
 * A booking needs a booked visit; a quote or proposal needs the quote; a report or eligibility answer is met
 * by the report and consultation flows (later waves), not by a visit or a quote.
 */
export function firstResponseMetric(kind: string | null, answer: FirstAnswer): SlaMetric | null {
  switch (kind) {
    case 'routine_response':
      return 'routine_response';
    case 'first_contact':
      return 'service_milestone';
    case 'snagging_booking':
      return answer === 'visit' ? 'service_milestone' : null;
    case 'service_quote':
    case 'design_proposal':
      return answer === 'quote' ? 'service_milestone' : null;
    default:
      return null;
  }
}
