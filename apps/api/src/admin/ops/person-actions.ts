/**
 * JAD+ Admin acting on a person's account or tenancy (ADR 0025; U4, U5, U9, C-SES-1, C-AUD-1). jad_admin only.
 *
 * - POST /people/:id/sign-out-everywhere   ends every live session of the person
 * - POST /people/:id/freeze    { reason }  U9: the account can still read, but not change anything
 * - POST /people/:id/unfreeze  { reason }
 * - POST /tenancies/:id/extend { endsOn }  for the owner (same rules as the owner's own extension, U5)
 * - POST /tenancies/:id/end    { reason }  for the owner; tenant and owner are told
 *
 * Reasons are kept encrypted in admin_reasons (staff text can name people); the audit entry holds no text.
 */
import { adminReasonBody, dubaiDate, extendTenancyBody, extensionAllowed } from '@jadplus/shared';
import type { Hono } from 'hono';
import { requireRole } from '../../auth/middleware.js';
import { revokeAllStatement } from '../../auth/sessions.js';
import type { AppEnv } from '../../env.js';
import { ApiError } from '../../errors.js';
import { tenancyInboxStatement } from '../../requests/inbox.js';
import { parseJsonBody, parseParams } from '../../validate.js';
import { NOT_FOUND, idParam, reasonStatement, staffAudit, type Ctx } from './common.js';

type UserStatus = 'active' | 'frozen' | 'closed';

async function userStatus(c: Ctx, id: string): Promise<UserStatus> {
  const row = await c.env.DB.prepare('SELECT status FROM users WHERE id = ?')
    .bind(id)
    .first<{ status: UserStatus }>();
  if (row === null) throw new ApiError(404, NOT_FOUND);
  return row.status;
}

async function liveSessions(c: Ctx, id: string): Promise<number> {
  const now = c.get('now');
  const row = await c.env.DB.prepare(
    `SELECT count(*) AS n FROM sessions
     WHERE user_id = ? AND revoked_at IS NULL AND idle_expires_at > ? AND absolute_expires_at > ?`,
  )
    .bind(id, now, now)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

async function signOutEverywhere(c: Ctx) {
  const { id } = parseParams(c, idParam);
  const status = await userStatus(c, id);
  const ended = await liveSessions(c, id);
  await c.env.DB.batch([
    revokeAllStatement(c.env.DB, id, 'admin', c.get('now')),
    staffAudit(c, 'person_signed_out_by_jad', { type: 'user', id }, { sessions: ended }),
  ]);
  return c.json({ id, status, sessionsEnded: ended });
}

function setFrozen(freeze: boolean) {
  return async (c: Ctx) => {
    const { id } = parseParams(c, idParam);
    const body = await parseJsonBody(c, adminReasonBody);
    if (id === c.get('auth').userId) throw new ApiError(409, 'You cannot change your own account.');
    const status = await userStatus(c, id);
    const from: UserStatus = freeze ? 'active' : 'frozen';
    const to: UserStatus = freeze ? 'frozen' : 'active';
    if (status !== from) {
      throw new ApiError(409, freeze ? 'This account is not active.' : 'This account is not frozen.');
    }
    const action = freeze ? 'account_frozen' : 'account_unfrozen';
    await c.env.DB.batch([
      c.env.DB.prepare('UPDATE users SET status = ?, updated_at = ? WHERE id = ? AND status = ?').bind(
        to,
        c.get('now'),
        id,
        from,
      ),
      await reasonStatement(c, { type: 'user', id }, action, body.reason),
      staffAudit(c, action, { type: 'user', id }),
    ]);
    return c.json({ id, status: to, sessionsEnded: 0 });
  };
}

interface TenancyRow {
  id: string;
  owner_user_id: string;
  tenant_user_id: string;
  ends_on: string;
  status: 'invited' | 'active' | 'ended' | 'revoked';
}

async function tenancy(c: Ctx, id: string): Promise<TenancyRow> {
  const row = await c.env.DB.prepare(
    'SELECT id, owner_user_id, tenant_user_id, ends_on, status FROM tenancies WHERE id = ?',
  )
    .bind(id)
    .first<TenancyRow>();
  if (row === null) throw new ApiError(404, NOT_FOUND);
  return row;
}

async function extend(c: Ctx) {
  const { id } = parseParams(c, idParam);
  const body = await parseJsonBody(c, extendTenancyBody);
  const t = await tenancy(c, id);
  if (t.status === 'revoked')
    throw new ApiError(409, 'This tenancy was ended. The owner invites the tenant again.');
  if (!extensionAllowed(t.ends_on, body.endsOn, dubaiDate(c.get('now')))) {
    throw new ApiError(400, 'Choose a later end date, within 3 years.');
  }
  // U5: a tenancy that ended on its date comes back (unless the unit has a new tenant: the unique index refuses).
  const status = t.status === 'ended' ? 'active' : t.status;
  try {
    await c.env.DB.batch([
      c.env.DB.prepare('UPDATE tenancies SET ends_on = ?, status = ?, ended_at = NULL WHERE id = ?').bind(
        body.endsOn,
        status,
        id,
      ),
      staffAudit(c, 'tenancy_extended_by_jad', { type: 'tenancy', id }, { endsOn: body.endsOn }),
    ]);
  } catch {
    throw new ApiError(409, 'This residence already has another tenant.');
  }
  return c.json({ id, status, endsOn: body.endsOn });
}

async function end(c: Ctx) {
  const { id } = parseParams(c, idParam);
  const body = await parseJsonBody(c, adminReasonBody);
  const t = await tenancy(c, id);
  if (t.status !== 'invited' && t.status !== 'active') {
    throw new ApiError(409, 'This tenancy has already ended.');
  }
  const db = c.env.DB;
  const now = c.get('now');
  const told = (userId: string) =>
    tenancyInboxStatement(db, { tenancyId: id, userId, kind: 'tenancy_ended', at: now });
  await db.batch([
    // As the owner's own "end": the table ties "no acceptance" to "invited", so a withdrawn invitation keeps
    // the withdrawal time there.
    db
      .prepare(
        "UPDATE tenancies SET status = 'revoked', ended_at = ?, accepted_at = COALESCE(accepted_at, ?) WHERE id = ?",
      )
      .bind(now, now, id),
    told(t.tenant_user_id),
    told(t.owner_user_id),
    await reasonStatement(c, { type: 'tenancy', id }, 'tenancy_ended', body.reason),
    staffAudit(c, 'tenancy_ended_by_jad', { type: 'tenancy', id }),
  ]);
  return c.json({ id, status: 'revoked', endsOn: t.ends_on });
}

export function personActionRoutes(r: Hono<AppEnv>): void {
  r.post('/people/:id/sign-out-everywhere', requireRole('jad_admin'), signOutEverywhere);
  r.post('/people/:id/freeze', requireRole('jad_admin'), setFrozen(true));
  r.post('/people/:id/unfreeze', requireRole('jad_admin'), setFrozen(false));
  r.post('/tenancies/:id/extend', requireRole('jad_admin'), extend);
  r.post('/tenancies/:id/end', requireRole('jad_admin'), end);
}
