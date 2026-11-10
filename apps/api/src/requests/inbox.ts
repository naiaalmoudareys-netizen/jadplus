/**
 * Writing in-app notifications (ADR 0019) as statements for the same batch as the change they describe, so a
 * notification exists exactly when the change does. Owner-only kinds (quotes, make-safe) go to the owner; the
 * others to the owner and, if someone else raised the request (a tenant), to them too.
 */
import { OWNER_ONLY_KINDS, type InboxData, type InboxKind } from '@jadplus/shared';
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
  const people = OWNER_ONLY_KINDS.has(kind)
    ? [request.owner_user_id]
    : [...new Set([request.owner_user_id, request.raised_by_user_id])];
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
