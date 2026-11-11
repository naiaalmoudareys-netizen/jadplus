/**
 * Step 1 of delivery (ADR 0007): each new notification becomes one delivery per channel and recipient.
 *
 * - user: that person (owner, tenant, resident).
 * - partner: SMS to the partner's alert line (E6 "phone alerted"); email to the partner office (partner_admin);
 *   outside working hours, a new emergency or its reminder also goes to the technician the partner named as
 *   this week's after-hours contact (E5-E7, ADR 0027).
 * - on_call: the two people on this week's rota; if the week is empty, every JAD+ Admin (and it is logged).
 * - building_fm: the building management contacts JAD+ Admin keeps for the unit's building and project (E12,
 *   ADR 0027); without any, the alert fails visibly.
 * A notification nobody can receive is marked failed at once, so it shows on the admin's undelivered list.
 * Only ids are stored: addresses are decrypted at send time and never logged (C-LOG-1).
 */
import {
  afterHoursWeek,
  channelsFor,
  contactsCovering,
  dubaiDate,
  weekStarting,
  type Channel,
  type NotificationTemplate,
  type RecipientKind,
} from '@jadplus/shared';
import { auditStatement } from '../audit.js';
import { newId } from '../crypto.js';
import type { Logger } from '../logger.js';

interface PendingNotification {
  id: string;
  recipient_kind: RecipientKind;
  recipient_user_id: string | null;
  recipient_partner_id: string | null;
  template: NotificationTemplate;
  urgent: number;
  request_id: string;
  created_at: number;
}

type Target = { channel: Channel } & ({ userId: string } | { partnerId: string } | { contactId: string });

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

/** E5-E7: the partner's after-hours technician for the week, if the partner named one who is still active. */
async function afterHoursPeople(db: D1Database, partnerId: string, week: string): Promise<Contactable[]> {
  const { results } = await db
    .prepare(
      `SELECT ${CONTACT_COLUMNS} FROM partner_after_hours a
       JOIN technicians t ON t.id = a.technician_id AND t.partner_id = a.partner_id AND t.status = 'active'
       JOIN users u ON u.id = t.user_id
       WHERE a.partner_id = ? AND a.week_starting = ? AND u.status = 'active'`,
    )
    .bind(partnerId, week)
    .all<Contactable>();
  return results;
}

interface BuildingContact {
  id: string;
  project: string;
  building: string;
  has_email: number;
  has_phone: number;
}

/** E12: the building management contacts for the request's unit (its building's and the project-wide ones). */
async function buildingContacts(
  db: D1Database,
  requestId: string,
  channels: readonly Channel[],
): Promise<Target[]> {
  // The unit's place as Salesforce last named it (the newest owner_units copy of that unit).
  const unit = await db
    .prepare(
      `SELECT ou.project, ou.building FROM requests r
       JOIN owner_units ou ON ou.rowid =
         (SELECT x.rowid FROM owner_units x WHERE x.sf_unit_id = r.sf_unit_id ORDER BY x.synced_at DESC LIMIT 1)
       WHERE r.id = ?`,
    )
    .bind(requestId)
    .first<{ project: string | null; building: string | null }>();
  const project = unit?.project ?? null;
  if (project === null) return [];
  const { results } = await db
    .prepare(
      `SELECT id, project, building, email_enc IS NOT NULL AS has_email, phone_enc IS NOT NULL AS has_phone
       FROM building_contacts WHERE project = ? ORDER BY created_at, id`,
    )
    .bind(project)
    .all<BuildingContact>();
  const places = results.map((c) => ({ ...c, building: c.building === '' ? null : c.building }));
  return contactsCovering(places, { project, building: unit?.building ?? null }).flatMap((c) =>
    channels
      .filter((ch) => (ch === 'email' ? c.has_email === 1 : c.has_phone === 1))
      .map((channel) => ({ channel, contactId: c.id })),
  );
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
      const week = afterHoursWeek({ recipientKind: 'partner', template: n.template, at: n.created_at });
      const afterHours =
        week === null ? [] : forPeople(await afterHoursPeople(db, partnerId, week), channels);
      return [...sms, ...forPeople(office.results, ['email']), ...afterHours];
    }
    case 'on_call':
      return forPeople(await onCallPeople(db, now, log), channels);
    case 'building_fm':
      return buildingContacts(db, n.request_id, channels);
  }
}

/** Splits up to `limit` new notifications into deliveries. Returns how many notifications were handled. */
export async function fanOut(db: D1Database, now: number, log: Logger, limit = 100): Promise<number> {
  const { results } = await db
    .prepare(
      `SELECT id, recipient_kind, recipient_user_id, recipient_partner_id, template, urgent, request_id, created_at
       FROM notifications
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
             (id, notification_id, channel, recipient_user_id, recipient_partner_id, recipient_contact_id,
              next_attempt_at, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING`,
        )
        .bind(
          newId(),
          n.id,
          t.channel,
          'userId' in t ? t.userId : null,
          'partnerId' in t ? t.partnerId : null,
          'contactId' in t ? t.contactId : null,
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
