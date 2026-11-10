/**
 * Step 1 of delivery (ADR 0007): each new notification becomes one delivery per channel and recipient.
 *
 * - user: that person (owner, tenant, resident).
 * - partner: SMS to the partner's alert line (E6 "phone alerted"); email to the partner office (partner_admin).
 * - on_call: the two people on this week's rota; if the week is empty, every JAD+ Admin (and it is logged).
 * - building_fm: building contacts are not in JAD+ yet (console, phase C), so these fail visibly.
 * A notification nobody can receive is marked failed at once, so it shows on the admin's undelivered list.
 */
import { channelsFor, dubaiDate, weekStarting, type Channel, type RecipientKind } from '@jadplus/shared';
import { auditStatement } from '../audit.js';
import { newId } from '../crypto.js';
import type { Logger } from '../logger.js';

interface PendingNotification {
  id: string;
  recipient_kind: RecipientKind;
  recipient_user_id: string | null;
  recipient_partner_id: string | null;
  urgent: number;
  request_id: string;
}

type Target = { channel: Channel } & ({ userId: string } | { partnerId: string });

interface Contactable {
  id: string;
  has_email: number;
  has_phone: number;
}

const CONTACT_COLUMNS = `u.id, u.email_enc IS NOT NULL AS has_email, u.phone_enc IS NOT NULL AS has_phone`;

function forPeople(people: readonly Contactable[], channels: readonly Channel[]): Target[] {
  return people.flatMap((p) =>
    channels
      .filter((ch) => (ch === 'email' ? p.has_email === 1 : p.has_phone === 1))
      .map((channel) => ({ channel, userId: p.id })),
  );
}

async function onCallPeople(db: D1Database, now: number, log: Logger): Promise<Contactable[]> {
  const week = weekStarting(dubaiDate(now));
  const rota = await db
    .prepare(
      `SELECT ${CONTACT_COLUMNS} FROM on_call_rota r JOIN users u ON u.id = r.user_id
       WHERE r.week_starting = ? AND u.status = 'active' ORDER BY r.position`,
    )
    .bind(week)
    .all<Contactable>();
  if (rota.results.length > 0) return rota.results;
  log.log('warn', 'No on-call rota this week; alerting every JAD+ Admin', { week });
  const admins = await db
    .prepare(
      `SELECT DISTINCT ${CONTACT_COLUMNS} FROM user_roles g JOIN users u ON u.id = g.user_id
       WHERE g.role = 'jad_admin' AND g.revoked_at IS NULL AND u.status = 'active'`,
    )
    .all<Contactable>();
  return admins.results;
}

async function targetsFor(
  db: D1Database,
  n: PendingNotification,
  now: number,
  log: Logger,
): Promise<Target[]> {
  const channels = channelsFor(n.urgent === 1);
  switch (n.recipient_kind) {
    case 'user': {
      const user = await db
        .prepare(`SELECT ${CONTACT_COLUMNS} FROM users u WHERE u.id = ? AND u.status <> 'closed'`)
        .bind(n.recipient_user_id)
        .first<Contactable>();
      return user === null ? [] : forPeople([user], channels);
    }
    case 'partner': {
      const partnerId = n.recipient_partner_id ?? '';
      const line = await db
        .prepare('SELECT alert_phone_enc IS NOT NULL AS has_line FROM partners WHERE id = ?')
        .bind(partnerId)
        .first<{ has_line: number }>();
      const office = await db
        .prepare(
          `SELECT DISTINCT ${CONTACT_COLUMNS} FROM user_roles g JOIN users u ON u.id = g.user_id
           WHERE g.role = 'partner_admin' AND g.partner_id = ? AND g.revoked_at IS NULL AND u.status = 'active'`,
        )
        .bind(partnerId)
        .all<Contactable>();
      const sms: Target[] =
        channels.includes('sms') && line?.has_line === 1 ? [{ channel: 'sms', partnerId }] : [];
      return [...sms, ...forPeople(office.results, ['email'])];
    }
    case 'on_call':
      return forPeople(await onCallPeople(db, now, log), channels);
    case 'building_fm':
      return [];
  }
}

/** Splits up to `limit` new notifications into deliveries. Returns how many notifications were handled. */
export async function fanOut(db: D1Database, now: number, log: Logger, limit = 100): Promise<number> {
  const { results } = await db
    .prepare(
      `SELECT id, recipient_kind, recipient_user_id, recipient_partner_id, urgent, request_id FROM notifications
       WHERE fanned_out_at IS NULL ORDER BY urgent DESC, created_at LIMIT ?`,
    )
    .bind(limit)
    .all<PendingNotification>();
  for (const n of results) {
    const targets = await targetsFor(db, n, now, log);
    const statements = targets.map((t) =>
      db
        .prepare(
          `INSERT INTO notification_deliveries
             (id, notification_id, channel, recipient_user_id, recipient_partner_id, next_attempt_at, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING`,
        )
        .bind(
          newId(),
          n.id,
          t.channel,
          'userId' in t ? t.userId : null,
          'partnerId' in t ? t.partnerId : null,
          now,
          now,
        ),
    );
    if (targets.length === 0) {
      const failure = n.recipient_kind === 'building_fm' ? 'no_building_contact' : 'no_recipient';
      log.log('error', 'Alert has nobody to go to', { notificationId: n.id, failure });
      statements.push(
        db
          .prepare('UPDATE notifications SET failed_at = ?, failure = ? WHERE id = ?')
          .bind(now, failure, n.id),
        auditStatement(db, {
          at: now,
          actorUserId: null,
          actorRole: 'system',
          action: 'notification_failed',
          targetType: 'request',
          targetId: n.request_id,
          ipHash: null,
          httpRequestId: null,
          detail: { failure },
        }),
      );
    }
    statements.push(db.prepare('UPDATE notifications SET fanned_out_at = ? WHERE id = ?').bind(now, n.id));
    await db.batch(statements);
  }
  return results.length;
}
