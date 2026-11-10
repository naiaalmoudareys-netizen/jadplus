/**
 * JAD+ staff accounts (ADR 0025; C-AZ-1, C-SES-1, C-AUD-1). jad_admin only.
 *
 * - GET  /staff                  everyone holding jad_admin or jad_viewer now
 * - POST /staff                  { name, email, role } adds a person (created if new) with that role
 * - POST /staff/:userId/remove   revokes their staff role(s) and ends all their sessions. Nobody removes their
 *                                own role, and there is always at least one jad_admin left.
 */
import { adminAddStaffBody, adminReasonBody, staffRemovalProblem } from '@jadplus/shared';
import type { Hono } from 'hono';
import { z } from 'zod';
import { requireRole } from '../../auth/middleware.js';
import { revokeAllStatement } from '../../auth/sessions.js';
import { blindIndex, encryptField, newId } from '../../crypto.js';
import type { AppEnv } from '../../env.js';
import { ApiError } from '../../errors.js';
import { parseJsonBody, parseParams } from '../../validate.js';
import { NOT_FOUND, personFields, reasonStatement, staffAudit, type Ctx } from './common.js';

const LAST_ADMIN = 'JAD+ needs at least one administrator.';
const userParam = z.strictObject({ userId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/) });

/** Live staff grants, admins counted only while their account is active. */
const LIVE_ADMINS = `SELECT count(*) FROM user_roles g JOIN users u ON u.id = g.user_id
  WHERE g.role = 'jad_admin' AND g.revoked_at IS NULL AND u.status = 'active'`;

async function list(c: Ctx) {
  const { results } = await c.env.DB.prepare(
    `SELECT u.id, u.name_enc, u.email_enc, u.phone_enc, u.status, g.role, g.granted_at
     FROM user_roles g JOIN users u ON u.id = g.user_id
     WHERE g.role IN ('jad_admin', 'jad_viewer') AND g.revoked_at IS NULL ORDER BY g.granted_at`,
  ).all<{
    id: string;
    name_enc: unknown;
    email_enc: unknown;
    phone_enc: unknown;
    status: 'active' | 'frozen' | 'closed';
    role: 'jad_admin' | 'jad_viewer';
    granted_at: number;
  }>();
  const staff = await Promise.all(
    results.map(async (s) => {
      const p = await personFields(c, s);
      return {
        userId: s.id,
        name: p.name,
        email: p.email,
        role: s.role,
        grantedAt: s.granted_at,
        status: s.status,
      };
    }),
  );
  await c.env.DB.batch([
    staffAudit(c, 'staff_list_viewed', { type: 'staff', id: 'all' }, { count: staff.length }),
  ]);
  return c.json({ staff });
}

async function add(c: Ctx) {
  const body = await parseJsonBody(c, adminAddStaffBody);
  const db = c.env.DB;
  const keys = c.get('keys');
  const now = c.get('now');
  const hash = await blindIndex(keys, 'email', body.email);
  const found = await db
    .prepare(
      `SELECT u.id, u.status,
         EXISTS (SELECT 1 FROM user_roles g WHERE g.user_id = u.id AND g.revoked_at IS NULL
                 AND g.role IN ('jad_admin', 'jad_viewer')) AS staff
       FROM users u WHERE u.email_hash = ?`,
    )
    .bind(hash)
    .first<{ id: string; status: string; staff: number }>();
  if (found !== null && found.status !== 'active') {
    throw new ApiError(409, 'This account is frozen or closed.');
  }
  if (found?.staff === 1) throw new ApiError(409, 'This person is already JAD+ staff.');
  const userId = found?.id ?? newId();
  const create =
    found === null
      ? [
          db
            .prepare(
              `INSERT INTO users (id, email_hash, email_enc, name_enc, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?)`,
            )
            .bind(
              userId,
              hash,
              await encryptField(keys, body.email, `users.email:${userId}`),
              await encryptField(keys, body.name, `users.name:${userId}`),
              now,
              now,
            ),
        ]
      : [];
  await db.batch([
    ...create,
    db
      .prepare(
        `INSERT INTO user_roles (id, user_id, role, partner_id, granted_at, granted_by)
         VALUES (?, ?, ?, NULL, ?, ?)`,
      )
      .bind(newId(), userId, body.role, now, c.get('auth').userId),
    staffAudit(
      c,
      'staff_added',
      { type: 'user', id: userId },
      { role: body.role, newPerson: found === null },
    ),
  ]);
  return c.json({ userId, role: body.role }, 201);
}

async function remove(c: Ctx) {
  const { userId } = parseParams(c, userParam);
  const body = await parseJsonBody(c, adminReasonBody);
  const db = c.env.DB;
  const now = c.get('now');
  const target = await db
    .prepare(
      `SELECT
         (SELECT count(*) FROM user_roles WHERE user_id = ?1 AND revoked_at IS NULL
            AND role IN ('jad_admin', 'jad_viewer')) AS staff_roles,
         (SELECT count(*) FROM user_roles WHERE user_id = ?1 AND revoked_at IS NULL AND role = 'jad_admin') AS admin,
         (${LIVE_ADMINS}) AS live_admins`,
    )
    .bind(userId)
    .first<{ staff_roles: number; admin: number; live_admins: number }>();
  if (target === null || target.staff_roles === 0) throw new ApiError(404, NOT_FOUND);
  const problem = staffRemovalProblem({
    actorUserId: c.get('auth').userId,
    targetUserId: userId,
    targetIsAdmin: target.admin > 0,
    liveAdmins: target.live_admins,
  });
  if (problem === 'self') throw new ApiError(409, 'You cannot remove your own staff access.');
  if (problem === 'last_admin') throw new ApiError(409, LAST_ADMIN);
  const sessions = await db
    .prepare('SELECT count(*) AS n FROM sessions WHERE user_id = ? AND revoked_at IS NULL')
    .bind(userId)
    .first<{ n: number }>();
  try {
    await db.batch([
      // Checked again inside the batch, so two removals at the same moment cannot leave JAD+ without an
      // administrator: removing the last one writes a revoked_at before granted_at, which the table's CHECK
      // refuses, and the whole batch (sessions, reason, audit) is rolled back.
      db
        .prepare(
          `UPDATE user_roles SET revoked_at = CASE
             WHEN role <> 'jad_admin' OR (${LIVE_ADMINS}) > 1 THEN ?1 ELSE granted_at - 1 END
           WHERE user_id = ?2 AND revoked_at IS NULL AND role IN ('jad_admin', 'jad_viewer')`,
        )
        .bind(now, userId),
      revokeAllStatement(db, userId, 'role_revoked', now),
      await reasonStatement(c, { type: 'user', id: userId }, 'staff_removed', body.reason),
      staffAudit(c, 'staff_removed', { type: 'user', id: userId }),
    ]);
  } catch (err) {
    if (err instanceof Error && /CHECK constraint failed/i.test(err.message)) {
      throw new ApiError(409, LAST_ADMIN);
    }
    throw err;
  }
  return c.json({ userId, sessionsEnded: sessions?.n ?? 0 });
}

export function staffRoutes(r: Hono<AppEnv>): void {
  r.get('/staff', requireRole('jad_admin'), list);
  r.post('/staff', requireRole('jad_admin'), add);
  r.post('/staff/:userId/remove', requireRole('jad_admin'), remove);
}
