/**
 * Audit trail (docs/SECURITY.md C-AUD-1). Each entry is a prepared statement that the caller puts in the
 * same D1 batch as the change it records, so a change is never saved without its audit entry (or vice versa).
 * The table itself is append-only (migration 0002). `detail` must never hold personal data.
 */
import type { UserRole } from '@jadplus/shared';

export type AuditActorRole = UserRole | 'system' | 'anonymous';

/** Every action written to the audit log. Adding one here is a reviewed change. */
export const AUDIT_ACTIONS = [
  'sign_in_code_sent',
  'sign_in_code_rejected',
  'sign_in_locked_out',
  'sign_in',
  'sign_out',
  'sign_out_everywhere',
  'session_role_switched',
  'owner_linked',
  'owner_access_removed',
  'emergency_raised',
  'request_raised',
  'emergency_acknowledged',
  'emergency_escalated',
  'job_reassigned',
  'partner_suspended',
  'partner_reinstated',
  'partner_flagged',
  'partner_review_resolved',
  'on_call_rota_set',
  'notification_failed',
  'offer_interest',
  'desk_request_created',
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export interface AuditEntry {
  readonly at: number;
  readonly actorUserId: string | null;
  readonly actorRole: AuditActorRole;
  readonly action: AuditAction;
  readonly targetType?: string;
  readonly targetId?: string;
  readonly ipHash: Uint8Array | null;
  readonly httpRequestId: string | null;
  readonly detail?: Readonly<Record<string, string | number | boolean | null>>;
}

export function auditStatement(db: D1Database, e: AuditEntry): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO audit_log (at, actor_user_id, actor_role, action, target_type, target_id, ip_hash, http_request_id, detail)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      e.at,
      e.actorUserId,
      e.actorRole,
      e.action,
      e.targetType ?? null,
      e.targetId ?? null,
      e.ipHash,
      e.httpRequestId,
      e.detail === undefined ? null : JSON.stringify(e.detail),
    );
}
