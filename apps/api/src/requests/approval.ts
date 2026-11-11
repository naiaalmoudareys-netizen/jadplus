/**
 * The owner approves or declines a tenant's routine request (A1; ADR 0021).
 *
 * - POST /api/requests/:id/approval   { decision: 'approve' | 'decline' }
 *
 * Approve: the request goes to the service's partner (or the JAD+ team) now, with the 4-working-hour response
 * clock starting at the approval (S4). Decline: the request closes as "owner declined". The tenant is told
 * either way (in-app). Only the owner of the unit, only while the request waits (jobflow.ts).
 */
import { MAINTENANCE_SLA, addWorkingMinutes, approvalBody, requestIdParam } from '@jadplus/shared';
import { Hono } from 'hono';
import { requireRole } from '../auth/middleware.js';
import type { AppEnv } from '../env.js';
import { parseJsonBody, parseParams } from '../validate.js';
import { withConflictCheck } from './concurrency.js';
import { loadForAction } from './flow.js';
import { loadCalendar } from '../calendar.js';
import { inboxStatements, partnerInboxStatement } from './inbox.js';
import { routeService } from './routine.js';
import { eventStatement } from './store.js';
import { changeStatements } from './transition.js';

export function approvalRoutes(): Hono<AppEnv> {
  const r = new Hono<AppEnv>();

  r.post('/requests/:id/approval', requireRole('owner'), async (c) => {
    const { id } = parseParams(c, requestIdParam);
    const body = await parseJsonBody(c, approvalBody);
    const approve = body.decision === 'approve';
    const { row } = await loadForAction(c, id, approve ? 'approve_request' : 'decline_request');
    const db = c.env.DB;
    const now = c.get('now');

    if (!approve) {
      await withConflictCheck(() =>
        db.batch([
          ...changeStatements(c, row, {
            to: 'closed',
            closeReason: 'owner_declined_request',
            nextDue: null,
            audit: 'request_declined_by_owner',
          }),
          ...inboxStatements(db, row, 'request_declined', now),
        ]),
      );
      return c.json({ id, status: 'closed' });
    }

    const service = await db
      .prepare('SELECT service_code FROM requests WHERE id = ?')
      .bind(id)
      .first<{ service_code: string }>();
    const route = service === null ? null : await routeService(db, service.service_code);
    const partner = route?.partner ?? null;
    const due = addWorkingMinutes(now, MAINTENANCE_SLA.routineResponse.minutes, await loadCalendar(db));
    const sys = { requestId: id, at: now, actorUserId: null, actorRole: 'system' as const };
    await withConflictCheck(() =>
      db.batch([
        // The owner's step (awaiting_owner -> submitted), then the system hands it to the partner.
        ...changeStatements(c, row, {
          to: 'submitted',
          nextDue: { at: due, kind: 'routine_response' },
          audit: 'request_approved_by_owner',
        }),
        ...(partner === null
          ? []
          : [
              db
                .prepare("UPDATE requests SET status = 'assigned', partner_id = ? WHERE id = ?")
                .bind(partner.id, id),
              eventStatement(db, {
                ...sys,
                kind: 'status_changed',
                fromStatus: 'submitted',
                toStatus: 'assigned',
              }),
              eventStatement(db, { ...sys, kind: 'assigned', partnerId: partner.id }),
              partnerInboxStatement(db, { requestId: id, partnerId: partner.id }, 'job_new', now),
            ]),
        ...inboxStatements(db, row, 'request_approved', now),
      ]),
    );
    return c.json({ id, status: partner === null ? 'submitted' : 'assigned' });
  });

  return r;
}
