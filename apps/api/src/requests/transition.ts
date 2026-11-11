/**
 * One change of a request's status with its evidence (ADR 0018): the guarded update (optimistic concurrency),
 * the history event and the audit entry, as statements for one atomic batch. The routine first-response SLA
 * (S4, S5) is recorded the first time the partner answers a routine request.
 */
import {
  firstResponseMetric,
  slaMet,
  type CloseReason,
  type FirstAnswer,
  type Status,
} from '@jadplus/shared';
import type { Context } from 'hono';
import { auditStatement, type AuditAction } from '../audit.js';
import { newId } from '../crypto.js';
import type { AppEnv } from '../env.js';
import { versionGuard } from './concurrency.js';
import type { FlowRow } from './flow.js';
import { eventStatement } from './store.js';

type Ctx = Context<AppEnv>;

export interface Change {
  readonly to: Status;
  readonly closeReason?: CloseReason | null;
  /** The partner queue's next deadline after the change (null = none). */
  readonly nextDue?: { readonly at: number; readonly kind: string } | null;
  readonly audit: AuditAction;
  readonly detail?: Readonly<Record<string, string | number | boolean | null>>;
}

/** Statements that move the request and record who did it. */
export function changeStatements(c: Ctx, row: FlowRow, change: Change): D1PreparedStatement[] {
  const db = c.env.DB;
  const actor = c.get('auth');
  const now = c.get('now');
  const due = change.nextDue === undefined ? null : change.nextDue;
  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        `UPDATE requests SET status = ?, close_reason = ?, next_due_at = ?, next_due_kind = ?, updated_at = ?,
           status_changed_at = CASE WHEN status = ? THEN status_changed_at ELSE ? END, ${versionGuard}
         WHERE id = ?`,
      )
      .bind(
        change.to,
        change.closeReason ?? null,
        due?.at ?? null,
        due?.kind ?? null,
        now,
        change.to,
        now,
        row.version,
        row.id,
      ),
  ];
  if (change.to !== row.status) {
    statements.push(
      eventStatement(db, {
        requestId: row.id,
        at: now,
        actorUserId: actor.userId,
        actorRole: actor.role,
        kind: 'status_changed',
        fromStatus: row.status,
        toStatus: change.to,
      }),
    );
  }
  statements.push(
    auditStatement(db, {
      at: now,
      actorUserId: actor.userId,
      actorRole: actor.role,
      action: change.audit,
      targetType: 'request',
      targetId: row.id,
      ipHash: c.get('ipHash'),
      httpRequestId: c.get('requestId'),
      ...(change.detail === undefined ? {} : { detail: change.detail }),
    }),
  );
  return statements;
}

/**
 * S4/S5: the provider's first answer to a routine request (a visit or a quote), measured once against the
 * service's first deadline when that answer meets it (firstResponseMetric; ADR 0030).
 */
export function firstResponseStatement(
  c: Ctx,
  row: FlowRow,
  answer: FirstAnswer,
): D1PreparedStatement | null {
  const metric = firstResponseMetric(row.next_due_kind, answer);
  if (metric === null || row.next_due_at === null || row.partner_id === null) return null;
  const now = c.get('now');
  const met = slaMet(row.next_due_at, now);
  return c.env.DB.prepare(
    `INSERT OR IGNORE INTO sla_outcomes (id, request_id, partner_id, metric, due_at, met_at, outcome, recorded_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    newId(),
    row.id,
    row.partner_id,
    metric,
    row.next_due_at,
    met ? now : null,
    met ? 'met' : 'missed',
    now,
  );
}
