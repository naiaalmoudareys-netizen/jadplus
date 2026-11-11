/**
 * The owner approves or declines a tenant's routine request (A1; ADR 0021).
 *
 * - POST /api/requests/:id/approval   { decision: 'approve' | 'decline' }
 *
 * Approve: the request goes to the service's partner (or the JAD+ team) now, with the 4-working-hour response
 * clock starting at the approval (S4). Decline: the request closes as "owner declined". The tenant is told
 * either way (in-app). Only the owner of the unit, only while the request waits (jobflow.ts).
 *
 * ADR 0034: on a managed unit the managing team decides instead (apps/api/src/managed/office.ts, with the same
 * statements from decisionStatements); the owner is refused (409).
 */
import { approvalBody, firstResponseDue, requestIdParam } from '@jadplus/shared';
import type { Context } from 'hono';
import { Hono } from 'hono';
import type { AuditAction } from '../audit.js';
import { requireRole } from '../auth/middleware.js';
import type { AppEnv } from '../env.js';
import { ApiError } from '../errors.js';
import { managedNow } from '../managed/store.js';
import { parseJsonBody, parseParams } from '../validate.js';
import { withConflictCheck } from './concurrency.js';
import { loadForAction, type FlowRow } from './flow.js';
import { loadCalendar } from '../calendar.js';
import { inboxStatements, partnerInboxStatement } from './inbox.js';
import { routeService } from './routine.js';
import { eventStatement } from './store.js';
import { changeStatements } from './transition.js';

type Ctx = Context<AppEnv>;

export interface Decision {
  readonly approve: boolean;
  /** Who takes the approved request (null = the service's normal routing). */
  readonly partner: { readonly id: string } | null | 'route';
  readonly audit: { readonly approve: AuditAction; readonly decline: AuditAction };
}

/** The batch for an A1 decision on a waiting request (owner, or the managing team for a managed unit). */
export async function decisionStatements(
  c: Ctx,
  row: FlowRow,
  d: Decision,
): Promise<{
  readonly statements: D1PreparedStatement[];
  readonly status: 'closed' | 'submitted' | 'assigned';
}> {
  const db = c.env.DB;
  const now = c.get('now');
  const id = row.id;
  if (!d.approve) {
    return {
      status: 'closed',
      statements: [
        ...changeStatements(c, row, {
          to: 'closed',
          closeReason: 'owner_declined_request',
          nextDue: null,
          audit: d.audit.decline,
        }),
        ...inboxStatements(db, row, 'request_declined', now),
      ],
    };
  }
  const service = await db
    .prepare('SELECT service_code FROM requests WHERE id = ?')
    .bind(id)
    .first<{ service_code: string }>();
  const partner =
    d.partner === 'route'
      ? service === null
        ? null
        : ((await routeService(db, service.service_code))?.partner ?? null)
      : d.partner;
  // S4: the service's first deadline, from the approval (ADR 0030; tenants request repairs only).
  const due = firstResponseDue(service?.service_code ?? 'maintenance', now, await loadCalendar(db));
  const sys = { requestId: id, at: now, actorUserId: null, actorRole: 'system' as const };
  return {
    status: partner === null ? 'submitted' : 'assigned',
    statements: [
      // The decider's step (awaiting_owner -> submitted), then the system hands it to the partner.
      ...changeStatements(c, row, { to: 'submitted', nextDue: due, audit: d.audit.approve }),
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
    ],
  };
}

export function approvalRoutes(): Hono<AppEnv> {
  const r = new Hono<AppEnv>();

  r.post('/requests/:id/approval', requireRole('owner'), async (c) => {
    const { id } = parseParams(c, requestIdParam);
    const body = await parseJsonBody(c, approvalBody);
    const approve = body.decision === 'approve';
    const { row } = await loadForAction(c, id, approve ? 'approve_request' : 'decline_request');
    const managed = await managedNow(c.env.DB, row.sf_unit_id, c.get('now'));
    if (managed !== null) {
      throw new ApiError(409, `${managed.provider_name} manages this residence and decides this request.`, {
        body: { code: 'managed' },
      });
    }
    const { statements, status } = await decisionStatements(c, row, {
      approve,
      partner: 'route',
      audit: { approve: 'request_approved_by_owner', decline: 'request_declined_by_owner' },
    });
    await withConflictCheck(() => c.env.DB.batch(statements));
    return c.json({ id, status });
  });

  return r;
}
