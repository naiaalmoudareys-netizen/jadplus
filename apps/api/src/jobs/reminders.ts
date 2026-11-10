/**
 * Reminders (ADR 0019), run every minute with the request clock. Each one is written to the in-app inbox once
 * (the visit and quote rows remember it was sent; confirmation reminders use a dedupe key):
 *
 * - A8: the visit, 24 hours before (only if it was booked more than 2 hours ahead) and 1 hour before
 * - A2: a quote still waiting on day 10 (it expires on day 14)
 * - A4: work marked done and not confirmed, at 24 h and 48 h (it closes by itself at 72 h)
 *
 * When message providers are connected (phase E) the same items are also sent by SMS / WhatsApp / push.
 */
import { CONFIRM_REMINDER_HOURS, QUOTE_REMINDER_AFTER, VISIT_REMINDERS } from '@jadplus/shared';
import { inboxStatements, type InboxTarget } from '../requests/inbox.js';

const HOUR = 3_600_000;

interface VisitDue extends InboxTarget {
  visit_id: string;
  window_start: number;
  window_end: number;
  created_at: number;
  day_sent: number | null;
}

interface QuoteDue extends InboxTarget {
  quote_id: string;
  amount_fils: number;
}

interface ConfirmDue extends InboxTarget {
  done_at: number;
}

export interface ReminderResult {
  readonly visits: number;
  readonly quotes: number;
  readonly confirmations: number;
}

const TARGET = 'r.id, r.owner_user_id, r.raised_by_user_id';

async function visitReminders(db: D1Database, now: number): Promise<number> {
  const { results } = await db
    .prepare(
      `SELECT ${TARGET}, v.id AS visit_id, v.window_start, v.window_end, v.created_at,
              v.reminder_day_sent_at AS day_sent
       FROM visits v JOIN requests r ON r.id = v.request_id
       WHERE v.status = 'booked' AND v.window_start > ?1
         AND ((v.reminder_day_sent_at IS NULL AND v.window_start - ?2 <= ?1)
           OR (v.reminder_hour_sent_at IS NULL AND v.window_start - ?3 <= ?1))`,
    )
    .bind(now, VISIT_REMINDERS.tomorrow, VISIT_REMINDERS.soon)
    .all<VisitDue>();
  let sent = 0;
  for (const v of results) {
    const window = { windowStart: v.window_start, windowEnd: v.window_end };
    const soon = v.window_start - VISIT_REMINDERS.soon <= now;
    const statements: D1PreparedStatement[] = [];
    if (soon) {
      statements.push(
        ...inboxStatements(db, v, 'visit_soon', now, window, `visit_soon:${v.visit_id}`),
        db
          .prepare(
            'UPDATE visits SET reminder_hour_sent_at = ?, reminder_day_sent_at = COALESCE(reminder_day_sent_at, ?) WHERE id = ?',
          )
          .bind(now, now, v.visit_id),
      );
    } else {
      // A visit booked only a couple of hours ahead needs no "day before" message.
      const worthIt = v.window_start - v.created_at > 2 * HOUR;
      if (worthIt)
        statements.push(
          ...inboxStatements(db, v, 'visit_tomorrow', now, window, `visit_tomorrow:${v.visit_id}`),
        );
      statements.push(
        db.prepare('UPDATE visits SET reminder_day_sent_at = ? WHERE id = ?').bind(now, v.visit_id),
      );
    }
    await db.batch(statements);
    sent += 1;
  }
  return sent;
}

async function quoteReminders(db: D1Database, now: number): Promise<number> {
  const { results } = await db
    .prepare(
      `SELECT ${TARGET}, q.id AS quote_id, q.amount_fils
       FROM quotes q JOIN requests r ON r.id = q.request_id
       WHERE q.status = 'pending' AND q.reminded_at IS NULL AND q.sent_at + ? <= ? AND r.status = 'quote_sent'`,
    )
    .bind(QUOTE_REMINDER_AFTER, now)
    .all<QuoteDue>();
  for (const q of results) {
    await db.batch([
      ...inboxStatements(
        db,
        q,
        'quote_reminder',
        now,
        { amountAed: q.amount_fils / 100 },
        `quote_reminder:${q.quote_id}`,
      ),
      db
        .prepare('UPDATE quotes SET reminded_at = ? WHERE id = ? AND reminded_at IS NULL')
        .bind(now, q.quote_id),
    ]);
  }
  return results.length;
}

async function confirmReminders(db: D1Database, now: number): Promise<number> {
  const { results } = await db
    .prepare(
      `SELECT ${TARGET}, r.status_changed_at AS done_at FROM requests r
       WHERE r.status = 'completed' AND r.status_changed_at <= ?`,
    )
    .bind(now - CONFIRM_REMINDER_HOURS[0] * HOUR)
    .all<ConfirmDue>();
  let sent = 0;
  for (const r of results) {
    // The latest reminder due now; the dedupe key makes each one happen once.
    const hours = [...CONFIRM_REMINDER_HOURS].reverse().find((h) => r.done_at + h * HOUR <= now);
    if (hours === undefined) continue;
    await db.batch(
      inboxStatements(db, r, 'confirm_reminder', now, { hours }, `confirm:${String(hours)}:${r.id}`),
    );
    sent += 1;
  }
  return sent;
}

export async function runReminders(db: D1Database, now: number): Promise<ReminderResult> {
  return {
    visits: await visitReminders(db, now),
    quotes: await quoteReminders(db, now),
    confirmations: await confirmReminders(db, now),
  };
}
