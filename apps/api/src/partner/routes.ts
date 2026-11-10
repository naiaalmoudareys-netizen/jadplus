/**
 * Partner view, phase A (BUILD_SPEC R3, E4, E17): the job queue with clocks and next action due, and
 * acknowledging an emergency by naming the technician and the arrival window.
 * Roles: partner (technician) and partner_admin (office). A partner sees only jobs assigned to it (C-AZ-2).
 */
import {
  EMERGENCY_ACK_MINUTES,
  EMERGENCY_ON_SITE_MINUTES,
  OPEN_STATUSES,
  acknowledgeEmergencyBody,
  arrivalWindowAllowed,
  canActOnRequest,
  canTransition,
  dubaiDate,
  requestIdParam,
  slaMet,
} from '@jadplus/shared';
import { Hono } from 'hono';
import { auditStatement } from '../audit.js';
import { requireRole } from '../auth/middleware.js';
import { decryptField, newId, toBytes } from '../crypto.js';
import type { AppEnv } from '../env.js';
import { ApiError } from '../errors.js';
import { eventStatement, notificationStatement, requestFacts } from '../requests/store.js';
import { parseJsonBody, parseParams } from '../validate.js';
import { versionGuard, withConflictCheck } from '../requests/concurrency.js';

const MIN = 60_000;

interface QueueRow {
  id: string;
  ref: string;
  is_emergency: number;
  emergency_type: string | null;
  status: string;
  description: string;
  next_due_at: number | null;
  next_due_kind: string | null;
  technician_id: string | null;
  arrival_window_start: number | null;
  arrival_window_end: number | null;
  created_at: number;
}

interface JobRow {
  id: string;
  status: 'assigned' | 'scheduled';
  is_emergency: number;
  acknowledged_at: number | null;
  partner_id: string | null;
  owner_user_id: string;
  tenancy_id: string | null;
  raised_by_user_id: string;
  created_at: number;
  version: number;
}

export function partnerRoutes(): Hono<AppEnv> {
  const partner = new Hono<AppEnv>();
  partner.use('*', requireRole('partner', 'partner_admin'));

  // R3: open jobs, emergencies first, then by the next deadline. No owner or tenant contact details.
  partner.get('/jobs', async (c) => {
    const { partnerId } = c.get('auth');
    const open = [...OPEN_STATUSES];
    const { results } = await c.env.DB.prepare(
      `SELECT id, ref, is_emergency, emergency_type, status, description, next_due_at, next_due_kind,
              technician_id, arrival_window_start, arrival_window_end, created_at
       FROM requests WHERE partner_id = ? AND status IN (${open.map(() => '?').join(', ')})
       ORDER BY is_emergency DESC, next_due_at IS NULL, next_due_at, created_at`,
    )
      .bind(partnerId, ...open)
      .all<QueueRow>();
    return c.json({
      jobs: results.map((r) => ({
        id: r.id,
        ref: r.ref,
        emergency: r.is_emergency === 1,
        emergencyType: r.emergency_type,
        status: r.status,
        description: r.description,
        nextDueAt: r.next_due_at,
        nextDueKind: r.next_due_kind,
        technicianId: r.technician_id,
        arrivalWindow:
          r.arrival_window_start === null
            ? null
            : { start: r.arrival_window_start, end: r.arrival_window_end },
        createdAt: r.created_at,
      })),
    });
  });

  // E4/E17: the partner's active technicians, to choose who attends. Names only, and only of this partner's
  // own team; "self" marks the signed-in technician so the app can preselect them.
  partner.get('/team', async (c) => {
    const { partnerId, userId } = c.get('auth');
    const db = c.env.DB;
    const company = await db
      .prepare('SELECT id, name, status FROM partners WHERE id = ?')
      .bind(partnerId)
      .first<{ id: string; name: string; status: string }>();
    const { results } = await db
      .prepare(
        `SELECT t.id, t.user_id, u.name_enc FROM technicians t JOIN users u ON u.id = t.user_id
         WHERE t.partner_id = ? AND t.status = 'active' AND u.status = 'active' ORDER BY t.created_at`,
      )
      .bind(partnerId)
      .all<{ id: string; user_id: string; name_enc: unknown }>();
    const keys = c.get('keys');
    const technicians = await Promise.all(
      results.map(async (t) => ({
        id: t.id,
        name:
          t.name_enc === null
            ? 'Team member'
            : await decryptField(keys, toBytes(t.name_enc), `users.name:${t.user_id}`),
        self: t.user_id === userId,
      })),
    );
    return c.json({ partner: company, technicians });
  });

  // E4: acknowledge within 15 minutes, naming the technician and the arrival window.
  partner.post('/jobs/:id/acknowledge', async (c) => {
    const { id } = parseParams(c, requestIdParam);
    const body = await parseJsonBody(c, acknowledgeEmergencyBody);
    const actor = c.get('auth');
    const db = c.env.DB;
    const now = c.get('now');

    const job = await db
      .prepare(
        `SELECT id, status, is_emergency, acknowledged_at, partner_id, owner_user_id, tenancy_id,
                raised_by_user_id, created_at, version FROM requests WHERE id = ?`,
      )
      .bind(id)
      .first<JobRow>();
    if (job === null || !canActOnRequest(actor, await requestFacts(db, job), dubaiDate(now))) {
      throw new ApiError(404, 'Not found.');
    }
    if (
      job.is_emergency !== 1 ||
      job.acknowledged_at !== null ||
      !canTransition('partner', job.status, 'scheduled')
    ) {
      throw new ApiError(409, 'This job is not an emergency waiting for acknowledgement.');
    }
    // E17: only an active technician of this partner can be sent.
    const tech = await db
      .prepare("SELECT id FROM technicians WHERE id = ? AND partner_id = ? AND status = 'active'")
      .bind(body.technicianId, actor.partnerId)
      .first<{ id: string }>();
    if (tech === null) throw new ApiError(400, 'Choose an active technician from your team.');
    const { arrivalWindowStart: start, arrivalWindowEnd: end } = body;
    if (!arrivalWindowAllowed(start, end, now)) {
      throw new ApiError(400, 'Give an arrival window of up to 4 hours, starting within the next 24 hours.');
    }

    // The acknowledgement clock starts when this partner received the job (the backup's starts at the move).
    const assigned = await db
      .prepare(
        "SELECT MAX(at) AS at FROM request_events WHERE request_id = ? AND kind = 'assigned' AND partner_id = ?",
      )
      .bind(id, actor.partnerId)
      .first<{ at: number | null }>();
    const ackDue = (assigned?.at ?? job.created_at) + EMERGENCY_ACK_MINUTES * MIN;
    const met = slaMet(ackDue, now);

    await withConflictCheck(() =>
      db.batch([
        db
          .prepare(
            `UPDATE requests SET status = 'scheduled', acknowledged_at = ?, technician_id = ?,
               arrival_window_start = ?, arrival_window_end = ?, next_due_at = ?, next_due_kind = 'emergency_on_site',
               updated_at = ?, status_changed_at = ?, ${versionGuard} WHERE id = ?`,
          )
          .bind(
            now,
            tech.id,
            start,
            end,
            job.created_at + EMERGENCY_ON_SITE_MINUTES * MIN,
            now,
            now,
            job.version,
            id,
          ),
        db
          .prepare(
            `INSERT INTO sla_outcomes (id, request_id, partner_id, metric, due_at, met_at, outcome, recorded_at)
             VALUES (?, ?, ?, 'emergency_ack', ?, ?, ?, ?)`,
          )
          .bind(newId(), id, actor.partnerId, ackDue, met ? now : null, met ? 'met' : 'missed', now),
        eventStatement(db, {
          requestId: id,
          at: now,
          actorUserId: actor.userId,
          actorRole: actor.role,
          kind: 'acknowledged',
          partnerId: actor.partnerId,
          data: { technicianId: tech.id, windowStart: start, windowEnd: end },
        }),
        eventStatement(db, {
          requestId: id,
          at: now,
          actorUserId: actor.userId,
          actorRole: actor.role,
          kind: 'status_changed',
          fromStatus: job.status,
          toStatus: 'scheduled',
        }),
        // E4: the resident sees the technician's name and the arrival window.
        notificationStatement(db, {
          requestId: id,
          at: now,
          to: { kind: 'user', userId: job.raised_by_user_id },
          template: 'emergency_acknowledged',
          urgent: false,
        }),
        auditStatement(db, {
          at: now,
          actorUserId: actor.userId,
          actorRole: actor.role,
          action: 'emergency_acknowledged',
          targetType: 'request',
          targetId: id,
          ipHash: c.get('ipHash'),
          httpRequestId: c.get('requestId'),
          detail: { onTime: met },
        }),
      ]),
    );
    return c.json({ id, status: 'scheduled', acknowledgedAt: now, onTime: met });
  });

  return partner;
}
