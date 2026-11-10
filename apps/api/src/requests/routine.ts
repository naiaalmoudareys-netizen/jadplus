/**
 * Routine (non-emergency) requests (BUILD_SPEC S1-S4, R1, R2, A1, U6; ADR 0012, 0021).
 *
 * - GET  /api/services   the 12-service catalogue, each with who takes a request now: its partner, the JAD+
 *                        team, or nobody yet ("coming soon", S2: no promise)
 * - POST /api/requests   an owner raises a request for one of their units, or a tenant for their current home.
 *                        An owner's request goes straight to the service's partner (primary, or backup when the
 *                        primary is suspended) with the 4-working-hour response clock (S4), or to the JAD+ team.
 *                        A tenant's request first waits for the owner's approval (A1, approval.ts), and a
 *                        tenant may request repairs (maintenance) only: everything else is the owner's (R2).
 */
import {
  DEFAULT_CALENDAR,
  MAINTENANCE_SLA,
  addWorkingMinutes,
  choosePartner,
  dubaiDate,
  preferredDays,
  raiseRequestBody,
  serviceOpenTo,
  serviceRouting,
  type ServiceDelivery,
  type ServiceRouting,
} from '@jadplus/shared';
import { Hono } from 'hono';
import { auditStatement } from '../audit.js';
import { requireRole } from '../auth/middleware.js';
import type { Deps } from '../context.js';
import { newId } from '../crypto.js';
import type { AppEnv } from '../env.js';
import { ApiError } from '../errors.js';
import { parseJsonBody } from '../validate.js';
import { place } from './emergency.js';
import { inboxStatements } from './inbox.js';
import { eventStatement, newRef, servicePartners } from './store.js';

const MIN = 60_000;
const HOUR = 60 * MIN;

interface ServiceRow {
  code: string;
  name: string;
  grp: string;
  delivery: ServiceDelivery;
  blurb: string;
}

export interface Route {
  readonly service: ServiceRow;
  readonly partner: { readonly id: string; readonly name: string } | null;
  readonly routing: ServiceRouting;
}

/** Who takes a request for this service now (S2, S3): its partner, the JAD+ team, or nobody yet. */
export async function routeService(db: D1Database, code: string): Promise<Route | null> {
  const service = await db
    .prepare('SELECT code, name, grp, delivery, blurb FROM services WHERE code = ? AND listed = 1')
    .bind(code)
    .first<ServiceRow>();
  if (service === null) return null;
  const { primary, backup } = await servicePartners(db, service.code);
  const partner = service.delivery === 'partner' ? choosePartner(primary, backup) : null;
  return { service, partner, routing: serviceRouting(service.delivery, partner !== null) };
}

export function routineRoutes(deps: Deps): Hono<AppEnv> {
  const r = new Hono<AppEnv>();

  r.get('/services', requireRole('owner', 'tenant'), async (c) => {
    const db = c.env.DB;
    const { results } = await db
      .prepare(
        'SELECT code, name, grp, delivery, blurb FROM services WHERE listed = 1 ORDER BY sort_order, name',
      )
      .all<ServiceRow>();
    // Services with at least one active partner assigned (primary or backup).
    const staffed = await db
      .prepare(
        `SELECT DISTINCT sp.service_code FROM service_partners sp JOIN partners p ON p.id = sp.partner_id
         WHERE sp.ended_at IS NULL AND p.status = 'active'`,
      )
      .all<{ service_code: string }>();
    const withPartner = new Set(staffed.results.map((s) => s.service_code));
    const role = c.get('auth').role === 'tenant' ? 'tenant' : 'owner';
    return c.json({
      // R2: a tenant sees only the services a tenant may request (repairs).
      services: results
        .filter((s) => serviceOpenTo(role, s.code))
        .map((s) => ({
          code: s.code,
          name: s.name,
          group: s.grp,
          blurb: s.blurb,
          routing: serviceRouting(s.delivery, withPartner.has(s.code)),
        })),
    });
  });

  r.post('/requests', requireRole('owner', 'tenant'), async (c) => {
    const body = await parseJsonBody(c, raiseRequestBody);
    const db = c.env.DB;
    const now = c.get('now');
    const actor = c.get('auth');
    const today = dubaiDate(now);
    const where = await place(c, deps, body, today);
    // ADR 0013: the preferred day must be one of the working days offered.
    if (!preferredDays(today, DEFAULT_CALENDAR).includes(body.preferredDate)) {
      throw new ApiError(400, 'Choose a working day within the next two weeks.');
    }
    if (actor.role === 'tenant' && !serviceOpenTo('tenant', body.serviceCode)) {
      throw new ApiError(403, 'Only your owner can request this service.');
    }
    const route = await routeService(db, body.serviceCode);
    if (route === null) throw new ApiError(404, 'This service is not available.');
    const { service, routing } = route;
    if (routing === 'coming_soon') {
      throw new ApiError(422, `${service.name} is coming soon.`, { body: { code: 'coming_soon' } });
    }
    // A1: a tenant's request waits for the owner; the partner is chosen when the owner approves.
    const tenant = actor.role === 'tenant';
    const partner = tenant ? null : route.partner;
    const status = tenant ? 'awaiting_owner' : partner === null ? 'submitted' : 'assigned';
    const due = tenant
      ? { at: now + 24 * HOUR, kind: 'owner_approval' }
      : {
          at: addWorkingMinutes(now, MAINTENANCE_SLA.routineResponse.minutes, DEFAULT_CALENDAR),
          kind: 'routine_response',
        };

    const id = newId();
    const ref = newRef();
    const sys = { requestId: id, at: now, actorUserId: null, actorRole: 'system' as const };
    const statements: D1PreparedStatement[] = [
      db
        .prepare(
          `INSERT INTO requests (id, ref, service_code, sf_unit_id, owner_user_id, tenancy_id, raised_by_user_id,
             raised_by_role, description, is_emergency, status, partner_id, next_due_at, next_due_kind,
             preferred_date, preferred_slot, created_at, updated_at, status_changed_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          id,
          ref,
          service.code,
          where.sfUnitId,
          where.ownerUserId,
          where.tenancyId,
          actor.userId,
          tenant ? 'tenant' : 'owner',
          body.description,
          status,
          partner?.id ?? null,
          due.at,
          due.kind,
          body.preferredDate,
          body.preferredSlot,
          now,
          now,
          now,
        ),
      eventStatement(db, {
        requestId: id,
        at: now,
        actorUserId: actor.userId,
        actorRole: actor.role,
        kind: 'created',
        toStatus: tenant ? 'awaiting_owner' : 'submitted',
        data: { service: service.code },
      }),
      auditStatement(db, {
        at: now,
        actorUserId: actor.userId,
        actorRole: actor.role,
        action: 'request_raised',
        targetType: 'request',
        targetId: id,
        ipHash: c.get('ipHash'),
        httpRequestId: c.get('requestId'),
        detail: { service: service.code, routing, awaitingOwner: tenant },
      }),
    ];
    if (tenant) {
      statements.push(
        ...inboxStatements(
          db,
          { id, owner_user_id: where.ownerUserId, raised_by_user_id: actor.userId },
          'approval_needed',
          now,
        ),
      );
    } else if (partner !== null) {
      statements.push(
        eventStatement(db, { ...sys, kind: 'status_changed', fromStatus: 'submitted', toStatus: 'assigned' }),
        eventStatement(db, { ...sys, kind: 'assigned', partnerId: partner.id }),
      );
    }
    await db.batch(statements);
    c.get('log').log('info', 'Routine request raised', {
      service: service.code,
      routing,
      awaitingOwner: tenant,
      dueInMin: Math.round((due.at - now) / MIN),
    });
    return c.json(
      {
        requestId: id,
        ref,
        sentTo: route.partner?.name ?? 'the JAD+ team',
        awaitingOwner: tenant,
      },
      201,
    );
  });

  return r;
}
