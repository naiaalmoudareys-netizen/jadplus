/**
 * Writing in-app notifications (ADR 0019, 0021) as statements for the same batch as the change they describe, so
 * a notification exists exactly when the change does. Who receives a request item is inboxRecipients (shared):
 * the owner, the person who raised it, or both. Tenancy items go to the people named.
 */
import { inboxRecipients, type InboxData, type InboxKind } from '@jadplus/shared';
import { newId } from '../crypto.js';

export interface InboxTarget {
  readonly id: string;
  readonly owner_user_id: string;
  readonly raised_by_user_id: string;
}

export function inboxStatements(
  db: D1Database,
  request: InboxTarget,
  kind: InboxKind,
  at: number,
  data: InboxData = {},
  /** Set for reminders, so each is created once (e.g. "visit_tomorrow:<visit id>"). */
  dedupeKey: string | null = null,
): D1PreparedStatement[] {
  const people = inboxRecipients(kind, request.owner_user_id, request.raised_by_user_id);
  return people.map((userId) =>
    db
      .prepare(
        `INSERT OR IGNORE INTO inbox (id, user_id, request_id, kind, data, at, dedupe_key)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        newId(),
        userId,
        request.id,
        kind,
        Object.keys(data).length === 0 ? null : JSON.stringify(data),
        at,
        dedupeKey === null ? null : `${dedupeKey}:${userId}`,
      ),
  );
}

/**
 * A partner notification (ADR 0024): to the technician assigned to the job, or to every active technician of the
 * partner when nobody is assigned yet, and always to the partner's office (partner_admin). "job_assigned_to_you"
 * goes to the assigned technician only. Recipients are read when the batch runs, so a technician chosen earlier
 * in the same batch is the one told.
 */
export function partnerInboxStatement(
  db: D1Database,
  target: { readonly requestId: string; readonly partnerId: string },
  kind: InboxKind,
  at: number,
  data: InboxData = {},
): D1PreparedStatement {
  const officeToo = kind === 'job_assigned_to_you' ? 0 : 1;
  return db
    .prepare(
      `INSERT OR IGNORE INTO inbox (id, user_id, request_id, kind, data, at)
       SELECT lower(hex(randomblob(16))), people.user_id, ?1, ?2, ?3, ?4 FROM (
         SELECT t.user_id FROM technicians t JOIN requests r ON r.id = ?1
           WHERE t.partner_id = ?5 AND t.status = 'active'
             AND (t.id = r.technician_id OR (r.technician_id IS NULL AND ?6 = 1))
         UNION
         SELECT g.user_id FROM user_roles g
           WHERE ?6 = 1 AND g.role = 'partner_admin' AND g.partner_id = ?5 AND g.revoked_at IS NULL
       ) people`,
    )
    .bind(
      target.requestId,
      kind,
      Object.keys(data).length === 0 ? null : JSON.stringify(data),
      at,
      target.partnerId,
      officeToo,
    );
}

/** A tenancy notification (invited, ending, ended) for one person. */
export function tenancyInboxStatement(
  db: D1Database,
  item: {
    readonly tenancyId: string;
    readonly userId: string;
    readonly kind: Extract<InboxKind, `tenancy_${string}`>;
    readonly at: number;
    readonly data?: InboxData;
    readonly dedupeKey?: string;
  },
): D1PreparedStatement {
  return db
    .prepare(
      `INSERT OR IGNORE INTO inbox (id, user_id, tenancy_id, kind, data, at, dedupe_key)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      newId(),
      item.userId,
      item.tenancyId,
      item.kind,
      item.data === undefined ? null : JSON.stringify(item.data),
      item.at,
      item.dedupeKey === undefined ? null : `${item.dedupeKey}:${item.userId}`,
    );
}
