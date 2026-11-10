/**
 * The resident's steps on a request (ADR 0018; L4, A3, A5, E10, S5):
 *
 * - POST /api/requests/:id/quote-decision   the OWNER approves or declines the partner's quote (L4: JAD+
 *                                            never approves chargeable work; a tenant cannot)
 * - POST /api/requests/:id/confirm          the resident confirms the work is done, or says it is not (A5)
 * - POST /api/requests/:id/rating           1-5 stars once the request is closed (S5 scorecard)
 * - POST /api/requests/:id/close            cancel before the work starts, or the owner used their own
 *                                            contractor (E19, ADR 0019)
 *
 * Only on the person's own request (C-AZ-2) and only when jobflow.ts allows the step; one atomic batch each.
 */
import {
  closeRequestBody,
  confirmBody,
  confirmation,
  maskContactDetails,
  quoteDecision,
  quoteDecisionBody,
  ratingBody,
  requestIdParam,
  type InboxData,
  type InboxKind,
} from '@jadplus/shared';
import type { Context } from 'hono';
import { Hono } from 'hono';
import { auditStatement } from '../audit.js';
import { requireRole } from '../auth/middleware.js';
import type { AppEnv } from '../env.js';
import { ApiError } from '../errors.js';
import { parseJsonBody, parseParams } from '../validate.js';
import { withConflictCheck } from './concurrency.js';
import { loadForAction, type FlowRow } from './flow.js';
import { partnerInboxStatement } from './inbox.js';
import { eventStatement } from './store.js';
import { changeStatements } from './transition.js';

/** The partner's notification for this step (ADR 0024), when a partner has the job. */
function toPartner(
  c: Context<AppEnv>,
  row: FlowRow,
  kind: InboxKind,
  data: InboxData = {},
): D1PreparedStatement[] {
  return row.partner_id === null
    ? []
    : [
        partnerInboxStatement(
          c.env.DB,
          { requestId: row.id, partnerId: row.partner_id },
          kind,
          c.get('now'),
          data,
        ),
      ];
}

export function residentFlowRoutes(): Hono<AppEnv> {
  const r = new Hono<AppEnv>();

  r.post('/requests/:id/quote-decision', requireRole('owner'), async (c) => {
    const { id } = parseParams(c, requestIdParam);
    const body = await parseJsonBody(c, quoteDecisionBody);
    const action = body.decision === 'approve' ? 'approve_quote' : 'decline_quote';
    const { row } = await loadForAction(c, id, action);
    const db = c.env.DB;
    const actor = c.get('auth');
    const now = c.get('now');
    const quote = await db
      .prepare("SELECT id, revision FROM quotes WHERE id = ? AND request_id = ? AND status = 'pending'")
      .bind(body.quoteId, id)
      .first<{ id: string; revision: number }>();
    if (quote === null) throw new ApiError(409, 'This quote is no longer waiting for a decision.');
    const outcome = quoteDecision(body.decision, quote.revision);
    await withConflictCheck(() =>
      db.batch([
        ...changeStatements(c, row, {
          to: outcome.to,
          closeReason: outcome.closeReason,
          nextDue: null,
          audit: body.decision === 'approve' ? 'quote_approved' : 'quote_declined',
          detail: { revision: quote.revision },
        }),
        db
          .prepare(
            "UPDATE quotes SET status = ?, decided_at = ?, decided_by_user_id = ? WHERE id = ? AND status = 'pending'",
          )
          .bind(body.decision === 'approve' ? 'approved' : 'declined', now, actor.userId, quote.id),
        eventStatement(db, {
          requestId: id,
          at: now,
          actorUserId: actor.userId,
          actorRole: actor.role,
          kind: 'quote_decided',
          data: { quote: quote.id, decision: body.decision },
        }),
        ...toPartner(c, row, body.decision === 'approve' ? 'quote_approved' : 'quote_declined'),
      ]),
    );
    return c.json({ id, status: outcome.to });
  });

  r.post('/requests/:id/confirm', requireRole('owner', 'tenant'), async (c) => {
    const { id } = parseParams(c, requestIdParam);
    const body = await parseJsonBody(c, confirmBody);
    const { row } = await loadForAction(c, id, body.done ? 'confirm_done' : 'not_done');
    const outcome = confirmation(body.done);
    await withConflictCheck(() =>
      c.env.DB.batch([
        ...changeStatements(c, row, {
          to: outcome.to,
          closeReason: outcome.closeReason,
          nextDue: null,
          audit: body.done ? 'work_confirmed' : 'work_reopened',
        }),
        ...toPartner(c, row, body.done ? 'work_confirmed' : 'work_reopened'),
      ]),
    );
    return c.json({ id, status: outcome.to });
  });

  r.post('/requests/:id/rating', requireRole('owner', 'tenant'), async (c) => {
    const { id } = parseParams(c, requestIdParam);
    const body = await parseJsonBody(c, ratingBody);
    const { row } = await loadForAction(c, id, 'rate');
    const db = c.env.DB;
    const actor = c.get('auth');
    const now = c.get('now');
    const comment =
      body.comment === undefined || body.comment === '' ? null : maskContactDetails(body.comment).text;
    await db.batch([
      db
        .prepare(
          'INSERT INTO ratings (request_id, partner_id, stars, comment, rated_by_user_id, at) VALUES (?, ?, ?, ?, ?, ?)',
        )
        .bind(id, row.partner_id, body.stars, comment?.slice(0, 1000) ?? null, actor.userId, now),
      eventStatement(db, {
        requestId: id,
        at: now,
        actorUserId: actor.userId,
        actorRole: actor.role,
        kind: 'rated',
        data: { stars: body.stars },
      }),
      auditStatement(db, {
        at: now,
        actorUserId: actor.userId,
        actorRole: actor.role,
        action: 'job_rated',
        targetType: 'request',
        targetId: id,
        ipHash: c.get('ipHash'),
        httpRequestId: c.get('requestId'),
        detail: { stars: body.stars },
      }),
      ...toPartner(c, row, 'job_rated', { stars: body.stars }),
    ]);
    return c.json({ id, stars: body.stars }, 201);
  });

  r.post('/requests/:id/close', requireRole('owner', 'tenant'), async (c) => {
    const { id } = parseParams(c, requestIdParam);
    const body = await parseJsonBody(c, closeRequestBody);
    const { row } = await loadForAction(c, id, body.reason);
    const cancel = body.reason === 'cancel';
    const db = c.env.DB;
    await withConflictCheck(() =>
      db.batch([
        ...changeStatements(c, row, {
          to: cancel ? 'cancelled' : 'closed',
          closeReason: cancel ? 'cancelled_by_requester' : 'owner_arranged',
          nextDue: null,
          audit: cancel ? 'request_cancelled' : 'request_owner_arranged',
        }),
        // A booked visit is called off, so the technician does not come.
        db
          .prepare(
            "UPDATE visits SET status = 'cancelled' WHERE request_id = ? AND status IN ('booked', 'on_the_way')",
          )
          .bind(id),
        db
          .prepare(
            "UPDATE quotes SET status = 'withdrawn', decided_at = ? WHERE request_id = ? AND status = 'pending'",
          )
          .bind(c.get('now'), id),
        ...toPartner(c, row, 'job_cancelled'),
      ]),
    );
    return c.json({ id, status: cancel ? 'cancelled' : 'closed' });
  });

  return r;
}
