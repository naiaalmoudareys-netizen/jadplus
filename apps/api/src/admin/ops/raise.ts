/**
 * POST /requests (jad_admin): a routine request logged for an owner who called or came in (U8, V3; ADR 0025).
 * The unit must be one of that owner's units (C-AZ-2, JAD+'s copy from Salesforce). It is routed exactly like
 * the owner's own request (routine.ts): the service's partner with the 4-working-hour clock, or the JAD+ team.
 * raised_by_role is 'jad_admin'; raised_by_user_id is the owner, so the owner receives the request's updates
 * and can cancel it as the requester. The staff member who logged it is the 'created' event's actor and in the
 * audit log.
 */
import { adminRaiseBody, dubaiDate, preferredDays, reassignedDue } from '@jadplus/shared';
import type { Hono } from 'hono';
import { requireRole } from '../../auth/middleware.js';
import { newId } from '../../crypto.js';
import type { AppEnv } from '../../env.js';
import { ApiError } from '../../errors.js';
import { loadCalendar } from '../../calendar.js';
import { partnerInboxStatement } from '../../requests/inbox.js';
import { routeService } from '../../requests/routine.js';
import { eventStatement, newRef } from '../../requests/store.js';
import { parseJsonBody } from '../../validate.js';
import { NOT_FOUND, staffAudit, type Ctx } from './common.js';

async function raiseOnBehalf(c: Ctx) {
  const body = await parseJsonBody(c, adminRaiseBody);
  const db = c.env.DB;
  const now = c.get('now');
  const today = dubaiDate(now);
  const actor = c.get('auth');
  const owner = await db
    .prepare(
      `SELECT u.status FROM owner_units ou JOIN users u ON u.id = ou.user_id
       WHERE ou.user_id = ? AND ou.sf_unit_id = ?
         AND EXISTS (SELECT 1 FROM user_roles g WHERE g.user_id = u.id AND g.role = 'owner' AND g.revoked_at IS NULL)`,
    )
    .bind(body.ownerUserId, body.sfUnitId)
    .first<{ status: string }>();
  if (owner === null) throw new ApiError(404, NOT_FOUND);
  if (owner.status !== 'active') throw new ApiError(409, 'This owner’s account is frozen or closed.');
  // E20: the working days on the calendar JAD+ Admin keeps (holidays, ADR 0028).
  const cal = await loadCalendar(db);
  if (!preferredDays(today, cal).includes(body.preferredDate)) {
    throw new ApiError(400, 'Choose a working day within the next two weeks.');
  }
  const route = await routeService(db, body.serviceCode);
  if (route === null) throw new ApiError(404, 'This service is not available.');
  if (route.routing === 'coming_soon') {
    throw new ApiError(422, `${route.service.name} is coming soon.`, { body: { code: 'coming_soon' } });
  }
  const tenancy = await db
    .prepare(
      `SELECT id FROM tenancies WHERE sf_unit_id = ? AND status = 'active' AND starts_on <= ? AND ends_on >= ?`,
    )
    .bind(body.sfUnitId, today, today)
    .first<{ id: string }>();
  const partner = route.partner;
  const due = reassignedDue(false, now, cal);
  const id = newId();
  const ref = newRef();
  const sys = { requestId: id, at: now, actorUserId: null, actorRole: 'system' as const };
  await db.batch([
    db
      .prepare(
        `INSERT INTO requests (id, ref, service_code, sf_unit_id, owner_user_id, tenancy_id, raised_by_user_id,
           raised_by_role, description, is_emergency, status, partner_id, next_due_at, next_due_kind,
           preferred_date, preferred_slot, created_at, updated_at, status_changed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'jad_admin', ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        ref,
        route.service.code,
        body.sfUnitId,
        body.ownerUserId,
        tenancy?.id ?? null,
        body.ownerUserId,
        body.description,
        partner === null ? 'submitted' : 'assigned',
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
      toStatus: 'submitted',
      data: { service: route.service.code, onBehalfOfOwner: true },
    }),
    staffAudit(
      c,
      'request_raised_on_behalf',
      { type: 'request', id },
      { service: route.service.code, routing: route.routing, owner: body.ownerUserId },
    ),
    ...(partner === null
      ? []
      : [
          eventStatement(db, {
            ...sys,
            kind: 'status_changed',
            fromStatus: 'submitted',
            toStatus: 'assigned',
          }),
          eventStatement(db, { ...sys, kind: 'assigned', partnerId: partner.id }),
          partnerInboxStatement(db, { requestId: id, partnerId: partner.id }, 'job_new', now),
        ]),
  ]);
  return c.json({ requestId: id, ref, sentTo: partner?.name ?? 'the JAD+ team' }, 201);
}

export function raiseRoutes(r: Hono<AppEnv>): void {
  r.post('/requests', requireRole('jad_admin'), raiseOnBehalf);
}
