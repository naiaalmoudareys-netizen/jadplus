/**
 * The request clock (ADR 0018), run every minute with the escalation sweep:
 *
 * - A2: a quote nobody decided within 14 days expires, and the request closes ("quote expired").
 * - A4: work marked done and not confirmed within 72 hours closes by itself ("auto closed"), with the
 *   partner's finished-work photos as the evidence.
 *
 * Reminders (quote day 10, confirmation 24 h / 48 h) are sent once message providers are connected (phase E,
 * ADR 0007); the deadlines themselves apply now. Each change is one batch guarded by the request version, so a
 * decision made at the same moment wins and the sweep skips that request.
 */
import { AUTO_CLOSE_HOURS, type CloseReason } from '@jadplus/shared';
import { auditStatement, type AuditAction } from '../audit.js';
import type { Logger } from '../logger.js';
import { isVersionConflict, versionGuard } from '../requests/concurrency.js';
import { eventStatement } from '../requests/store.js';

const HOUR = 3_600_000;

interface Due {
  id: string;
  status: 'quote_sent' | 'completed';
  version: number;
  quote_id: string | null;
}

export interface ClockResult {
  readonly expiredQuotes: number;
  readonly autoClosed: number;
  readonly conflicts: number;
}

function closeStatements(
  db: D1Database,
  r: Due,
  now: number,
  reason: CloseReason,
  action: AuditAction,
): D1PreparedStatement[] {
  return [
    db
      .prepare(
        `UPDATE requests SET status = 'closed', close_reason = ?, next_due_at = NULL, next_due_kind = NULL,
           updated_at = ?, status_changed_at = ?, ${versionGuard} WHERE id = ?`,
      )
      .bind(reason, now, now, r.version, r.id),
    eventStatement(db, {
      requestId: r.id,
      at: now,
      actorUserId: null,
      actorRole: 'system',
      kind: 'status_changed',
      fromStatus: r.status,
      toStatus: 'closed',
    }),
    auditStatement(db, {
      at: now,
      actorUserId: null,
      actorRole: 'system',
      action,
      targetType: 'request',
      targetId: r.id,
      ipHash: null,
      httpRequestId: null,
    }),
  ];
}

export async function runRequestClock(db: D1Database, now: number, log: Logger): Promise<ClockResult> {
  const { results } = await db
    .prepare(
      `SELECT r.id, r.status, r.version, q.id AS quote_id
       FROM requests r JOIN quotes q ON q.request_id = r.id AND q.status = 'pending'
       WHERE r.status = 'quote_sent' AND q.expires_at <= ?1
       UNION ALL
       SELECT r.id, r.status, r.version, NULL AS quote_id
       FROM requests r WHERE r.status = 'completed' AND r.status_changed_at <= ?2`,
    )
    .bind(now, now - AUTO_CLOSE_HOURS * HOUR)
    .all<Due>();

  let expiredQuotes = 0;
  let autoClosed = 0;
  let conflicts = 0;
  for (const r of results) {
    const statements =
      r.quote_id === null
        ? closeStatements(db, r, now, 'auto_closed', 'request_auto_closed')
        : [
            ...closeStatements(db, r, now, 'quote_expired', 'quote_expired'),
            db
              .prepare(
                "UPDATE quotes SET status = 'expired', decided_at = ? WHERE id = ? AND status = 'pending'",
              )
              .bind(now, r.quote_id),
          ];
    try {
      await db.batch(statements);
      if (r.quote_id === null) autoClosed += 1;
      else expiredQuotes += 1;
    } catch (err) {
      if (!isVersionConflict(err)) throw err;
      conflicts += 1;
    }
  }
  const result = { expiredQuotes, autoClosed, conflicts };
  if (results.length > 0) log.log('info', 'Request clock', { ...result });
  return result;
}
