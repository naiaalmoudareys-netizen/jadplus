/**
 * Step 2 of delivery (ADR 0007), every minute after the escalation sweep: sends due deliveries through the
 * configured providers, urgent first, retrying with back-off. A delivery that fails for good is marked
 * failed; a notification none of whose deliveries went out is marked failed and audited, so JAD+ Admin sees it
 * on the undelivered list. Addresses are decrypted only here, in memory, and never logged (C-LOG-1).
 */
import {
  dubaiClock,
  nextAttemptAt,
  renderMessage,
  type Channel,
  type EmergencyType,
  type LifeSafetyType,
  type NotificationTemplate,
  type RecipientKind,
} from '@jadplus/shared';
import { auditStatement } from '../audit.js';
import { decryptField, toBytes, type Keys } from '../crypto.js';
import type { Bindings } from '../env.js';
import type { Logger } from '../logger.js';
import type { Senders } from './senders.js';

interface DueDelivery {
  id: string;
  notification_id: string;
  channel: Channel;
  recipient_user_id: string | null;
  recipient_partner_id: string | null;
  recipient_contact_id: string | null;
  attempts: number;
  template: NotificationTemplate;
  recipient_kind: RecipientKind;
  urgent: number;
  request_id: string;
  ref: string;
  emergency_type: EmergencyType | LifeSafetyType | null;
  arrival_window_start: number | null;
  arrival_window_end: number | null;
}

export interface SendResult {
  readonly sent: number;
  readonly retrying: number;
  readonly failed: number;
}

/** The address of a delivery, decrypted, or null when it is no longer on file. */
async function addressOf(db: D1Database, keys: Keys, d: DueDelivery): Promise<string | null> {
  const column = d.channel === 'email' ? 'email' : 'phone';
  if (d.recipient_contact_id !== null) {
    // E12: a building management contact (ADR 0027). Gone if JAD+ Admin removed the contact meanwhile.
    const row = await db
      .prepare(`SELECT ${column}_enc AS enc FROM building_contacts WHERE id = ?`)
      .bind(d.recipient_contact_id)
      .first<{ enc: unknown }>();
    if (row === null || row.enc === null) return null;
    return decryptField(keys, toBytes(row.enc), `building_contacts.${column}:${d.recipient_contact_id}`);
  }
  if (d.recipient_partner_id !== null) {
    const row = await db
      .prepare('SELECT alert_phone_enc FROM partners WHERE id = ?')
      .bind(d.recipient_partner_id)
      .first<{ alert_phone_enc: unknown }>();
    if (row === null || row.alert_phone_enc === null) return null;
    return decryptField(keys, toBytes(row.alert_phone_enc), `partners.alert_phone:${d.recipient_partner_id}`);
  }
  const row = await db
    .prepare(`SELECT ${column}_enc AS enc FROM users WHERE id = ? AND status <> 'closed'`)
    .bind(d.recipient_user_id)
    .first<{ enc: unknown }>();
  if (row === null || row.enc === null) return null;
  return decryptField(keys, toBytes(row.enc), `users.${column}:${d.recipient_user_id ?? ''}`);
}

/** Marks the notification failed (and audits it) when none of its deliveries went out or can still go out. */
async function closeIfUndelivered(db: D1Database, d: DueDelivery, now: number): Promise<void> {
  const closed = await db
    .prepare(
      `UPDATE notifications SET failed_at = ?, failure = 'not_delivered'
       WHERE id = ? AND failed_at IS NULL AND sent_at IS NULL AND NOT EXISTS
         (SELECT 1 FROM notification_deliveries WHERE notification_id = ? AND status IN ('pending', 'sent'))`,
    )
    .bind(now, d.notification_id, d.notification_id)
    .run();
  if (closed.meta.changes !== 1) return;
  await auditStatement(db, {
    at: now,
    actorUserId: null,
    actorRole: 'system',
    action: 'notification_failed',
    targetType: 'request',
    targetId: d.request_id,
    ipHash: null,
    httpRequestId: null,
    detail: { failure: 'not_delivered' },
  }).run();
}

export async function sendDue(
  env: Bindings,
  keys: Keys,
  senders: Senders,
  now: number,
  log: Logger,
  limit = 50,
): Promise<SendResult> {
  const db = env.DB;
  const { results } = await db
    .prepare(
      `SELECT d.id, d.notification_id, d.channel, d.recipient_user_id, d.recipient_partner_id, d.recipient_contact_id,
              d.attempts,
              n.template, n.recipient_kind, n.urgent, n.request_id,
              r.ref, r.emergency_type, r.arrival_window_start, r.arrival_window_end
       FROM notification_deliveries d
       JOIN notifications n ON n.id = d.notification_id
       JOIN requests r ON r.id = n.request_id
       WHERE d.status = 'pending' AND d.next_attempt_at <= ?
       ORDER BY n.urgent DESC, d.next_attempt_at LIMIT ?`,
    )
    .bind(now, limit)
    .all<DueDelivery>();

  const totals = { sent: 0, retrying: 0, failed: 0 };
  for (const d of results) {
    const sender = senders[d.channel];
    let outcome: { ok: true; ref: string | null } | { ok: false; error: string; final: boolean };
    try {
      const to = await addressOf(db, keys, d);
      if (sender === undefined) outcome = { ok: false, error: 'not_configured', final: true };
      else if (to === null) outcome = { ok: false, error: 'no_address', final: true };
      else {
        const arrival =
          d.arrival_window_start === null || d.arrival_window_end === null
            ? null
            : { from: dubaiClock(d.arrival_window_start), to: dubaiClock(d.arrival_window_end) };
        const message = renderMessage(d.template, d.recipient_kind, {
          ref: d.ref,
          type: d.emergency_type,
          arrival,
        });
        const accepted = await sender(env, { to, ...message, urgent: d.urgent === 1 });
        outcome = { ok: true, ref: accepted.providerRef };
      }
    } catch (err) {
      log.log('warn', 'Alert delivery attempt failed', { deliveryId: d.id, channel: d.channel, err });
      outcome = { ok: false, error: 'provider_error', final: false };
    }

    const attempts = d.attempts + 1;
    if (outcome.ok) {
      totals.sent += 1;
      await db.batch([
        db
          .prepare(
            `UPDATE notification_deliveries SET status = 'sent', sent_at = ?, next_attempt_at = NULL,
               attempts = ?, provider_ref = ?, last_error = NULL WHERE id = ?`,
          )
          .bind(now, attempts, outcome.ref?.slice(0, 120) ?? null, d.id),
        db
          .prepare('UPDATE notifications SET sent_at = COALESCE(sent_at, ?) WHERE id = ?')
          .bind(now, d.notification_id),
      ]);
      continue;
    }
    const retryAt = outcome.final ? null : nextAttemptAt(attempts, d.urgent === 1, now);
    if (retryAt !== null) {
      totals.retrying += 1;
      await db
        .prepare(
          'UPDATE notification_deliveries SET attempts = ?, next_attempt_at = ?, last_error = ? WHERE id = ?',
        )
        .bind(attempts, retryAt, outcome.error, d.id)
        .run();
      continue;
    }
    totals.failed += 1;
    await db
      .prepare(
        `UPDATE notification_deliveries SET status = 'failed', attempts = ?, next_attempt_at = NULL, last_error = ?
         WHERE id = ?`,
      )
      .bind(attempts, outcome.error, d.id)
      .run();
    await closeIfUndelivered(db, d, now);
  }
  if (totals.failed > 0) log.log('error', 'Some alerts could not be delivered', { ...totals });
  return totals;
}
