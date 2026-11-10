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
