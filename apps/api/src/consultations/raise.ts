/**
 * POST /api/consultations (ADR 0031; O5, O6, S3, S4): an owner asks for a consultation (property management,
 * leasing, resale, mortgage, Golden Visa) for one of their units.
 *
 * - Owners only, for their own unit (tenants never see these services, R2). The tenancy is not linked: a sale or
 *   a mortgage is the owner's private matter, so a tenant living in the unit does not see it.
 * - The consent to share the owner's name, unit and contact details with the provider named on the screen is
 *   required (the body refuses anything else) and is recorded with its wording version and the time.
 * - The answers must match the service's questions; the best time to call is a working day offered and a window.
 * - It goes straight to the service's provider with the service's first deadline (S4, service-targets.ts). The
 *   body names the provider shown in the consent; if the service has moved to another provider since, it is
 *   refused so the owner can agree again (GET /api/consultations/provider/:serviceCode gives the name to show).
 */
import {
  CONSULTATION_CONSENT_VERSION,
  CONSULTATION_SERVICE_CODES,
  answersProblem,
  dubaiDate,
  firstResponseDue,
  preferredDays,
  raiseConsultationBody,
} from '@jadplus/shared';
import { Hono } from 'hono';
import { z } from 'zod';
import { auditStatement } from '../audit.js';
import { requireRole } from '../auth/middleware.js';
import { loadCalendar } from '../calendar.js';
import type { Deps } from '../context.js';
import { newId } from '../crypto.js';
import type { AppEnv } from '../env.js';
import { ApiError } from '../errors.js';
import { place } from '../requests/emergency.js';
import { partnerInboxStatement } from '../requests/inbox.js';
import { routeService } from '../requests/routine.js';
import { eventStatement, newRef } from '../requests/store.js';
import { parseJsonBody, parseParams } from '../validate.js';

const providerParam = z.strictObject({ serviceCode: z.enum(CONSULTATION_SERVICE_CODES) });

export function consultationRaiseRoutes(deps: Deps): Hono<AppEnv> {
  const r = new Hono<AppEnv>();

  // Who would get the owner's details, so the consent on the screen names them (ADR 0031).
  r.get('/consultations/provider/:serviceCode', requireRole('owner'), async (c) => {
    const { serviceCode } = parseParams(c, providerParam);
    const route = await routeService(c.env.DB, serviceCode);
    const partner = route?.service.flow === 'consultation' ? route.partner : null;
    return c.json({ provider: partner === null ? null : { id: partner.id, name: partner.name } });
  });

  r.post('/consultations', requireRole('owner'), async (c) => {
    const body = await parseJsonBody(c, raiseConsultationBody);
    const db = c.env.DB;
    const now = c.get('now');
    const actor = c.get('auth');
    const today = dubaiDate(now);
    const where = await place(c, deps, { sfUnitId: body.sfUnitId }, today);
    const cal = await loadCalendar(db);
    if (!preferredDays(today, cal).includes(body.bestDate)) {
      throw new ApiError(400, 'Choose a working day within the next two weeks.');
    }
    const problem = answersProblem(body.serviceCode, body.answers, today);
    if (problem !== null) throw new ApiError(400, problem);
    const route = await routeService(db, body.serviceCode);
    if (route?.service.flow !== 'consultation') throw new ApiError(404, 'This service is not available.');
    const { service, partner } = route;
    if (route.routing === 'coming_soon' || partner === null) {
      throw new ApiError(422, `${service.name} is coming soon.`, { body: { code: 'coming_soon' } });
    }
    // The consent names one provider: if the service has moved to another since the screen was shown, ask again.
    if (partner.id !== body.providerId) {
      throw new ApiError(409, 'The company for this service has changed. Please check and send again.', {
        body: { code: 'provider_changed' },
      });
    }
    const due = firstResponseDue(service.code, now, cal);
    const note = body.note === undefined || body.note === '' ? null : body.note;

    const id = newId();
    const ref = newRef();
    const sys = { requestId: id, at: now, actorUserId: null, actorRole: 'system' as const };
    const audit = { at: now, actorUserId: actor.userId, actorRole: actor.role, targetType: 'request' };
    const trace = { targetId: id, ipHash: c.get('ipHash'), httpRequestId: c.get('requestId') };
    await db.batch([
      db
        .prepare(
          `INSERT INTO requests (id, ref, service_code, sf_unit_id, owner_user_id, tenancy_id, raised_by_user_id,
             raised_by_role, description, is_emergency, status, partner_id, next_due_at, next_due_kind,
             preferred_date, preferred_slot, created_at, updated_at, status_changed_at)
           VALUES (?, ?, ?, ?, ?, NULL, ?, 'owner', ?, 0, 'assigned', ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          id,
          ref,
          service.code,
          where.sfUnitId,
          where.ownerUserId,
          actor.userId,
          note ?? `Please contact me about ${service.name}.`,
          partner.id,
          due?.at ?? null,
          due?.kind ?? null,
          body.bestDate,
          body.bestSlot,
          now,
          now,
          now,
        ),
      db
        .prepare(
          `INSERT INTO consultations (request_id, service_code, answers, consent_partner_id, consent_version,
             consented_at, consent_ip_hash)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          id,
          service.code,
          JSON.stringify(body.answers),
          partner.id,
          CONSULTATION_CONSENT_VERSION,
          now,
          c.get('ipHash'),
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
      eventStatement(db, { ...sys, kind: 'status_changed', fromStatus: 'submitted', toStatus: 'assigned' }),
      eventStatement(db, { ...sys, kind: 'assigned', partnerId: partner.id }),
      auditStatement(db, {
        ...audit,
        ...trace,
        action: 'request_raised',
        detail: { service: service.code, routing: route.routing, awaitingOwner: false },
      }),
      // The consent itself: to which provider, which wording. Never the person's details.
      auditStatement(db, {
        ...audit,
        ...trace,
        action: 'consultation_consent_given',
        detail: { partner: partner.id, version: CONSULTATION_CONSENT_VERSION },
      }),
      partnerInboxStatement(db, { requestId: id, partnerId: partner.id }, 'job_new', now),
    ]);
    c.get('log').log('info', 'Consultation raised', { service: service.code });
    return c.json({ requestId: id, ref, sentTo: partner.name }, 201);
  });

  return r;
}
