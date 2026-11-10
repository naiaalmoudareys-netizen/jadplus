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
] as const;
export type InboxKind = (typeof INBOX_KINDS)[number];

/** Who receives each kind: the owner only (decisions that are the owner's), or the residents of the request. */
export const OWNER_ONLY_KINDS: ReadonlySet<InboxKind> = new Set<InboxKind>([
  'quote_received',
  'quote_reminder',
  'quote_expired',
  'make_safe_done',
]);

/** The few facts the app needs to write the sentence. No personal data. */
export const inboxData = z.object({
  windowStart: z.number().int().optional(),
  windowEnd: z.number().int().optional(),
  amountAed: z.number().optional(),
  hours: z.number().int().optional(),
});
export type InboxData = z.infer<typeof inboxData>;

/** GET /api/me/inbox */
export const inboxResponse = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      kind: z.enum(INBOX_KINDS),
      requestId: z.string(),
      ref: z.string(),
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
