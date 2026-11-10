/**
 * The request journey after it reaches a partner (ADR 0018): the partner books the visit, quotes if the work is
 * chargeable, does the work and marks it done; the owner approves or declines the quote (L4: JAD+ never
 * approves chargeable work), the resident confirms the work or says it is not done, and rates the job.
 *
 * - A2: a quote is valid 14 days, then it expires and the request closes.
 * - A3: after a decline the partner may send ONE revised quote; declining that closes the request.
 * - A4: work marked done and not confirmed closes by itself after 72 hours.
 * - A5: "not done" reopens the request with the same partner.
 * - A7: the technician could not get in: recorded with a photo, rebooked within 24 hours, not held against them.
 * - A8: the technician says they are on the way.
 * - E8: on an emergency, urgent make-safe work up to the owner's pre-agreed limit needs no quote.
 * - E19: the owner may close a request because they used their own contractor.
 * These are pure rules: the API enforces them, the apps only show the buttons they allow.
 */
import { z } from 'zod';
import { canTransition, type CloseReason, type Role, type Status } from './lifecycle.js';
import { idSchema } from './schemas.js';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export const QUOTE_VALID_DAYS = 14;
export const AUTO_CLOSE_HOURS = 72;
/** A partner may send the first quote and one revised quote (A3). */
export const MAX_QUOTE_REVISIONS = 2;

export const JOB_ACTIONS = [
  'book_visit',
  'send_quote',
  'start_work',
  'work_done',
  'approve_quote',
  'decline_quote',
  'confirm_done',
  'not_done',
  'rate',
  'on_my_way',
  'no_access',
  'make_safe',
  'cancel',
  'arranged_myself',
] as const;
export type JobAction = (typeof JOB_ACTIONS)[number];

/** What the rules need to know about a request. */
export interface JobState {
  readonly status: Status;
  readonly isEmergency: boolean;
  /** Emergencies are acknowledged first (E4); before that only "acknowledge" is possible. */
  readonly acknowledged: boolean;
  /** A quote is waiting for the owner. */
  readonly pendingQuote: boolean;
  /** Quotes the current partner has sent on this request. */
  readonly quotesSent: number;
  readonly hasPartner: boolean;
  readonly rated: boolean;
  readonly closeReason: CloseReason | null;
  /** Where the booked visit stands (A7, A8). */
  readonly visit: 'none' | 'booked' | 'on_the_way' | 'arrived';
  /** Make-safe work within the owner's limit has been recorded on this emergency (E8). */
  readonly makeSafeRecorded: boolean;
  /** The signed-in person raised this request (a tenant may cancel only their own). */
  readonly raisedByMe: boolean;
}

const RATEABLE: ReadonlySet<CloseReason> = new Set<CloseReason>(['confirmed', 'auto_closed']);

/** The actions a role may take now (the API checks who the person is and that the request is theirs). */
export function jobActions(role: Role, s: JobState): JobAction[] {
  const actions: JobAction[] = [];
  const ready = !s.isEmergency || s.acknowledged;
  if (role === 'partner' || role === 'partner_admin') {
    if (!ready) return actions;
    if (['assigned', 'reopened', 'scheduled'].includes(s.status)) actions.push('book_visit');
    if (
      ['assigned', 'scheduled', 'in_progress'].includes(s.status) &&
      !s.pendingQuote &&
      s.quotesSent < MAX_QUOTE_REVISIONS
    ) {
      actions.push('send_quote');
    }
    if (s.status === 'scheduled' || s.status === 'reopened') actions.push('start_work');
    if (s.status === 'in_progress') actions.push('work_done');
    if (s.status === 'scheduled' && s.visit === 'booked') actions.push('on_my_way');
    if (s.status === 'scheduled' && (s.visit === 'booked' || s.visit === 'on_the_way'))
      actions.push('no_access');
    if (s.isEmergency && ['scheduled', 'in_progress'].includes(s.status) && !s.makeSafeRecorded) {
      actions.push('make_safe');
    }
  }
  if (role === 'owner' && s.status === 'quote_sent' && s.pendingQuote) {
    actions.push('approve_quote', 'decline_quote');
  }
  if (role === 'owner' || role === 'tenant') {
    if (s.status === 'completed') actions.push('confirm_done', 'not_done');
    if (
      s.status === 'closed' &&
      s.hasPartner &&
      !s.rated &&
      s.closeReason !== null &&
      RATEABLE.has(s.closeReason)
    ) {
      actions.push('rate');
    }
    // Before the work starts the requester may cancel (a tenant only their own request).
    if (canTransition(role, s.status, 'cancelled') && (role === 'owner' || s.raisedByMe))
      actions.push('cancel');
  }
  // E19: the owner used their own contractor; the request closes as "owner arranged".
  if (role === 'owner' && (s.status === 'assigned' || s.status === 'scheduled'))
    actions.push('arranged_myself');
  return actions;
}

export interface Outcome {
  readonly to: Status;
  readonly closeReason: CloseReason | null;
}

/** L4, A3: approving books the work; declining lets the partner revise once, then closes. */
export function quoteDecision(decision: 'approve' | 'decline', revision: number): Outcome {
  if (decision === 'approve') return { to: 'scheduled', closeReason: null };
  return revision >= MAX_QUOTE_REVISIONS
    ? { to: 'closed', closeReason: 'quote_declined' }
    : { to: 'assigned', closeReason: null };
}

/** E10, A5: confirmed closes the request; "not done" reopens it with the same partner. */
export function confirmation(done: boolean): Outcome {
  return done ? { to: 'closed', closeReason: 'confirmed' } : { to: 'reopened', closeReason: null };
}

/** A2: when a quote sent at `sentAt` expires. */
export function quoteExpiresAt(sentAt: number): number {
  return sentAt + QUOTE_VALID_DAYS * DAY;
}

/** A4: when work marked done at `completedAt` closes by itself if nobody confirms. */
export function autoCloseAt(completedAt: number): number {
  return completedAt + AUTO_CLOSE_HOURS * HOUR;
}

/** A visit window: 30 minutes to 4 hours long, starting within the next 30 days. */
export function visitWindowAllowed(start: number, end: number, now: number): boolean {
  const length = end - start;
  return start >= now - 5 * 60_000 && start <= now + 30 * DAY && length >= 30 * 60_000 && length <= 4 * HOUR;
}

/** AED amounts with at most two decimals, stored as fils (whole numbers). */
export function toFils(aed: number): number {
  return Math.round(aed * 100);
}

const aedAmount = z
  .number()
  .positive()
  .max(10_000_000)
  .refine((n) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-6, 'At most two decimals.');

/** POST /api/partner/jobs/:id/visit */
export const bookVisitBody = z.strictObject({
  technicianId: idSchema,
  windowStart: z.number().int().positive(),
  windowEnd: z.number().int().positive(),
});
export type BookVisitBody = z.infer<typeof bookVisitBody>;

/** POST /api/partner/jobs/:id/quote */
export const sendQuoteBody = z.strictObject({
  amountAed: aedAmount,
  scope: z.string().trim().min(1).max(2000),
});
export type SendQuoteBody = z.infer<typeof sendQuoteBody>;

/** POST /api/partner/jobs/:id/done: an optional note to the resident (saved as a message). */
export const workDoneBody = z.strictObject({ note: z.string().trim().max(1000).optional() });
export type WorkDoneBody = z.infer<typeof workDoneBody>;

/** POST /api/requests/:id/quote-decision (owner only). */
export const quoteDecisionBody = z.strictObject({
  quoteId: idSchema,
  decision: z.enum(['approve', 'decline']),
});
export type QuoteDecisionBody = z.infer<typeof quoteDecisionBody>;

/** POST /api/requests/:id/confirm (resident). */
export const confirmBody = z.strictObject({ done: z.boolean() });
export type ConfirmBody = z.infer<typeof confirmBody>;

/** POST /api/requests/:id/rating (resident, once, after the request closes). */
export const ratingBody = z.strictObject({
  stars: z.number().int().min(1).max(5),
  comment: z.string().trim().max(1000).optional(),
});
export type RatingBody = z.infer<typeof ratingBody>;

/** A7: within how long a visit is rebooked after "no access". */
export const NO_ACCESS_REBOOK_HOURS = 24;

/** POST /api/partner/jobs/:id/no-access: the photo (uploaded first) shows the technician was there. */
export const noAccessBody = z.strictObject({ photoId: idSchema });
export type NoAccessBody = z.infer<typeof noAccessBody>;

/** POST /api/partner/jobs/:id/make-safe: urgent work done within the owner's limit (E8). */
export const makeSafeBody = z.strictObject({
  amountAed: aedAmount,
  scope: z.string().trim().min(1).max(2000),
});
export type MakeSafeBody = z.infer<typeof makeSafeBody>;

/** POST /api/requests/:id/close: cancel (before work starts) or "I arranged it myself" (E19). */
export const closeRequestBody = z.strictObject({ reason: z.enum(['cancel', 'arranged_myself']) });
export type CloseRequestBody = z.infer<typeof closeRequestBody>;
