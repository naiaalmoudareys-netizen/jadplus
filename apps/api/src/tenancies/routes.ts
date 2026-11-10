/**
 * Tenancies (ADR 0021; R2, O4, U4, U5, C-AZ-2, C-PD-1, C-PD-2).
 *
 * Owner (their own units only):
 * - GET  /api/owner/tenancies              their tenancies, with the tenant's name and masked contact
 * - POST /api/owner/tenancies              invite a tenant (name + email or mobile + dates) to one unit
 * - POST /api/owner/tenancies/:id/extend   a new end date (also brings back a tenancy that just ended, U5)
 * - POST /api/owner/tenancies/:id/end      end it now
 *
 * Tenant:
 * - GET  /api/tenant/tenancies             their invitations and tenancies, with where the unit is
 * - POST /api/tenant/tenancies/:id/accept  accept an invitation (recorded as evidence)
 *
 * A tenant signs in like everyone else, with a code to the email or mobile the owner gave. Contact details are
 * stored encrypted with a blind index (C-PD-2); the owner sees them masked. Access ends on the end date by
 * itself (isTenancyCurrent); the daily step in tenancy-clock.ts marks it ended and tells both.
 */
import {
  daysBetween,
  dubaiDate,
  extendTenancyBody,
  extensionAllowed,
  identifierOf,
  inviteTenantBody,
  isTenancyCurrent,
  maskContact,
  tenancyDatesAllowed,
  tenancyIdParam,
} from '@jadplus/shared';
import type { Context } from 'hono';
import { Hono } from 'hono';
import { auditStatement, type AuditAction } from '../audit.js';
import { requireRole } from '../auth/middleware.js';
import type { Deps } from '../context.js';
import { blindIndex, decryptField, encryptField, newId, toBytes } from '../crypto.js';
import type { AppEnv } from '../env.js';
import { ApiError } from '../errors.js';
import { ownsUnit } from '../owners/units.js';
import { tenancyInboxStatement } from '../requests/inbox.js';
import { parseJsonBody, parseParams } from '../validate.js';

type Ctx = Context<AppEnv>;

interface TenancyRow {
  id: string;
  sf_unit_id: string;
  owner_user_id: string;
  tenant_user_id: string;
  starts_on: string;
  ends_on: string;
  status: 'invited' | 'active' | 'ended' | 'revoked';
}

const COLUMNS = 'id, sf_unit_id, owner_user_id, tenant_user_id, starts_on, ends_on, status';

const facts = (t: TenancyRow) => ({
  tenantUserId: t.tenant_user_id,
  ownerUserId: t.owner_user_id,
  status: t.status,
  startsOn: t.starts_on,
  endsOn: t.ends_on,
});

function audit(c: Ctx, action: AuditAction, tenancyId: string): D1PreparedStatement {
  const a = c.get('auth');
  return auditStatement(c.env.DB, {
    at: c.get('now'),
    actorUserId: a.userId,
    actorRole: a.role,
    action,
    targetType: 'tenancy',
    targetId: tenancyId,
    ipHash: c.get('ipHash'),
    httpRequestId: c.get('requestId'),
  });
}

/** The owner's own tenancy, or "not found" (C-AZ-2). */
async function ownTenancy(c: Ctx, id: string, as: 'owner' | 'tenant'): Promise<TenancyRow> {
  const row = await c.env.DB.prepare(`SELECT ${COLUMNS} FROM tenancies WHERE id = ?`)
    .bind(id)
    .first<TenancyRow>();
  const me = c.get('auth').userId;
  if (row === null || (as === 'owner' ? row.owner_user_id : row.tenant_user_id) !== me) {
    throw new ApiError(404, 'Not found.');
  }
  return row;
}

/** The person with this email / mobile, created if new (name and contact encrypted, C-PD-2). */
async function tenantUser(c: Ctx, who: { kind: 'email' | 'phone'; value: string }, name: string) {
  const db = c.env.DB;
  const keys = c.get('keys');
  const hash = await blindIndex(keys, who.kind, who.value);
  const column = who.kind === 'email' ? 'email' : 'phone';
  const found = await db
    .prepare(`SELECT id, status FROM users WHERE ${column}_hash = ?`)
    .bind(hash)
    .first<{ id: string; status: string }>();
  if (found !== null) return { id: found.id, status: found.status, create: [] as D1PreparedStatement[] };
  const id = newId();
  const now = c.get('now');
  const create = db
    .prepare(
      `INSERT INTO users (id, ${column}_hash, ${column}_enc, name_enc, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      hash,
      await encryptField(keys, who.value, `users.${column}:${id}`),
      await encryptField(keys, name, `users.name:${id}`),
      now,
      now,
    );
  return { id, status: 'active', create: [create] };
}

async function decrypted(c: Ctx, value: unknown, context: string): Promise<string | null> {
  return value === null ? null : decryptField(c.get('keys'), toBytes(value), context);
}

export function tenancyRoutes(deps: Deps): Hono<AppEnv> {
  const r = new Hono<AppEnv>();
  r.use('/owner/tenancies', requireRole('owner'));
  r.use('/owner/tenancies/*', requireRole('owner'));
  r.use('/tenant/tenancies', requireRole('tenant'));
  r.use('/tenant/tenancies/*', requireRole('tenant'));

  r.get('/owner/tenancies', async (c) => {
    const today = dubaiDate(c.get('now'));
    const { results } = await c.env.DB.prepare(
      `SELECT t.id, t.sf_unit_id, t.owner_user_id, t.tenant_user_id, t.starts_on, t.ends_on, t.status,
              u.name_enc, u.email_enc, u.phone_enc
       FROM tenancies t JOIN users u ON u.id = t.tenant_user_id
       WHERE t.owner_user_id = ? ORDER BY t.invited_at DESC LIMIT 50`,
    )
      .bind(c.get('auth').userId)
      .all<TenancyRow & { name_enc: unknown; email_enc: unknown; phone_enc: unknown }>();
    const tenancies = await Promise.all(
      results.map(async (t) => {
        const uid = t.tenant_user_id;
        const contact =
          (await decrypted(c, t.email_enc, `users.email:${uid}`)) ??
          (await decrypted(c, t.phone_enc, `users.phone:${uid}`)) ??
          '';
        return {
          id: t.id,
          sfUnitId: t.sf_unit_id,
          tenantName: (await decrypted(c, t.name_enc, `users.name:${uid}`)) ?? '',
          contact: maskContact(contact),
          startsOn: t.starts_on,
          endsOn: t.ends_on,
          status: t.status,
          current: isTenancyCurrent(facts(t), today),
          daysLeft: daysBetween(today, t.ends_on),
        };
      }),
    );
    return c.json({ tenancies });
  });

  r.post('/owner/tenancies', async (c) => {
    const body = await parseJsonBody(c, inviteTenantBody);
    const db = c.env.DB;
    const owner = c.get('auth').userId;
    const now = c.get('now');
    const today = dubaiDate(now);
    if (!tenancyDatesAllowed(body.startsOn, body.endsOn, today)) {
      throw new ApiError(400, 'Check the dates: the end after the start, at most 3 years, not in the past.');
    }
    if (!(await ownsUnit(c, deps, owner, body.sfUnitId))) throw new ApiError(404, 'Not found.');
    const busy = await db
      .prepare("SELECT 1 AS yes FROM tenancies WHERE sf_unit_id = ? AND status IN ('invited', 'active')")
      .bind(body.sfUnitId)
      .first();
    if (busy !== null) {
      throw new ApiError(409, 'This residence already has a tenant. End that tenancy first.');
    }
    const tenant = await tenantUser(c, identifierOf(body), body.name);
    if (tenant.id === owner) throw new ApiError(400, 'You cannot invite yourself.');
    if (tenant.status !== 'active')
      throw new ApiError(409, 'This person cannot be invited. Contact the JAD+ desk.');
    const id = newId();
    await db.batch([
      ...tenant.create,
      db
        .prepare(
          `INSERT OR IGNORE INTO user_roles (id, user_id, role, partner_id, granted_at, granted_by)
           VALUES (?, ?, 'tenant', NULL, ?, ?)`,
        )
        .bind(newId(), tenant.id, now, owner),
      db
        .prepare(
          `INSERT INTO tenancies (id, sf_unit_id, owner_user_id, tenant_user_id, starts_on, ends_on, status, invited_at, created_by)
           VALUES (?, ?, ?, ?, ?, ?, 'invited', ?, ?)`,
        )
        .bind(id, body.sfUnitId, owner, tenant.id, body.startsOn, body.endsOn, now, owner),
      tenancyInboxStatement(db, {
        tenancyId: id,
        userId: tenant.id,
        kind: 'tenancy_invited',
        at: now,
        data: { endsOn: body.endsOn },
      }),
      audit(c, 'tenant_invited', id),
    ]);
    return c.json({ id, status: 'invited' }, 201);
  });

  r.post('/owner/tenancies/:id/extend', async (c) => {
    const { id } = parseParams(c, tenancyIdParam);
    const body = await parseJsonBody(c, extendTenancyBody);
    const t = await ownTenancy(c, id, 'owner');
    const now = c.get('now');
    if (t.status === 'revoked') throw new ApiError(409, 'This tenancy was ended. Invite the tenant again.');
    if (!extensionAllowed(t.ends_on, body.endsOn, dubaiDate(now))) {
      throw new ApiError(400, 'Choose a later end date, within 3 years.');
    }
    // U5: a tenancy that ended on its date comes back in one tap (unless the unit has a new tenant).
    const status = t.status === 'ended' ? 'active' : t.status;
    try {
      await c.env.DB.batch([
        c.env.DB.prepare('UPDATE tenancies SET ends_on = ?, status = ?, ended_at = NULL WHERE id = ?').bind(
          body.endsOn,
          status,
          id,
        ),
        audit(c, 'tenancy_extended', id),
      ]);
    } catch {
      throw new ApiError(409, 'This residence already has another tenant.');
    }
    return c.json({ id, status, endsOn: body.endsOn });
  });

  r.post('/owner/tenancies/:id/end', async (c) => {
    const { id } = parseParams(c, tenancyIdParam);
    const t = await ownTenancy(c, id, 'owner');
    if (t.status !== 'invited' && t.status !== 'active')
      throw new ApiError(409, 'This tenancy has already ended.');
    const now = c.get('now');
    await c.env.DB.batch([
      // The table ties "no acceptance" to "invited"; a withdrawn invitation keeps the withdrawal time there.
      c.env.DB.prepare(
        "UPDATE tenancies SET status = 'revoked', ended_at = ?, accepted_at = COALESCE(accepted_at, ?) WHERE id = ?",
      ).bind(now, now, id),
      tenancyInboxStatement(c.env.DB, {
        tenancyId: id,
        userId: t.tenant_user_id,
        kind: 'tenancy_ended',
        at: now,
      }),
      audit(c, 'tenancy_ended_by_owner', id),
    ]);
    return c.json({ id, status: 'revoked' });
  });

  r.get('/tenant/tenancies', async (c) => {
    const today = dubaiDate(c.get('now'));
    const { results } = await c.env.DB.prepare(
      `SELECT t.id, t.sf_unit_id, t.owner_user_id, t.tenant_user_id, t.starts_on, t.ends_on, t.status,
              ou.unit_name, ou.project
       FROM tenancies t LEFT JOIN owner_units ou ON ou.rowid =
         (SELECT x.rowid FROM owner_units x WHERE x.sf_unit_id = t.sf_unit_id ORDER BY x.synced_at DESC LIMIT 1)
       WHERE t.tenant_user_id = ? AND t.status IN ('invited', 'active') ORDER BY t.invited_at DESC`,
    )
      .bind(c.get('auth').userId)
      .all<TenancyRow & { unit_name: string | null; project: string | null }>();
    return c.json({
      tenancies: results.map((t) => ({
        id: t.id,
        unitName: t.unit_name ?? '',
        project: t.project,
        startsOn: t.starts_on,
        endsOn: t.ends_on,
        status: t.status,
        current: isTenancyCurrent(facts(t), today),
        daysLeft: daysBetween(today, t.ends_on),
      })),
    });
  });

  r.post('/tenant/tenancies/:id/accept', async (c) => {
    const { id } = parseParams(c, tenancyIdParam);
    const t = await ownTenancy(c, id, 'tenant');
    if (t.status !== 'invited') throw new ApiError(409, 'This invitation is no longer open.');
    const now = c.get('now');
    await c.env.DB.batch([
      c.env.DB.prepare(
        "UPDATE tenancies SET status = 'active', accepted_at = ? WHERE id = ? AND status = 'invited'",
      ).bind(now, id),
      audit(c, 'tenancy_accepted', id),
    ]);
    return c.json({ id, status: 'active' });
  });

  return r;
}
