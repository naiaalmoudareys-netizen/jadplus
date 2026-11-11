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
 *
 * ADR 0034: while a unit is managed by a JAD Global team, the team's office invites, extends and ends the tenant
 * (apps/api/src/managed/office.ts); the owner still sees the tenancy here but cannot change it (409).
 */
import {
  daysBetween,
  dubaiDate,
  extendTenancyBody,
  inviteTenantBody,
  isTenancyCurrent,
  tenancyIdParam,
} from '@jadplus/shared';
import type { Context } from 'hono';
import { Hono } from 'hono';
import { requireRole } from '../auth/middleware.js';
import type { Deps } from '../context.js';
import type { AppEnv } from '../env.js';
import { ApiError } from '../errors.js';
import { managedNow } from '../managed/store.js';
import { ownsUnit } from '../owners/units.js';
import { parseJsonBody, parseParams } from '../validate.js';
import {
  TENANCY_COLUMNS,
  TENANCY_PERSON_SELECT,
  endTenancy,
  extendTenancy,
  inviteTenant,
  tenancyAudit,
  tenancyFacts,
  tenancyView,
  type TenancyRow,
  type TenancyWithPerson,
} from './actions.js';

type Ctx = Context<AppEnv>;

/** The owner's own tenancy, or "not found" (C-AZ-2). */
async function ownTenancy(c: Ctx, id: string, as: 'owner' | 'tenant'): Promise<TenancyRow> {
  const row = await c.env.DB.prepare(`SELECT ${TENANCY_COLUMNS} FROM tenancies WHERE id = ?`)
    .bind(id)
    .first<TenancyRow>();
  const me = c.get('auth').userId;
  if (row === null || (as === 'owner' ? row.owner_user_id : row.tenant_user_id) !== me) {
    throw new ApiError(404, 'Not found.');
  }
  return row;
}

/** O4 (ADR 0034): on a managed unit the managing team keeps the tenancy; the owner reads. */
async function refuseIfManaged(c: Ctx, sfUnitId: string): Promise<void> {
  const m = await managedNow(c.env.DB, sfUnitId, c.get('now'));
  if (m !== null) {
    throw new ApiError(409, `${m.provider_name} manages this residence and looks after its tenant.`, {
      body: { code: 'managed' },
    });
  }
}

export function tenancyRoutes(deps: Deps): Hono<AppEnv> {
  const r = new Hono<AppEnv>();
  r.use('/owner/tenancies', requireRole('owner'));
  r.use('/owner/tenancies/*', requireRole('owner'));
  r.use('/tenant/tenancies', requireRole('tenant'));
  r.use('/tenant/tenancies/*', requireRole('tenant'));

  r.get('/owner/tenancies', async (c) => {
    const { results } = await c.env.DB.prepare(
      `${TENANCY_PERSON_SELECT} WHERE t.owner_user_id = ? ORDER BY t.invited_at DESC LIMIT 50`,
    )
      .bind(c.get('auth').userId)
      .all<TenancyWithPerson>();
    return c.json({ tenancies: await Promise.all(results.map((t) => tenancyView(c, t))) });
  });

  r.post('/owner/tenancies', async (c) => {
    const body = await parseJsonBody(c, inviteTenantBody);
    const owner = c.get('auth').userId;
    if (!(await ownsUnit(c, deps, owner, body.sfUnitId))) throw new ApiError(404, 'Not found.');
    await refuseIfManaged(c, body.sfUnitId);
    const id = await inviteTenant(c, { sfUnitId: body.sfUnitId, ownerUserId: owner }, body);
    return c.json({ id, status: 'invited' }, 201);
  });

  r.post('/owner/tenancies/:id/extend', async (c) => {
    const { id } = parseParams(c, tenancyIdParam);
    const body = await parseJsonBody(c, extendTenancyBody);
    const t = await ownTenancy(c, id, 'owner');
    await refuseIfManaged(c, t.sf_unit_id);
    const status = await extendTenancy(c, t, body.endsOn);
    return c.json({ id, status, endsOn: body.endsOn });
  });

  r.post('/owner/tenancies/:id/end', async (c) => {
    const { id } = parseParams(c, tenancyIdParam);
    const t = await ownTenancy(c, id, 'owner');
    await refuseIfManaged(c, t.sf_unit_id);
    await endTenancy(c, t, 'tenancy_ended_by_owner');
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
        current: isTenancyCurrent(tenancyFacts(t), today),
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
      tenancyAudit(c, 'tenancy_accepted', id),
    ]);
    return c.json({ id, status: 'active' });
  });

  return r;
}
