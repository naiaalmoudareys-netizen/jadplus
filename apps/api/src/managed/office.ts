/**
 * Managed units for the managing team's office (ADR 0034; O4, A1, R2, U4, U5, C-AZ-2), role partner_admin, own
 * company only. Mounted at /api/partner beside the technicians' routes: roles are declared on each route.
 *
 * - GET  /managed-units                                        units the company manages now, with what waits
 * - GET  /managed-units/:id                                    one unit: tenancy, repair requests, statements
 * - POST /managed-units/:id/tenancies                          invite the tenant (the owner's rules, ADR 0021)
 * - POST /managed-units/:id/tenancies/:tenancyId/extend        a later end date
 * - POST /managed-units/:id/tenancies/:tenancyId/end           end it now
 * - POST /managed-units/:id/requests/:requestId/approval       approve / decline a tenant's request (A1)
 * - GET  /manager-settings, PUT /manager-settings              the company's maintenance company for its units
 * - GET  /capabilities                                         what the company holds (the console menu)
 *
 * The office reaches only arrangements of its own company that are in force today; anything else is 404.
 */
import {
  dubaiDate,
  idSchema,
  extendTenancyBody,
  inviteTenantBody,
  maintenancePartnerBody,
  managedIdParam,
  managedTenancyParam,
  managerApprovalBody,
  managerSeesRequest,
  type OfficeManagedUnit,
  type ProviderKind,
} from '@jadplus/shared';
import type { Context } from 'hono';
import { Hono } from 'hono';
import { z } from 'zod';
import { requireRole } from '../auth/middleware.js';
import type { AppEnv } from '../env.js';
import { ApiError } from '../errors.js';
import { companyOf, OPEN_SQL } from '../partner/company/common.js';
import { decisionStatements } from '../requests/approval.js';
import { withConflictCheck } from '../requests/concurrency.js';
import { readFlowRow } from '../requests/flow.js';
import {
  TENANCY_COLUMNS,
  TENANCY_PERSON_SELECT,
  endTenancy,
  extendTenancy,
  inviteTenant,
  tenancyView,
  type TenancyRow,
  type TenancyWithPerson,
} from '../tenancies/actions.js';
import { parseJsonBody, parseParams } from '../validate.js';
import { maintenanceSetting, saveMaintenanceSetting } from './settings.js';
import {
  MANAGED_SELECT,
  arrangementView,
  managedNowSql,
  managerMaintenancePartner,
  officeArrangement,
  statementsOf,
  type ManagedRow,
} from './store.js';

type Ctx = Context<AppEnv>;

const DUBAI_OFFSET = 4 * 3_600_000;
const requestParam = z.strictObject({ id: idSchema, requestId: idSchema });

/** Start of the arrangement's first day (ms): the manager sees the unit's requests from then on. */
const sinceMs = (m: ManagedRow): number => Date.parse(`${m.since}T00:00:00Z`) - DUBAI_OFFSET;

interface RequestRow {
  id: string;
  ref: string;
  service_code: string;
  status: string;
  is_emergency: number;
  raised_by_role: 'owner' | 'tenant';
  description: string;
  created_at: number;
}

/** The unit's repair requests since the arrangement started (never the owner's sales, mortgage or visa matters). */
async function unitRequests(c: Ctx, m: ManagedRow) {
  const { results } = await c.env.DB.prepare(
    `SELECT id, ref, service_code, status, is_emergency, raised_by_role, description, created_at FROM requests
     WHERE sf_unit_id = ? AND created_at >= ? ORDER BY created_at DESC LIMIT 100`,
  )
    .bind(m.sf_unit_id, sinceMs(m))
    .all<RequestRow>();
  return results
    .filter((r) => managerSeesRequest(r.service_code, r.is_emergency === 1))
    .map((r) => ({
      id: r.id,
      ref: r.ref,
      serviceCode: r.service_code,
      status: r.status,
      isEmergency: r.is_emergency === 1,
      raisedBy: r.raised_by_role,
      description: r.description,
      createdAt: r.created_at,
    }));
}

/** The tenancy of the managed unit (invited or active, else the latest), or 404 for an id not on this unit. */
async function unitTenancy(c: Ctx, m: ManagedRow, tenancyId: string): Promise<TenancyRow> {
  const t = await c.env.DB.prepare(`SELECT ${TENANCY_COLUMNS} FROM tenancies WHERE id = ?`)
    .bind(tenancyId)
    .first<TenancyRow>();
  if (t?.sf_unit_id !== m.sf_unit_id || t.owner_user_id !== m.owner_user_id) {
    throw new ApiError(404, 'Not found.');
  }
  return t;
}

export function managedOfficeRoutes(): Hono<AppEnv> {
  const r = new Hono<AppEnv>();
  const office = requireRole('partner_admin');

  r.get('/managed-units', office, async (c) => {
    const partnerId = companyOf(c);
    const today = dubaiDate(c.get('now'));
    const { results } = await c.env.DB.prepare(
      `${MANAGED_SELECT} WHERE m.provider_id = ?1 AND ${managedNowSql('m', '?2')} ORDER BY unit_name, m.since`,
    )
      .bind(partnerId, today)
      .all<ManagedRow>();
    const units: OfficeManagedUnit[] = await Promise.all(
      results.map(async (m) => {
        const counts = await c.env.DB.prepare(
          `SELECT
             (SELECT status FROM tenancies WHERE sf_unit_id = ?1 AND status IN ('invited', 'active')) AS tenant,
             (SELECT count(*) FROM requests WHERE sf_unit_id = ?1 AND status = 'awaiting_owner') AS waiting,
             (SELECT count(*) FROM requests WHERE sf_unit_id = ?1 AND created_at >= ?2 AND status IN (${OPEN_SQL})
                AND (service_code = 'maintenance' OR is_emergency = 1)) AS open,
             (SELECT max(month) FROM managed_statements WHERE managed_unit_id = ?3) AS last_month`,
        )
          .bind(m.sf_unit_id, sinceMs(m), m.id)
          .first<{
            tenant: 'invited' | 'active' | null;
            waiting: number;
            open: number;
            last_month: string | null;
          }>();
        return {
          ...arrangementView(m, today),
          tenantStatus: counts?.tenant ?? null,
          awaitingApproval: counts?.waiting ?? 0,
          openRequests: counts?.open ?? 0,
          lastStatementMonth: counts?.last_month ?? null,
        };
      }),
    );
    return c.json({ units });
  });

  r.get('/managed-units/:id', office, async (c) => {
    const { id } = parseParams(c, managedIdParam);
    const m = await officeArrangement(c, id);
    const t = await c.env.DB.prepare(
      `${TENANCY_PERSON_SELECT} WHERE t.sf_unit_id = ? AND t.owner_user_id = ?
       ORDER BY CASE WHEN t.status IN ('invited', 'active') THEN 0 ELSE 1 END, t.invited_at DESC LIMIT 1`,
    )
      .bind(m.sf_unit_id, m.owner_user_id)
      .first<TenancyWithPerson>();
    return c.json({
      unit: arrangementView(m, dubaiDate(c.get('now'))),
      tenancy: t === null ? null : await tenancyView(c, t),
      requests: await unitRequests(c, m),
      statements: await statementsOf(c.env.DB, m.id),
    });
  });

  r.post('/managed-units/:id/tenancies', office, async (c) => {
    const { id } = parseParams(c, managedIdParam);
    const body = await parseJsonBody(c, inviteTenantBody);
    const m = await officeArrangement(c, id);
    if (body.sfUnitId !== m.sf_unit_id) throw new ApiError(404, 'Not found.');
    const tenancyId = await inviteTenant(c, { sfUnitId: m.sf_unit_id, ownerUserId: m.owner_user_id }, body);
    return c.json({ id: tenancyId, status: 'invited' }, 201);
  });

  r.post('/managed-units/:id/tenancies/:tenancyId/extend', office, async (c) => {
    const { id, tenancyId } = parseParams(c, managedTenancyParam);
    const body = await parseJsonBody(c, extendTenancyBody);
    const t = await unitTenancy(c, await officeArrangement(c, id), tenancyId);
    const status = await extendTenancy(c, t, body.endsOn);
    return c.json({ id: tenancyId, status, endsOn: body.endsOn });
  });

  r.post('/managed-units/:id/tenancies/:tenancyId/end', office, async (c) => {
    const { id, tenancyId } = parseParams(c, managedTenancyParam);
    const t = await unitTenancy(c, await officeArrangement(c, id), tenancyId);
    await endTenancy(c, t, 'tenancy_ended_by_manager');
    return c.json({ id: tenancyId, status: 'revoked' });
  });

  r.post('/managed-units/:id/requests/:requestId/approval', office, async (c) => {
    const { id, requestId } = parseParams(c, requestParam);
    const body = await parseJsonBody(c, managerApprovalBody);
    const m = await officeArrangement(c, id);
    const row = await readFlowRow(c.env.DB, requestId);
    if (row?.sf_unit_id !== m.sf_unit_id || row.tenancy_id === null) {
      throw new ApiError(404, 'Not found.');
    }
    if (row.status !== 'awaiting_owner') {
      throw new ApiError(409, 'This request is no longer waiting for a decision. Refresh and try again.');
    }
    const approve = body.decision === 'approve';
    // A1 (ADR 0034): the manager's maintenance company when one is set and can take work, else normal routing.
    const chosen = approve ? await managerMaintenancePartner(c.env.DB, m.provider_id) : null;
    const { statements, status } = await decisionStatements(c, row, {
      approve,
      partner: chosen ?? 'route',
      audit: { approve: 'request_approved_by_manager', decline: 'request_declined_by_manager' },
    });
    await withConflictCheck(() => c.env.DB.batch(statements));
    return c.json({ id: requestId, status });
  });

  r.get('/manager-settings', office, async (c) => c.json(await maintenanceSetting(c.env.DB, companyOf(c))));

  r.put('/manager-settings', office, async (c) => {
    const body = await parseJsonBody(c, maintenancePartnerBody);
    const partnerId = companyOf(c);
    const kind = await c.env.DB.prepare('SELECT kind FROM partners WHERE id = ?')
      .bind(partnerId)
      .first<{ kind: ProviderKind }>();
    // Only a JAD Global team manages units (ADR 0030 kinds).
    if (kind?.kind !== 'jad_group') throw new ApiError(403, 'Not allowed.');
    await saveMaintenanceSetting(c, partnerId, body.partnerId);
    return c.json(await maintenanceSetting(c.env.DB, partnerId));
  });

  r.get('/capabilities', office, async (c) => {
    const partnerId = companyOf(c);
    const db = c.env.DB;
    const [partner, services, managed] = await Promise.all([
      db.prepare('SELECT kind FROM partners WHERE id = ?').bind(partnerId).first<{ kind: ProviderKind }>(),
      db
        .prepare(
          'SELECT DISTINCT service_code FROM service_partners WHERE partner_id = ? AND ended_at IS NULL ORDER BY service_code',
        )
        .bind(partnerId)
        .all<{ service_code: string }>(),
      db
        .prepare(
          `SELECT 1 AS yes FROM managed_units m WHERE m.provider_id = ?1 AND ${managedNowSql('m', '?2')} LIMIT 1`,
        )
        .bind(partnerId, dubaiDate(c.get('now')))
        .first<{ yes: number }>(),
    ]);
    if (partner === null) throw new ApiError(404, 'Not found.');
    return c.json({
      kind: partner.kind,
      services: services.results.map((s) => s.service_code),
      managesUnits: managed !== null,
    });
  });

  return r;
}
