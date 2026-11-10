/**
 * In-app notifications (ADR 0019): what happened on a person's requests and what is coming up, shown in the app
 * under the bell, in the person's own language. The server stores only the kind and a few facts (times,
 * amounts, the reference), never the wording and never contact details; the app writes the sentence.
 *
 * When message providers are connected (phase E, ADR 0007), the same items are also sent by SMS / WhatsApp /
 * push, respecting the person's switches (preferences.ts). Request updates are the service itself: always on.
 */
import { z } from 'zod';
import { idSchema } from './schemas.js';

export const INBOX_KINDS = [
  'visit_booked', // the partner booked (or moved) the visit
  'visit_tomorrow', // A8: the day before
  'visit_soon', // A8: one hour before
  'on_the_way', // A8: the technician is on the way
  'no_access', // A7: the technician could not get in; a new visit follows within 24 h
  'quote_received', // L4: a quote waits for the owner
  'quote_reminder', // A2: day 10, the quote expires on day 14
  'quote_expired', // A2
  'make_safe_done', // E8: urgent work within the owner's limit
  'work_done', // E10: please confirm
  'confirm_reminder', // A4: 24 h and 48 h after the work was marked done
  'auto_closed', // A4: closed after 72 h without an answer
  'approval_needed', // A1: a tenant's request waits for the owner
  'approval_reminder', // A1: 24 h later
  'request_approved', // A1: to the tenant
  'request_declined', // A1: to the tenant
  'tenancy_invited', // R2: to the tenant
  'tenancy_ending', // U4: 30 days before the end, to the tenant and the owner
  'tenancy_ended', // U5: access ended; the owner can extend in one tap
  'message_received', // a new message on a request (residents or the partner, never the writer)
  // To the partner (ADR 0024): the assigned technician (or the whole team when nobody is assigned) and the office.
  'job_new', // E1/R3: a new job (urgent for an emergency)
  'job_reminder', // E5: an emergency not acknowledged after 15 minutes
  'job_moved_away', // E6: the emergency went to the backup partner
  'job_assigned_to_you', // the office chose this technician
  'quote_approved', // L4: the owner approved the quote
  'quote_declined', // A3: one revised quote may follow
  'work_confirmed', // E10
  'work_reopened', // A5: the resident says it is not done
  'job_rated', // S5
  'job_cancelled', // the resident cancelled, or the owner arranged it
  // Partner invoices (ADR 0026): JAD+ records them, the owner pays the partner directly.
  'invoice_issued', // to the owner: an invoice to pay, with the total and due date
  'invoice_overdue', // to the owner: the due date passed and it is not paid (once)
  'invoice_paid', // to the owner: the partner confirmed the payment arrived
  'invoice_not_received', // to the owner: the partner has not received the payment the owner reported
  'invoice_cancelled', // to the owner: the partner cancelled the invoice
  'invoice_paid_claimed', // to the partner office: the owner says they have paid; please confirm
] as const;
export type InboxKind = (typeof INBOX_KINDS)[number];

/** Who receives each kind: the owner only (decisions that are the owner's), or the residents of the request. */
export const OWNER_ONLY_KINDS: ReadonlySet<InboxKind> = new Set<InboxKind>([
  'quote_received',
  'quote_reminder',
  'quote_expired',
  'make_safe_done',
  'approval_needed',
  'approval_reminder',
  // Tenants never see invoices: the owner pays (ADR 0026).
  'invoice_issued',
  'invoice_overdue',
  'invoice_paid',
  'invoice_not_received',
  'invoice_cancelled',
]);

/** Kinds only the person who raised the request receives (the owner made the decision). */
export const REQUESTER_ONLY_KINDS: ReadonlySet<InboxKind> = new Set<InboxKind>([
  'request_approved',
  'request_declined',
]);

/** The people a request notification goes to: the owner, the person who raised it, or both (once). */
export function inboxRecipients(kind: InboxKind, ownerUserId: string, raisedByUserId: string): string[] {
  if (OWNER_ONLY_KINDS.has(kind)) return [ownerUserId];
  if (REQUESTER_ONLY_KINDS.has(kind)) return [raisedByUserId];
  return [...new Set([ownerUserId, raisedByUserId])];
}

/** Kinds sent to the partner company rather than to residents (ADR 0024). */
export const PARTNER_KINDS: ReadonlySet<InboxKind> = new Set<InboxKind>([
  'job_new',
  'job_reminder',
  'job_moved_away',
  'job_assigned_to_you',
  'quote_approved',
  'quote_declined',
  'work_confirmed',
  'work_reopened',
  'job_rated',
  'job_cancelled',
  'invoice_paid_claimed',
]);

/** The few facts the app needs to write the sentence. No personal data. */
export const inboxData = z.object({
  windowStart: z.number().int().optional(),
  windowEnd: z.number().int().optional(),
  amountAed: z.number().optional(),
  hours: z.number().int().optional(),
  /** A tenancy's end date (YYYY-MM-DD) and the days left. */
  endsOn: z.string().optional(),
  days: z.number().int().optional(),
  /** An emergency job (shown as urgent). */
  urgent: z.boolean().optional(),
  stars: z.number().int().optional(),
  /** An invoice's due date (YYYY-MM-DD) and number (ADR 0026). */
  dueOn: z.string().optional(),
  invoiceNumber: z.string().optional(),
});
export type InboxData = z.infer<typeof inboxData>;

/** GET /api/me/inbox */
export const inboxResponse = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      kind: z.enum(INBOX_KINDS),
      /** The request the item is about, or null for a tenancy item (then tenancyId is set). */
      requestId: z.string().nullable(),
      tenancyId: z.string().nullable(),
      ref: z.string().nullable(),
      at: z.number().int(),
      read: z.boolean(),
      data: inboxData,
    }),
  ),
  unread: z.number().int(),
});
export type Inbox = z.infer<typeof inboxResponse>;
export type InboxItem = Inbox['items'][number];

/** POST /api/me/inbox/read: some items, or all of them. */
export const markReadBody = z.union([
  z.strictObject({ ids: z.array(idSchema).min(1).max(100) }),
  z.strictObject({ all: z.literal(true) }),
]);
export type MarkReadBody = z.infer<typeof markReadBody>;

const HOUR = 3_600_000;

/** A8: the day-before reminder goes out from 24 hours before the visit, the hour-before one from 1 hour before. */
export const VISIT_REMINDERS = { tomorrow: 24 * HOUR, soon: HOUR } as const;
/** A2: the quote reminder on day 10 (the quote expires on day 14). */
export const QUOTE_REMINDER_AFTER = 10 * 24 * HOUR;
/** A4: reminders to confirm finished work, 24 h and 48 h after it was marked done. */
export const CONFIRM_REMINDER_HOURS = [24, 48] as const;
