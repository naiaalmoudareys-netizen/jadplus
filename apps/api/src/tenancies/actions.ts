/**
 * The tenancy steps shared by the owner (ADR 0021) and, for a managed unit, the managing team's office
 * (ADR 0034): invite a tenant, extend, end, and the masked view of a tenancy. The caller has already decided that
 * the signed-in person may act on the unit (owner of an unmanaged unit, or the manager of a managed one).
 */
import {
  daysBetween,
  dubaiDate,
  extensionAllowed,
  identifierOf,
  isTenancyCurrent,
  maskContact,
  tenancyDatesAllowed,
  type InviteTenantBody,
  type OwnerTenancy,
  type TenancyFacts,
} from '@jadplus/shared';
import type { Context } from 'hono';
import { auditStatement, type AuditAction } from '../audit.js';
import { blindIndex, decryptField, encryptField, newId, toBytes } from '../crypto.js';
import type { AppEnv } from '../env.js';
import { ApiError } from '../errors.js';
import { tenancyInboxStatement } from '../requests/inbox.js';

type Ctx = Context<AppEnv>;

export interface TenancyRow {
  id: string;
  sf_unit_id: string;
  owner_user_id: string;
  tenant_user_id: string;
  starts_on: string;
  ends_on: string;
  status: 'invited' | 'active' | 'ended' | 'revoked';
}

export const TENANCY_COLUMNS = 'id, sf_unit_id, owner_user_id, tenant_user_id, starts_on, ends_on, status';

export const tenancyFacts = (t: TenancyRow): TenancyFacts => ({
  tenantUserId: t.tenant_user_id,
  ownerUserId: t.owner_user_id,
  status: t.status,
  startsOn: t.starts_on,
  endsOn: t.ends_on,
});

export function tenancyAudit(c: Ctx, action: AuditAction, tenancyId: string): D1PreparedStatement {
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

/**
 * R2/O4: invite a tenant to the unit for the owner `ownerUserId` (the owner themselves, or the managing team on
 * the owner's behalf). One invited or active tenancy per unit; the tenant's account is created if new.
 */
export async function inviteTenant(
  c: Ctx,
  unit: { readonly sfUnitId: string; readonly ownerUserId: string },
  body: InviteTenantBody,
): Promise<string> {
  const db = c.env.DB;
  const actor = c.get('auth').userId;
  const now = c.get('now');
  if (!tenancyDatesAllowed(body.startsOn, body.endsOn, dubaiDate(now))) {
    throw new ApiError(400, 'Check the dates: the end after the start, at most 3 years, not in the past.');
  }
  const busy = await db
    .prepare("SELECT 1 AS yes FROM tenancies WHERE sf_unit_id = ? AND status IN ('invited', 'active')")
    .bind(unit.sfUnitId)
    .first();
  if (busy !== null) {
    throw new ApiError(409, 'This residence already has a tenant. End that tenancy first.');
  }
  const tenant = await tenantUser(c, identifierOf(body), body.name);
  if (tenant.id === unit.ownerUserId || tenant.id === actor)
    throw new ApiError(400, 'You cannot invite yourself.');
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
      .bind(newId(), tenant.id, now, actor),
    db
      .prepare(
        `INSERT INTO tenancies (id, sf_unit_id, owner_user_id, tenant_user_id, starts_on, ends_on, status, invited_at, created_by)
         VALUES (?, ?, ?, ?, ?, ?, 'invited', ?, ?)`,
      )
      .bind(id, unit.sfUnitId, unit.ownerUserId, tenant.id, body.startsOn, body.endsOn, now, actor),
    tenancyInboxStatement(db, {
      tenancyId: id,
      userId: tenant.id,
      kind: 'tenancy_invited',
      at: now,
      data: { endsOn: body.endsOn },
    }),
    tenancyAudit(c, 'tenant_invited', id),
  ]);
  return id;
}

/** U5: a later end date; a tenancy that ended on its date comes back in one tap (unless the unit has a new tenant). */
export async function extendTenancy(c: Ctx, t: TenancyRow, endsOn: string): Promise<TenancyRow['status']> {
  if (t.status === 'revoked') throw new ApiError(409, 'This tenancy was ended. Invite the tenant again.');
  if (!extensionAllowed(t.ends_on, endsOn, dubaiDate(c.get('now')))) {
    throw new ApiError(400, 'Choose a later end date, within 3 years.');
  }
  const status = t.status === 'ended' ? 'active' : t.status;
  try {
    await c.env.DB.batch([
      c.env.DB.prepare('UPDATE tenancies SET ends_on = ?, status = ?, ended_at = NULL WHERE id = ?').bind(
        endsOn,
        status,
        t.id,
      ),
      tenancyAudit(c, 'tenancy_extended', t.id),
    ]);
  } catch {
    throw new ApiError(409, 'This residence already has another tenant.');
  }
  return status;
}

/** End the tenancy now (also withdraws an invitation); the tenant is told. */
export async function endTenancy(
  c: Ctx,
  t: TenancyRow,
  action: 'tenancy_ended_by_owner' | 'tenancy_ended_by_manager',
): Promise<void> {
  if (t.status !== 'invited' && t.status !== 'active')
    throw new ApiError(409, 'This tenancy has already ended.');
  const now = c.get('now');
  await c.env.DB.batch([
    // The table ties "no acceptance" to "invited"; a withdrawn invitation keeps the withdrawal time there.
    c.env.DB.prepare(
      "UPDATE tenancies SET status = 'revoked', ended_at = ?, accepted_at = COALESCE(accepted_at, ?) WHERE id = ?",
    ).bind(now, now, t.id),
    tenancyInboxStatement(c.env.DB, {
      tenancyId: t.id,
      userId: t.tenant_user_id,
      kind: 'tenancy_ended',
      at: now,
    }),
    tenancyAudit(c, action, t.id),
  ]);
}

async function decrypted(c: Ctx, value: unknown, context: string): Promise<string | null> {
  return value === null ? null : decryptField(c.get('keys'), toBytes(value), context);
}

export type TenancyWithPerson = TenancyRow & { name_enc: unknown; email_enc: unknown; phone_enc: unknown };

/** SELECT list and join for tenancyView (the tenant's name and contact, encrypted). */
export const TENANCY_PERSON_SELECT = `SELECT t.id, t.sf_unit_id, t.owner_user_id, t.tenant_user_id, t.starts_on,
  t.ends_on, t.status, u.name_enc, u.email_enc, u.phone_enc FROM tenancies t JOIN users u ON u.id = t.tenant_user_id`;

/** What the owner (or the manager) sees of a tenancy: the tenant's name and a masked contact (C-PD-1). */
export async function tenancyView(c: Ctx, t: TenancyWithPerson): Promise<OwnerTenancy> {
  const today = dubaiDate(c.get('now'));
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
    current: isTenancyCurrent(tenancyFacts(t), today),
    daysLeft: daysBetween(today, t.ends_on),
  };
}
