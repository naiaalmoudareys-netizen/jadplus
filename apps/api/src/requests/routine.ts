/**
 * Routine (non-emergency) requests (BUILD_SPEC S1-S4, R1, U6; ADR 0012).
 *
 * - GET  /api/services   the 12-service catalogue, each with who takes a request now: its partner, the JAD+
 *                        team, or nobody yet ("coming soon", S2: no promise)
 * - POST /api/requests   an owner raises a request for one of their units. A partner service goes straight to
 *                        its partner (primary, or backup when the primary is suspended) with the 4-working-hour
 *                        response clock (S4); an in-house service goes to the JAD+ team on the same clock.
 *
 * Tenants' routine requests need the owner's approval first (A1) and come with the tenant features.
 */
import {
  DEFAULT_CALENDAR,
  MAINTENANCE_SLA,
  addWorkingMinutes,
  choosePartner,
  dubaiDate,
  raiseRequestBody,
  serviceRouting,
  type ServiceDelivery,
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
import { eventStatement, newRef, servicePartners } from './store.js';

const MIN = 60_000;

interface ServiceRow {
  code: string;
  name: string;
  grp: string;
  delivery: ServiceDelivery;
  blurb: string;
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
    return c.json({
      services: results.map((s) => ({
        code: s.code,
        name: s.name,
        group: s.grp,
        blurb: s.blurb,
        routing: serviceRouting(s.delivery, withPartner.has(s.code)),
      })),
    });
  });

  r.post('/requests', requireRole('owner'), async (c) => {
    const body = await parseJsonBody(c, raiseRequestBody);
    const db = c.env.DB;
    const now = c.get('now');
    const actor = c.get('auth');
    const where = await place(c, deps, body, dubaiDate(now));

    const service = await db
      .prepare('SELECT code, name, grp, delivery, blurb FROM services WHERE code = ? AND listed = 1')
      .bind(body.serviceCode)
      .first<ServiceRow>();
    if (service === null) throw new ApiError(404, 'This service is not available.');
    const { primary, backup } = await servicePartners(db, service.code);
    const partner = service.delivery === 'partner' ? choosePartner(primary, backup) : null;
    const routing = serviceRouting(service.delivery, partner !== null);
    if (routing === 'coming_soon') {
      throw new ApiError(422, `${service.name} is coming soon.`, { body: { code: 'coming_soon' } });
    }

    const id = newId();
    const ref = newRef();
    const due = addWorkingMinutes(now, MAINTENANCE_SLA.routineResponse.minutes, DEFAULT_CALENDAR);
    const sys = { requestId: id, at: now, actorUserId: null, actorRole: 'system' as const };
    const statements: D1PreparedStatement[] = [
      db
        .prepare(
          `INSERT INTO requests (id, ref, service_code, sf_unit_id, owner_user_id, tenancy_id, raised_by_user_id,
             raised_by_role, description, is_emergency, status, partner_id, next_due_at, next_due_kind,
             created_at, updated_at, status_changed_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'owner', ?, 0, ?, ?, ?, 'routine_response', ?, ?, ?)`,
        )
        .bind(
          id,
          ref,
          service.code,
          where.sfUnitId,
          where.ownerUserId,
          where.tenancyId,
          actor.userId,
          body.description,
          partner === null ? 'submitted' : 'assigned',
          partner?.id ?? null,
          due,
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
        toStatus: 'submitted',
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
        detail: { service: service.code, routing },
      }),
    ];
    if (partner !== null) {
      statements.push(
        eventStatement(db, { ...sys, kind: 'status_changed', fromStatus: 'submitted', toStatus: 'assigned' }),
        eventStatement(db, { ...sys, kind: 'assigned', partnerId: partner.id }),
      );
    }
    await db.batch(statements);
    c.get('log').log('info', 'Routine request raised', {
      service: service.code,
      routing,
      dueInMin: Math.round((due - now) / MIN),
    });
    return c.json({ requestId: id, ref, sentTo: partner?.name ?? 'the JAD+ team' }, 201);
  });

  return r;
}
