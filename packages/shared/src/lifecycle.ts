/**
 * Request lifecycle: statuses, who may move a request, and to where.
 * BUILD_SPEC A1-A8, E1-E19, L4. The API enforces these rules; the apps only show allowed buttons.
 */

export const ROLES = [
  'owner',
  'tenant',
  'partner',
  'partner_admin',
  'jad_admin',
  'jad_viewer',
  'system',
] as const;
export type Role = (typeof ROLES)[number];

export const STATUSES = [
  'awaiting_owner', // tenant's routine request waiting for the owner's approval (A1)
  'submitted', // approved / raised, not yet with a partner
  'assigned', // with a partner, waiting for first response (emergency: acknowledgement, E4)
  'quote_sent', // partner quoted, owner decides (L4, A2)
  'scheduled', // visit booked
  'in_progress',
  'on_hold', // parts / access, clock paused (A6)
  'completed', // partner finished, resident confirms (A4)
  'reopened', // resident says not done (A5)
  'closed',
  'cancelled',
] as const;
export type Status = (typeof STATUSES)[number];

/** Why a request ended. */
export const CLOSE_REASONS = [
  'confirmed', // resident confirmed (E10)
  'auto_closed', // no confirmation after 72 h (A4)
  'owner_arranged', // owner used their own contractor (E19)
  'quote_declined', // owner declined and no revised quote (A3)
  'quote_expired', // no answer by day 14 (A2)
  'owner_declined_request', // owner declined the tenant's request (A1)
  'cancelled_by_requester',
  'cancelled_by_jad',
] as const;
export type CloseReason = (typeof CLOSE_REASONS)[number];

export const OPEN_STATUSES: ReadonlySet<Status> = new Set<Status>([
  'awaiting_owner',
  'submitted',
  'assigned',
  'quote_sent',
  'scheduled',
  'in_progress',
  'on_hold',
  'completed',
  'reopened',
]);

type TransitionTable = Readonly<Partial<Record<Status, readonly Status[]>>>;

/** Allowed moves per role. Anything not listed is refused (deny by default). */
const TRANSITIONS: Readonly<Partial<Record<Role, TransitionTable>>> = {
  owner: {
    awaiting_owner: ['submitted', 'closed'], // approve / decline tenant request (A1)
    quote_sent: ['scheduled', 'assigned', 'closed'], // approve / decline: back to the partner for one revised quote, or close (A3)
    completed: ['closed', 'reopened'], // confirm / not done (U6: owner living in the unit)
    submitted: ['cancelled'],
    assigned: ['cancelled', 'closed'], // cancel / owner arranged (E19)
    scheduled: ['cancelled', 'closed'],
    in_progress: ['reopened'], // asks for the free re-inspection after the snags are fixed (O3, ADR 0032)
  },
  tenant: {
    completed: ['closed', 'reopened'],
    awaiting_owner: ['cancelled'],
    submitted: ['cancelled'],
  },
  partner: {
    // completed from assigned / scheduled: a valuation report delivered without a visit (ADR 0032).
    assigned: ['scheduled', 'quote_sent', 'in_progress', 'on_hold', 'completed'],
    scheduled: ['in_progress', 'on_hold', 'quote_sent', 'completed'],
    in_progress: ['completed', 'on_hold', 'quote_sent'],
    on_hold: ['scheduled', 'in_progress'],
    reopened: ['scheduled', 'in_progress'],
    quote_sent: [], // waits for the owner
  },
  jad_admin: {
    awaiting_owner: ['submitted', 'cancelled'], // after calling the owner (A1, 48 h)
    submitted: ['assigned', 'cancelled', 'completed'], // completed: "handled by JAD+" (ADR 0030)
    assigned: ['assigned', 'scheduled', 'on_hold', 'cancelled', 'closed'],
    quote_sent: ['assigned', 'on_hold', 'cancelled', 'closed'],
    scheduled: ['assigned', 'in_progress', 'on_hold', 'cancelled'],
    in_progress: ['completed', 'on_hold'],
    on_hold: ['assigned', 'scheduled', 'in_progress', 'cancelled'],
    completed: ['closed', 'reopened'],
    reopened: ['assigned', 'scheduled', 'in_progress', 'on_hold'],
  },
  system: {
    awaiting_owner: ['submitted'], // emergencies never wait for the owner (E1)
    submitted: ['assigned'], // auto-assign to the primary partner
    assigned: ['assigned'], // move to backup partner (E6)
    quote_sent: ['closed'], // quote expired day 14 (A2)
    completed: ['closed'], // auto-close at 72 h (A4)
  },
};

export function canTransition(role: Role, from: Status, to: Status): boolean {
  return TRANSITIONS[role]?.[from]?.includes(to) ?? false;
}

export function allowedTransitions(role: Role, from: Status): readonly Status[] {
  return TRANSITIONS[role]?.[from] ?? [];
}

/** Statuses during which the SLA clock is paused. */
export function clockPaused(status: Status): boolean {
  return status === 'on_hold' || status === 'quote_sent' || status === 'awaiting_owner';
}
