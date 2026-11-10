/**
 * Emergency escalation sweep, run every minute by the Worker's cron trigger (BUILD_SPEC E5, E6, E7, S6).
 * For each emergency nobody has acknowledged, it applies the next step decided by
 * packages/shared/src/escalation.ts: remind the primary, move to the backup (and alert on-call), or hand
 * over to on-call (and inform building FM and the owner). A missed acknowledgement is recorded on the
 * partner's scorecard. Each step is one atomic batch guarded by the request version, so a partner
 * acknowledging at the same moment wins cleanly and the step is skipped.
 */
import {
  EMERGENCY_ACK_MINUTES,
  nextEscalation,
  stageAfter,
  type EscalationAction,
  type EscalationStage,
} from '@jadplus/shared';
import { auditStatement } from '../audit.js';
import { newId } from '../crypto.js';
import type { Logger } from '../logger.js';
import { isVersionConflict, versionGuard } from '../requests/concurrency.js';
import { eventStatement, notificationStatement, servicePartners } from '../requests/store.js';

const MIN = 60_000;

interface OpenEmergency {
  id: string;
  service_code: string;
  partner_id: string;
  owner_user_id: string;
  created_at: number;
  escalation: EscalationStage;
  version: number;
  assigned_at: number | null;
}

export interface SweepResult {
  readonly checked: number;
  readonly actions: Readonly<Record<EscalationAction, number>>;
  readonly conflicts: number;
}

function missedAckStatement(db: D1Database, requestId: string, partnerId: string, due: number, now: number) {
  // OR IGNORE: one outcome per partner and metric; a repeat sweep never double-counts (S5 "real data only").
  return db
    .prepare(
      `INSERT OR IGNORE INTO sla_outcomes (id, request_id, partner_id, metric, due_at, outcome, recorded_at)
       VALUES (?, ?, ?, 'emergency_ack', ?, 'missed', ?)`,
    )
    .bind(newId(), requestId, partnerId, due, now);
}

export async function runEscalationSweep(db: D1Database, now: number, log: Logger): Promise<SweepResult> {
  const { results } = await db
    .prepare(
      `SELECT r.id, r.service_code, r.partner_id, r.owner_user_id, r.created_at, r.escalation, r.version,
              (SELECT MAX(e.at) FROM request_events e
                WHERE e.request_id = r.id AND e.kind = 'assigned' AND e.partner_id = r.partner_id) AS assigned_at
       FROM requests r
       WHERE r.is_emergency = 1 AND r.status = 'assigned' AND r.acknowledged_at IS NULL
         AND r.partner_id IS NOT NULL AND r.escalation <> 'on_call'`,
    )
    .all<OpenEmergency>();

  const actions: Record<EscalationAction, number> = { remind_primary: 0, move_to_backup: 0, call_on_call: 0 };
  let conflicts = 0;

  for (const r of results) {
    const assignedAt = r.assigned_at ?? r.created_at;
    const { backup } = await servicePartners(db, r.service_code);
    const backupAvailable = backup !== null && backup.status === 'active' && backup.id !== r.partner_id;
    const action = nextEscalation(
      {
        raisedAt: r.created_at,
        stage: r.escalation,
        movedToBackupAt: r.escalation === 'moved_to_backup' ? assignedAt : null,
        acknowledged: false,
        backupAvailable,
      },
      now,
    );
    if (action === null) continue;

    const ackDue = assignedAt + EMERGENCY_ACK_MINUTES * MIN;
    const sys = { requestId: r.id, at: now, actorUserId: null, actorRole: 'system' as const };
    const stage = stageAfter(action);
    const statements: D1PreparedStatement[] = [
      eventStatement(db, {
        ...sys,
        kind: action === 'remind_primary' ? 'reminder_sent' : 'escalated',
        partnerId: r.partner_id,
        data: { action },
      }),
      auditStatement(db, {
        at: now,
        actorUserId: null,
        actorRole: 'system',
        action: 'emergency_escalated',
        targetType: 'request',
        targetId: r.id,
        ipHash: null,
        httpRequestId: null,
        detail: { action },
      }),
    ];

    if (action === 'remind_primary') {
      statements.unshift(
        db
          .prepare(`UPDATE requests SET escalation = ?, updated_at = ?, ${versionGuard} WHERE id = ?`)
          .bind(stage, now, r.version, r.id),
      );
      statements.push(
        notificationStatement(db, {
          ...sys,
          to: { kind: 'partner', partnerId: r.partner_id },
          template: 'emergency_reminder',
          urgent: true,
        }),
      );
    } else if (action === 'move_to_backup' && backup !== null) {
      // nextEscalation only chooses move_to_backup when an active backup exists, so backup is set here.
      // The status stays 'assigned' (lifecycle.ts: system may reassign assigned → assigned, E6).
      statements.unshift(
        db
          .prepare(
            `UPDATE requests SET partner_id = ?, technician_id = NULL, escalation = ?, next_due_at = ?,
               next_due_kind = 'emergency_ack', updated_at = ?, ${versionGuard} WHERE id = ?`,
          )
          .bind(backup.id, stage, now + EMERGENCY_ACK_MINUTES * MIN, now, r.version, r.id),
      );
      statements.push(
        eventStatement(db, { ...sys, kind: 'assigned', partnerId: backup.id }),
        missedAckStatement(db, r.id, r.partner_id, ackDue, now),
        notificationStatement(db, {
          ...sys,
          to: { kind: 'partner', partnerId: backup.id },
          template: 'emergency_new_job',
          urgent: true,
        }),
        notificationStatement(db, {
          ...sys,
          to: { kind: 'on_call' },
          template: 'emergency_backup_alert',
          urgent: true,
        }),
      );
    } else {
      statements.unshift(
        db
          .prepare(`UPDATE requests SET escalation = ?, updated_at = ?, ${versionGuard} WHERE id = ?`)
          .bind('on_call', now, r.version, r.id),
      );
      statements.push(
        missedAckStatement(db, r.id, r.partner_id, ackDue, now),
        notificationStatement(db, {
          ...sys,
          to: { kind: 'on_call' },
          template: 'emergency_on_call',
          urgent: true,
        }),
        notificationStatement(db, {
          ...sys,
          to: { kind: 'building_fm' },
          template: 'emergency_on_call',
          urgent: true,
        }),
        notificationStatement(db, {
          ...sys,
          to: { kind: 'user', userId: r.owner_user_id },
          template: 'emergency_owner_update',
          urgent: false,
        }),
      );
    }

    try {
      await db.batch(statements);
      actions[action] += 1;
    } catch (err) {
      if (!isVersionConflict(err)) throw err;
      conflicts += 1;
    }
  }

  const result = { checked: results.length, actions, conflicts };
  log.log('info', 'Emergency escalation sweep', { ...result.actions, checked: result.checked, conflicts });
  return result;
}
