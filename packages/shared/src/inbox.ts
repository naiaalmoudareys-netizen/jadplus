/**
 * In-app notifications (ADR 0019): what happened on a person's requests and what is coming up, shown in the app
 * under the bell, in the person's own language. The server stores only the kind and a few facts (times,
 * amounts, the reference), never the wording and never contact details; the app writes the sentence.
 *
 * When message providers are connected (phase E, ADR 0007), the same items are also sent by SMS / WhatsApp /
 * push, respecting the person's switches (preferences.ts). Request updates are the service itself: always on.
 */
import { z } from 'zod';
import { NOTICE_KINDS } from './admin-platform.js';
import { CONSULTATION_OUTCOMES } from './consultation.js';
import { HANDOVER_STEPS } from './handover.js';
import { REPORT_KINDS } from './reports.js';
import { idSchema } from './schemas.js';
import { SERVICE_FLOWS } from './services.js';
import { VISIT_SLOT_KEYS } from './visits.js';

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
  // When JAD+ acts on a request (ADR 0027): to the owner and the person who raised it.
  'request_cancelled_by_jad', // JAD+ Admin cancelled the request
  'request_moved_by_jad', // JAD+ Admin gave the job to another partner
  'request_reclassified', // E13: JAD+ reviewed an emergency and handles it as a routine request
  // V1 (ADR 0027): a notice was published for the person's building; the item points at the notice.
  'building_notice',
  // The service flows (ADR 0035): to the owner only. See SERVICE_OWNER_KINDS.
  'consultation_contact_made', // O5: the provider has been in touch
  'stage_reached', // O5/P5: a consultation stage (later also interior design stages), with or without a note
  'consultation_closed', // P5: done (please close) or did not go ahead (the reason is on the request)
  'report_ready', // O3/L2: a snagging, valuation or re-inspection report is on the request
  'snag_fixed', // O3: a snag was marked fixed; please check it
  'handover_step_done', // O2: a checklist step was completed
  'key_collection_booked', // O2: the key collection appointment was booked or moved
  'handover_complete', // O2: keys collected, the checklist is complete
  'session_changed', // O5: an education session the owner holds a seat on changed time or place
  'session_cancelled', // O5: ...was cancelled
  'session_reminder', // O5/S4: ...starts within a day
  'book_sent', // O5: the book the owner asked for was sent
  'statement_ready', // a managed unit's statement is ready
  'delivery_scheduled', // furnishing delivery date set or moved
  // To the provider office (ADR 0035), see PARTNER_KINDS.
  'reinspection_requested', // O3: the owner asked for the free re-inspection
  'snag_reopened', // O3: the owner says a snag is not fixed
  'snags_all_confirmed', // O3: the owner confirmed every fix
  'snags_to_fix', // O3: to the JAD Global handover team: open snags it may fix (new report, or reopened)
] as const;
export type InboxKind = (typeof INBOX_KINDS)[number];

/**
 * The service-flow kinds for owners (ADR 0035): consultations, reports and snags, handover, investor education,
 * managed-unit statements and furnishing deliveries. Owners only: tenants never see these services (R2), and they
 * show only in the owner view.
 */
export const SERVICE_OWNER_KINDS = [
  'consultation_contact_made',
  'stage_reached',
  'consultation_closed',
  'report_ready',
  'snag_fixed',
  'handover_step_done',
  'key_collection_booked',
  'handover_complete',
  'session_changed',
  'session_cancelled',
  'session_reminder',
  'book_sent',
  'statement_ready',
  'delivery_scheduled',
] as const satisfies readonly InboxKind[];
export type ServiceOwnerKind = (typeof SERVICE_OWNER_KINDS)[number];

/** Education session items point at the session (inbox.session_id), not at a request. */
export const SESSION_KINDS = [
  'session_changed',
  'session_cancelled',
  'session_reminder',
] as const satisfies readonly ServiceOwnerKind[];
export type SessionKind = (typeof SESSION_KINDS)[number];

/** Kinds that may point at nothing (the book; a statement not tied to a request). Mirrors migration 0031. */
export const UNTARGETED_KINDS = [
  'book_sent',
  'statement_ready',
] as const satisfies readonly ServiceOwnerKind[];
export type UntargetedKind = (typeof UNTARGETED_KINDS)[number];

/** Owner kinds that point at a request (statement_ready may point at a request or at nothing). */
export type RequestOwnerKind = Exclude<ServiceOwnerKind, SessionKind | 'book_sent'>;

/** Who receives each kind: the owner only (decisions that are the owner's), or the residents of the request. */
export const OWNER_ONLY_KINDS: ReadonlySet<InboxKind> = new Set<InboxKind>([
  ...SERVICE_OWNER_KINDS,
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
  'reinspection_requested',
  'snag_reopened',
  'snags_all_confirmed',
  'snags_to_fix',
]);

/**
 * O3 (ADR 0032, 0034): kinds for a JAD Global team assigned to the handover service, which may fix snags on a
 * request that is not its own. Its office sees them while the request is open and the team still has the service.
 */
export const HANDOVER_TEAM_KINDS: ReadonlySet<InboxKind> = new Set<InboxKind>(['snags_to_fix']);

const SERVICE_OWNER_SET: ReadonlySet<InboxKind> = new Set<InboxKind>(SERVICE_OWNER_KINDS);

/**
 * The view an item may show in, whoever it was written for (C-AZ-2, defence in depth): partner kinds only in the
 * technician or office view (the handover team's items only in the office view), service-flow owner kinds only in
 * the owner view (never as a tenant). Other kinds: no rule here (the request or the tenancy decides).
 */
export function inboxViewAllows(kind: InboxKind, role: string): boolean {
  if (HANDOVER_TEAM_KINDS.has(kind)) return role === 'partner_admin';
  if (PARTNER_KINDS.has(kind)) return role === 'partner' || role === 'partner_admin';
  if (SERVICE_OWNER_SET.has(kind)) return role === 'owner';
  return true;
}

/** A code or id from packages/shared (service code, stage id): lower case, digits, '_' and '-'. */
const codeText = z.string().regex(/^[a-z0-9_-]{1,40}$/);

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
  /** V1: what a building notice is about (water, power, lift...), so the app can name it (ADR 0027). */
  noticeKind: z.enum(NOTICE_KINDS).optional(),
  // Service flows (ADR 0035): codes and ids only, the app writes the words.
  /** How the request's service runs, so a reminder reads right for a consultation or a report. */
  flow: z.enum(SERVICE_FLOWS).optional(),
  /** The service code (e.g. 'mortgage') and the stage reached (e.g. 'pre_approval'). */
  service: codeText.optional(),
  stage: codeText.optional(),
  /** The step came with a note for the owner (read on the request or in My unit). */
  hasNote: z.boolean().optional(),
  outcome: z.enum(CONSULTATION_OUTCOMES).optional(),
  reportKind: z.enum(REPORT_KINDS).optional(),
  /** Snags waiting to be fixed. */
  count: z.number().int().optional(),
  /** A snag the owner reopened (rather than a new report). */
  reopened: z.boolean().optional(),
  step: z.enum(HANDOVER_STEPS).optional(),
  /** A day (YYYY-MM-DD, Dubai) and a time window: key collection, furnishing delivery. */
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  slot: z.enum(VISIT_SLOT_KEYS).optional(),
  /** The appointment, delivery or session moved (rather than booked for the first time). */
  moved: z.boolean().optional(),
  /** An education session's start (ms). */
  startsAt: z.number().int().optional(),
  /** The month a statement covers (YYYY-MM). */
  period: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .optional(),
});
export type InboxData = z.infer<typeof inboxData>;

/** GET /api/me/inbox */
export const inboxResponse = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      kind: z.enum(INBOX_KINDS),
      /** The request the item is about, or null for a tenancy item (tenancyId set) or a building notice. */
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
/** O5 (ADR 0035): the education session reminder goes out from 24 hours before the start. */
export const SESSION_REMINDER_BEFORE = 24 * HOUR;
