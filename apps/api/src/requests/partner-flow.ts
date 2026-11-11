/**
 * The partner's steps on a job (ADR 0018; R3, E4, L4, A2, A3, S4):
 *
 * - POST /api/partner/jobs/:id/visit   book (or move) the visit: technician + window; the resident sees both
 * - POST /api/partner/jobs/:id/quote   quote chargeable work; the owner decides (valid 14 days, A2)
 * - POST /api/partner/jobs/:id/start   the technician starts the work
 * - POST /api/partner/jobs/:id/done    the work is finished (photos first, through /api/requests/:id/photos)
 *
 * Only the partner the job is assigned to (C-AZ-2), only when jobflow.ts allows the step; every step is one
 * atomic batch with its history and audit entries, guarded against a change made at the same moment.
 */
import {
  bookVisitBody,
  maskContactDetails,
  quoteExpiresAt,
  requestIdParam,
  sendQuoteBody,
  toFils,
  visitWindowAllowed,
  workDoneBody,
} from '@jadplus/shared';
import { Hono } from 'hono';
import { requireRole } from '../auth/middleware.js';
import { newId } from '../crypto.js';
import type { AppEnv } from '../env.js';
import { ApiError } from '../errors.js';
import { parseJsonBody, parseParams } from '../validate.js';
import { withConflictCheck } from './concurrency.js';
import { loadForAction } from './flow.js';
import { inboxStatements } from './inbox.js';
import { bookedDue, startedDue } from './report-store.js';
import { eventStatement } from './store.js';
import { changeStatements, firstResponseStatement } from './transition.js';

const MESSAGE_MAX = 1000;

export function partnerFlowRoutes(): Hono<AppEnv> {
  const r = new Hono<AppEnv>();
  r.use('*', requireRole('partner', 'partner_admin'));

  r.post('/jobs/:id/visit', async (c) => {
    const { id } = parseParams(c, requestIdParam);
    const body = await parseJsonBody(c, bookVisitBody);
    const { row } = await loadForAction(c, id, 'book_visit');
    const db = c.env.DB;
    const actor = c.get('auth');
    const now = c.get('now');
    const tech = await db
      .prepare("SELECT id FROM technicians WHERE id = ? AND partner_id = ? AND status = 'active'")
      .bind(body.technicianId, actor.partnerId)
      .first<{ id: string }>();
    if (tech === null) throw new ApiError(400, 'Choose an active technician from your team.');
    if (!visitWindowAllowed(body.windowStart, body.windowEnd, now)) {
      throw new ApiError(400, 'Choose a window of 30 minutes to 4 hours within the next 30 days.');
    }
    const visitId = newId();
    const first = firstResponseStatement(c, row, 'visit');
    // S4: a valuation keeps its report deadline; the free re-inspection is not a repeat visit (ADR 0032).
    const nextDue = await bookedDue(db, row, body.windowEnd);
    const repeat = row.status === 'reopened' && row.flow !== 'report';
    await withConflictCheck(() =>
      db.batch([
        ...changeStatements(c, row, {
          to: 'scheduled',
          nextDue,
          audit: 'visit_booked',
        }),
        // One live visit per request: moving the visit cancels the earlier booking.
        db
          .prepare("UPDATE visits SET status = 'cancelled' WHERE request_id = ? AND status = 'booked'")
          .bind(id),
        db
          .prepare(
            `INSERT INTO visits (id, request_id, technician_id, window_start, window_end, status, is_repeat, created_at)
             VALUES (?, ?, ?, ?, ?, 'booked', ?, ?)`,
          )
          .bind(visitId, id, tech.id, body.windowStart, body.windowEnd, repeat ? 1 : 0, now),
        // The window also shows on the request card and on Home ("technician today").
        db
          .prepare(
            'UPDATE requests SET technician_id = ?, arrival_window_start = ?, arrival_window_end = ? WHERE id = ?',
          )
          .bind(tech.id, body.windowStart, body.windowEnd, id),
        eventStatement(db, {
          requestId: id,
          at: now,
          actorUserId: actor.userId,
          actorRole: actor.role,
          kind: 'visit_booked',
          partnerId: actor.partnerId,
          data: { visit: visitId, windowStart: body.windowStart, windowEnd: body.windowEnd },
        }),
        ...inboxStatements(db, row, 'visit_booked', now, {
          windowStart: body.windowStart,
          windowEnd: body.windowEnd,
        }),
        ...(first === null ? [] : [first]),
      ]),
    );
    return c.json({ id, status: 'scheduled', visitId });
  });

  r.post('/jobs/:id/quote', async (c) => {
    const { id } = parseParams(c, requestIdParam);
    const body = await parseJsonBody(c, sendQuoteBody);
    const { row, state } = await loadForAction(c, id, 'send_quote');
    const db = c.env.DB;
    const actor = c.get('auth');
    const now = c.get('now');
    const quoteId = newId();
    const revision = state.quotesSent + 1;
    const scope = maskContactDetails(body.scope).text.slice(0, 2000);
    const first = firstResponseStatement(c, row, 'quote');
    await withConflictCheck(() =>
      db.batch([
        ...changeStatements(c, row, {
          to: 'quote_sent',
          nextDue: null,
          audit: 'quote_sent',
          detail: { revision, amountFils: toFils(body.amountAed) },
        }),
        db
          .prepare(
            `INSERT INTO quotes (id, request_id, partner_id, revision, amount_fils, scope, is_make_safe, status, sent_at, expires_at)
             VALUES (?, ?, ?, ?, ?, ?, 0, 'pending', ?, ?)`,
          )
          .bind(
            quoteId,
            id,
            actor.partnerId,
            revision,
            toFils(body.amountAed),
            scope,
            now,
            quoteExpiresAt(now),
          ),
        eventStatement(db, {
          requestId: id,
          at: now,
          actorUserId: actor.userId,
          actorRole: actor.role,
          kind: 'quote_sent',
          partnerId: actor.partnerId,
          data: { quote: quoteId, revision },
        }),
        ...inboxStatements(db, row, 'quote_received', now, { amountAed: toFils(body.amountAed) / 100 }),
        ...(first === null ? [] : [first]),
      ]),
    );
    return c.json({ id, status: 'quote_sent', quoteId, revision }, 201);
  });

  r.post('/jobs/:id/start', async (c) => {
    const { id } = parseParams(c, requestIdParam);
    const { row } = await loadForAction(c, id, 'start_work');
    const db = c.env.DB;
    // S4: on a report request the report clock starts with the inspection (ADR 0032).
    const nextDue = await startedDue(db, row, c.get('now'));
    await withConflictCheck(() =>
      db.batch([
        ...changeStatements(c, row, { to: 'in_progress', nextDue, audit: 'work_started' }),
        db
          .prepare(
            "UPDATE visits SET status = 'arrived' WHERE request_id = ? AND status IN ('booked', 'on_the_way')",
          )
          .bind(id),
      ]),
    );
    return c.json({ id, status: 'in_progress' });
  });

  r.post('/jobs/:id/done', async (c) => {
    const { id } = parseParams(c, requestIdParam);
    const body = await parseJsonBody(c, workDoneBody);
    const { row } = await loadForAction(c, id, 'work_done');
    const db = c.env.DB;
    const actor = c.get('auth');
    const now = c.get('now');
    const note = body.note === undefined || body.note === '' ? null : maskContactDetails(body.note);
    await withConflictCheck(() =>
      db.batch([
        ...changeStatements(c, row, { to: 'completed', nextDue: null, audit: 'work_completed' }),
        ...inboxStatements(db, row, 'work_done', now),
        db
          .prepare(
            "UPDATE visits SET status = 'done' WHERE request_id = ? AND status IN ('booked', 'on_the_way', 'arrived')",
          )
          .bind(id),
        // The partner's note reaches the resident as a message, like every other contact (ADR 0009).
        ...(note === null
          ? []
          : [
              db
                .prepare(
                  `INSERT INTO request_messages (id, request_id, author_user_id, author_role, author_partner_id, body, masked, at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                )
                .bind(
                  newId(),
                  id,
                  actor.userId,
                  actor.role,
                  actor.partnerId,
                  note.text.slice(0, MESSAGE_MAX),
                  note.masked ? 1 : 0,
                  now,
                ),
            ]),
      ]),
    );
    return c.json({ id, status: 'completed' });
  });

  return r;
}
