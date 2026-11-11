/**
 * Routine (non-emergency) requests (BUILD_SPEC S1-S4, R1, R2, A1, U6; ADR 0012, 0021).
 *
 * - GET  /api/services   the 12-service catalogue, each with its flow (ADR 0030) and who takes a request now:
 *                        its outside partner, its JAD Global team, or nobody yet ("coming soon", S2, P6)
 * - POST /api/requests   an owner raises a request for one of their units, or a tenant for their current home.
 *                        An owner's request goes straight to the service's provider (primary, or backup when the
 *                        primary is suspended) with the service's first-response clock (S4, service-targets.ts).
 *                        In-house services go to a JAD Global team assigned like a partner (ADR 0030).
 *                        A tenant's request first waits for the owner's approval (A1, approval.ts), and a
 *                        tenant may request repairs (maintenance) only: everything else is the owner's (R2).
 */
import {
  choosePartner,
  dubaiDate,
  firstResponseDue,
  preferredDays,
  providerFits,
  providerServiceFor,
  raiseRequestBody,
  reportServiceOf,
  serviceOpenTo,
  serviceRouting,
  snaggingTypeFor,
  type ProviderKind,
  type ServiceDelivery,
  type ServiceFlow,
  type ServiceRouting,
} from '@jadplus/shared';
import { Hono } from 'hono';
import { auditStatement } from '../audit.js';
import { requireRole } from '../auth/middleware.js';
import type { Deps } from '../context.js';
import { newId } from '../crypto.js';
import type { AppEnv } from '../env.js';
import { ApiError } from '../errors.js';
import { loadCalendar } from '../calendar.js';
import { parseJsonBody } from '../validate.js';
import { place } from './emergency.js';
import { inboxStatements, partnerInboxStatement } from './inbox.js';
import { eventStatement, newRef, servicePartners, type ServicePartner } from './store.js';

const MIN = 60_000;
const HOUR = 60 * MIN;

interface ServiceRow {
  code: string;
  name: string;
  grp: string;
  delivery: ServiceDelivery;
  flow: ServiceFlow;
  blurb: string;
}

export interface Route {
  readonly service: ServiceRow;
  readonly partner: { readonly id: string; readonly name: string } | null;
  readonly routing: ServiceRouting;
}

const SERVICE_COLUMNS = 'code, name, grp, delivery, flow, blurb';

/**
 * Who takes a request for this service now (S2, S3, P6; ADR 0030): its active primary or backup provider of the
 * right kind (an outside partner, or a JAD Global team for an in-house service), or nobody yet.
 */
export async function routeService(db: D1Database, code: string): Promise<Route | null> {
  const service = await db
    .prepare(`SELECT ${SERVICE_COLUMNS} FROM services WHERE code = ? AND listed = 1`)
    .bind(code)
    .first<ServiceRow>();
  if (service === null) return null;
  const { primary, backup } = await servicePartners(db, service.code);
  // The admin route only assigns a fitting kind; this keeps a mismatched row from ever taking work.
  const fit = (p: ServicePartner | null) => (p !== null && providerFits(service.delivery, p.kind) ? p : null);
  const partner = choosePartner(fit(primary), fit(backup));
  return { service, partner, routing: serviceRouting(service.delivery, partner !== null) };
}

export function routineRoutes(deps: Deps): Hono<AppEnv> {
  const r = new Hono<AppEnv>();

  r.get('/services', requireRole('owner', 'tenant'), async (c) => {
    const db = c.env.DB;
    const { results } = await db
      .prepare(`SELECT ${SERVICE_COLUMNS} FROM services WHERE listed = 1 ORDER BY sort_order, name`)
      .all<ServiceRow>();
    // Active providers assigned now (primary or backup), with their kind (ADR 0030).
    const staffed = await db
      .prepare(
        `SELECT sp.service_code, p.kind FROM service_partners sp JOIN partners p ON p.id = sp.partner_id
         WHERE sp.ended_at IS NULL AND p.status = 'active'`,
      )
      .all<{ service_code: string; kind: ProviderKind }>();
    const staffedFor = (s: ServiceRow) =>
      staffed.results.some((p) => p.service_code === s.code && providerFits(s.delivery, p.kind));
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
          flow: s.flow,
          routing: serviceRouting(s.delivery, staffedFor(s)),
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
    // E20: the working days on the calendar JAD+ Admin keeps (holidays, ADR 0028).
    const cal = await loadCalendar(db);
    if (!preferredDays(today, cal).includes(body.preferredDate)) {
      throw new ApiError(400, 'Choose a working day within the next two weeks.');
    }
    if (actor.role === 'tenant' && !serviceOpenTo('tenant', body.serviceCode)) {
      throw new ApiError(403, 'Only your owner can request this service.');
    }
    const service = (await routeService(db, body.serviceCode))?.service ?? null;
    if (service === null) throw new ApiError(404, 'This service is not available.');
    // O3 (ADR 0032): soft snagging is done by the JAD Global handover team, professional by the inspector.
    const snagging = snaggingTypeFor(service.code, body.snaggingType);
    const route = await routeService(db, providerServiceFor(service.code, snagging));
    const routing = route?.routing ?? 'coming_soon';
    if (routing === 'coming_soon') {
      throw new ApiError(422, `${service.name} is coming soon.`, { body: { code: 'coming_soon' } });
    }
    // ADR 0031: a consultation needs the owner's consent and answers, so it is sent through its own form.
    if (service.flow === 'consultation') {
      throw new ApiError(422, 'Use the consultation form for this service.', {
        body: { code: 'consultation' },
      });
    }
    // A1: a tenant's request waits for the owner; the partner is chosen when the owner approves.
    const tenant = actor.role === 'tenant';
    const partner = tenant ? null : (route?.partner ?? null);
    const status = tenant ? 'awaiting_owner' : partner === null ? 'submitted' : 'assigned';
    // S4: the service's first deadline (ADR 0030); education has none.
    const due = tenant
      ? { at: now + 24 * HOUR, kind: 'owner_approval' }
      : firstResponseDue(service.code, now, cal);

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
          due?.at ?? null,
          due?.kind ?? null,
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
        detail: { service: service.code, routing, awaitingOwner: tenant, snagging },
      }),
    ];
    // Flow B (ADR 0032): the report side of a snagging or valuation request, with the owner's snagging choice.
    const reportService = reportServiceOf(service.code);
    if (reportService !== null) {
      statements.push(
        db
          .prepare(
            'INSERT INTO report_requests (request_id, service, snagging_type, created_at) VALUES (?, ?, ?, ?)',
          )
          .bind(id, reportService, snagging, now),
      );
    }
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
        partnerInboxStatement(db, { requestId: id, partnerId: partner.id }, 'job_new', now),
      );
    }
    await db.batch(statements);
    c.get('log').log('info', 'Routine request raised', {
      service: service.code,
      routing,
      awaitingOwner: tenant,
      dueInMin: due === null ? null : Math.round((due.at - now) / MIN),
    });
    return c.json(
      {
        requestId: id,
        ref,
        sentTo: route?.partner?.name ?? 'the JAD+ team',
        awaitingOwner: tenant,
      },
      201,
    );
  });

  return r;
}
