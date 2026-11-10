/**
 * The partner office (ADR 0023; R3, E17, C-AZ-2), role partner_admin, for its own company only:
 *
 * - POST /api/partner/team                    add a technician (name + email or mobile); they sign in with a code
 * - POST /api/partner/team/:id/remove         remove a technician at once, with the reason (E17): they can no
 *                                             longer be sent to jobs
 * - POST /api/partner/jobs/:id/technician     choose (or change) who goes to an open job
 *
 * The team list is GET /api/partner/team; jobs GET /api/partner/jobs; numbers GET /api/partner/stats.
 */
import {
  OPEN_STATUSES,
  addTechnicianBody,
  assignTechnicianBody,
  identifierOf,
  removeTechnicianBody,
  requestIdParam,
  type Status,
} from '@jadplus/shared';
import type { Context } from 'hono';
import { Hono } from 'hono';
import { z } from 'zod';
import { auditStatement, type AuditAction } from '../audit.js';
import { requireRole } from '../auth/middleware.js';
import { blindIndex, encryptField, newId } from '../crypto.js';
import type { AppEnv } from '../env.js';
import { ApiError } from '../errors.js';
import { partnerInboxStatement } from '../requests/inbox.js';
import { parseJsonBody, parseParams } from '../validate.js';

type Ctx = Context<AppEnv>;

const techParam = z.strictObject({ id: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/) });

function audit(c: Ctx, action: AuditAction, targetType: string, targetId: string): D1PreparedStatement {
  const a = c.get('auth');
  return auditStatement(c.env.DB, {
    at: c.get('now'),
    actorUserId: a.userId,
    actorRole: a.role,
    action,
    targetType,
    targetId,
    ipHash: c.get('ipHash'),
    httpRequestId: c.get('requestId'),
  });
}

/** This company's active technician, or 400. */
async function activeTechnician(c: Ctx, technicianId: string): Promise<string> {
  const tech = await c.env.DB.prepare(
    "SELECT id FROM technicians WHERE id = ? AND partner_id = ? AND status = 'active'",
  )
    .bind(technicianId, c.get('auth').partnerId)
    .first<{ id: string }>();
  if (tech === null) throw new ApiError(400, 'Choose an active technician from your team.');
  return tech.id;
}

export function partnerOfficeRoutes(): Hono<AppEnv> {
  const r = new Hono<AppEnv>();
  // Per route, not r.use('*'): a '*' middleware here would also apply to the technicians' /api/partner routes.
  const office = requireRole('partner_admin');

  r.post('/team', office, async (c) => {
    const body = await parseJsonBody(c, addTechnicianBody);
    const db = c.env.DB;
    const keys = c.get('keys');
    const now = c.get('now');
    const partnerId = c.get('auth').partnerId;
    const who = identifierOf(body);
    const column = who.kind === 'email' ? 'email' : 'phone';
    const hash = await blindIndex(keys, who.kind, who.value);
    const found = await db
      .prepare(`SELECT id, status FROM users WHERE ${column}_hash = ?`)
      .bind(hash)
      .first<{ id: string; status: string }>();
    if (found !== null && found.status !== 'active') {
      throw new ApiError(409, 'This person cannot be added. Contact JAD+ Admin.');
    }
    const userId = found?.id ?? newId();
    const already = await db
      .prepare('SELECT id, status FROM technicians WHERE partner_id = ? AND user_id = ?')
      .bind(partnerId, userId)
      .first<{ id: string; status: string }>();
    if (already !== null) throw new ApiError(409, 'This person is already on your team.');
    const techId = newId();
    await db.batch([
      ...(found === null
        ? [
            db
              .prepare(
                `INSERT INTO users (id, ${column}_hash, ${column}_enc, name_enc, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?)`,
              )
              .bind(
                userId,
                hash,
                await encryptField(keys, who.value, `users.${column}:${userId}`),
                await encryptField(keys, body.name, `users.name:${userId}`),
                now,
                now,
              ),
          ]
        : []),
      db
        .prepare(
          `INSERT OR IGNORE INTO user_roles (id, user_id, role, partner_id, granted_at, granted_by)
           VALUES (?, ?, 'partner', ?, ?, ?)`,
        )
        .bind(newId(), userId, partnerId, now, c.get('auth').userId),
      db
        .prepare('INSERT INTO technicians (id, partner_id, user_id, created_at) VALUES (?, ?, ?, ?)')
        .bind(techId, partnerId, userId, now),
      audit(c, 'technician_added', 'technician', techId),
    ]);
    return c.json({ id: techId }, 201);
  });

  r.post('/team/:id/remove', office, async (c) => {
    const { id } = parseParams(c, techParam);
    const body = await parseJsonBody(c, removeTechnicianBody);
    const db = c.env.DB;
    const now = c.get('now');
    const tech = await db
      .prepare("SELECT user_id FROM technicians WHERE id = ? AND partner_id = ? AND status = 'active'")
      .bind(id, c.get('auth').partnerId)
      .first<{ user_id: string }>();
    if (tech === null) throw new ApiError(404, 'Not found.');
    await db.batch([
      db
        .prepare("UPDATE technicians SET status = 'removed', removed_reason = ?, removed_at = ? WHERE id = ?")
        .bind(body.reason, now, id),
      // E17: off JAD+ jobs at once: their partner role for this company ends and their sessions with it.
      db
        .prepare(
          "UPDATE user_roles SET revoked_at = ? WHERE user_id = ? AND role = 'partner' AND partner_id = ? AND revoked_at IS NULL",
        )
        .bind(now, tech.user_id, c.get('auth').partnerId),
      db
        .prepare(
          "UPDATE sessions SET revoked_at = ?, revoked_reason = 'role_revoked' WHERE user_id = ? AND role = 'partner' AND partner_id = ? AND revoked_at IS NULL",
        )
        .bind(now, tech.user_id, c.get('auth').partnerId),
      audit(c, 'technician_removed', 'technician', id),
    ]);
    return c.json({ id, status: 'removed' });
  });

  r.post('/jobs/:id/technician', office, async (c) => {
    const { id } = parseParams(c, requestIdParam);
    const body = await parseJsonBody(c, assignTechnicianBody);
    const db = c.env.DB;
    const job = await db
      .prepare('SELECT status FROM requests WHERE id = ? AND partner_id = ?')
      .bind(id, c.get('auth').partnerId)
      .first<{ status: Status }>();
    if (job === null || !OPEN_STATUSES.has(job.status)) throw new ApiError(404, 'Not found.');
    const techId = await activeTechnician(c, body.technicianId);
    await db.batch([
      db
        .prepare('UPDATE requests SET technician_id = ?, updated_at = ? WHERE id = ?')
        .bind(techId, c.get('now'), id),
      db
        .prepare(
          "UPDATE visits SET technician_id = ? WHERE request_id = ? AND status IN ('booked', 'on_the_way')",
        )
        .bind(techId, id),
      audit(c, 'technician_assigned', 'request', id),
      // ADR 0024: the chosen technician is told (read after the update above, so it is the new one).
      partnerInboxStatement(
        db,
        { requestId: id, partnerId: c.get('auth').partnerId ?? '' },
        'job_assigned_to_you',
        c.get('now'),
      ),
    ]);
    return c.json({ id, technicianId: techId });
  });

  return r;
}
