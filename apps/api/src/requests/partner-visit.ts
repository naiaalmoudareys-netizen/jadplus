/**
 * The partner's visit-day steps (ADR 0019; A7, A8, E8):
 *
 * - POST /api/partner/jobs/:id/on-my-way   the technician is on the way; the resident is told (A8)
 * - POST /api/partner/jobs/:id/no-access   nobody let the technician in: evidenced by a photo taken there
 *                                           (uploaded first), the visit must be rebooked within 24 hours, and
 *                                           it is not held against the partner (A7)
 * - POST /api/partner/jobs/:id/make-safe   on an emergency, urgent work up to the owner's pre-agreed limit,
 *                                           recorded without a quote (E8); above the limit, send a quote
 *
 * Only the partner the job is assigned to (C-AZ-2), only when jobflow.ts allows the step; one batch each.
 */
import {
  NO_ACCESS_REBOOK_HOURS,
  makeSafeBody,
  maskContactDetails,
  noAccessBody,
  requestIdParam,
  toFils,
} from '@jadplus/shared';
import { Hono } from 'hono';
import { auditStatement } from '../audit.js';
import { requireRole } from '../auth/middleware.js';
import { newId } from '../crypto.js';
import type { AppEnv } from '../env.js';
import { ApiError } from '../errors.js';
import { parseJsonBody, parseParams } from '../validate.js';
import { versionGuard, withConflictCheck } from './concurrency.js';
import { loadForAction } from './flow.js';
import { inboxStatements } from './inbox.js';
import { eventStatement } from './store.js';
import { changeStatements } from './transition.js';

const HOUR = 3_600_000;

interface LiveVisit {
  id: string;
  window_start: number;
  window_end: number;
}

async function liveVisit(db: D1Database, requestId: string): Promise<LiveVisit> {
  const visit = await db
    .prepare(
      `SELECT id, window_start, window_end FROM visits WHERE request_id = ? AND status IN ('booked', 'on_the_way')
       ORDER BY created_at DESC LIMIT 1`,
    )
    .bind(requestId)
    .first<LiveVisit>();
  if (visit === null) throw new ApiError(409, 'There is no booked visit on this job.');
  return visit;
}

export function partnerVisitRoutes(): Hono<AppEnv> {
  const r = new Hono<AppEnv>();
  r.use('*', requireRole('partner', 'partner_admin'));

  r.post('/jobs/:id/on-my-way', async (c) => {
    const { id } = parseParams(c, requestIdParam);
    const { row } = await loadForAction(c, id, 'on_my_way');
    const db = c.env.DB;
    const actor = c.get('auth');
    const now = c.get('now');
    const visit = await liveVisit(db, id);
    await withConflictCheck(() =>
      db.batch([
        // Touches the request only to take the version: a change at the same moment wins cleanly.
        db
          .prepare(`UPDATE requests SET updated_at = ?, ${versionGuard} WHERE id = ?`)
          .bind(now, row.version, id),
        db.prepare("UPDATE visits SET status = 'on_the_way' WHERE id = ?").bind(visit.id),
        ...inboxStatements(db, row, 'on_the_way', now, {
          windowStart: visit.window_start,
          windowEnd: visit.window_end,
        }),
        auditStatement(db, {
          at: now,
          actorUserId: actor.userId,
          actorRole: actor.role,
          action: 'technician_on_the_way',
          targetType: 'request',
          targetId: id,
          ipHash: c.get('ipHash'),
          httpRequestId: c.get('requestId'),
        }),
      ]),
    );
    return c.json({ id, visit: 'on_the_way' });
  });

  r.post('/jobs/:id/no-access', async (c) => {
    const { id } = parseParams(c, requestIdParam);
    const body = await parseJsonBody(c, noAccessBody);
    const { row } = await loadForAction(c, id, 'no_access');
    const db = c.env.DB;
    const actor = c.get('auth');
    const now = c.get('now');
    const visit = await liveVisit(db, id);
    const photo = await db
      .prepare("SELECT id FROM attachments WHERE id = ? AND request_id = ? AND purpose = 'no_access_photo'")
      .bind(body.photoId, id)
      .first<{ id: string }>();
    if (photo === null) throw new ApiError(400, 'Add a photo taken at the door first.');
    await withConflictCheck(() =>
      db.batch([
        // The job stays with the partner, who must book a new visit within 24 hours (A7).
        ...changeStatements(c, row, {
          to: 'scheduled',
          nextDue: { at: now + NO_ACCESS_REBOOK_HOURS * HOUR, kind: 'rebook_after_no_access' },
          audit: 'no_access_recorded',
        }),
        db
          .prepare(
            "UPDATE visits SET status = 'no_access', no_access_attachment_id = ? WHERE id = ? AND status IN ('booked', 'on_the_way')",
          )
          .bind(photo.id, visit.id),
        db
          .prepare('UPDATE requests SET arrival_window_start = NULL, arrival_window_end = NULL WHERE id = ?')
          .bind(id),
        eventStatement(db, {
          requestId: id,
          at: now,
          actorUserId: actor.userId,
          actorRole: actor.role,
          kind: 'no_access',
          partnerId: actor.partnerId,
          data: { visit: visit.id, photo: photo.id },
        }),
        ...inboxStatements(db, row, 'no_access', now, { hours: NO_ACCESS_REBOOK_HOURS }),
      ]),
    );
    return c.json({ id, status: 'scheduled', rebookWithinHours: NO_ACCESS_REBOOK_HOURS });
  });

  r.post('/jobs/:id/make-safe', async (c) => {
    const { id } = parseParams(c, requestIdParam);
    const body = await parseJsonBody(c, makeSafeBody);
    const { row } = await loadForAction(c, id, 'make_safe');
    const db = c.env.DB;
    const actor = c.get('auth');
    const now = c.get('now');
    // The owner's standing consent at this moment: the latest make-safe answer, which must be a limit.
    const cap = await db
      .prepare(
        `SELECT id, accepted, make_safe_cap_fils FROM consents WHERE user_id = ? AND kind = 'make_safe_cap'
         ORDER BY at DESC, rowid DESC LIMIT 1`,
      )
      .bind(row.owner_user_id)
      .first<{ id: string; accepted: number; make_safe_cap_fils: number | null }>();
    const amount = toFils(body.amountAed);
    if (cap?.accepted !== 1 || cap.make_safe_cap_fils === null) {
      throw new ApiError(409, 'The owner has not agreed a make-safe limit. Send a quote instead.');
    }
    if (amount > cap.make_safe_cap_fils) {
      throw new ApiError(409, "This is above the owner's make-safe limit. Send a quote instead.", {
        body: { limitAed: cap.make_safe_cap_fils / 100 },
      });
    }
    await withConflictCheck(() =>
      db.batch([
        db
          .prepare(`UPDATE requests SET updated_at = ?, ${versionGuard} WHERE id = ?`)
          .bind(now, row.version, id),
        db
          .prepare(
            `INSERT INTO make_safe_works (id, request_id, partner_id, amount_fils, scope, consent_id, recorded_by_user_id, at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            newId(),
            id,
            actor.partnerId,
            amount,
            maskContactDetails(body.scope).text.slice(0, 2000),
            cap.id,
            actor.userId,
            now,
          ),
        ...inboxStatements(db, row, 'make_safe_done', now, { amountAed: amount / 100 }),
        auditStatement(db, {
          at: now,
          actorUserId: actor.userId,
          actorRole: actor.role,
          action: 'make_safe_recorded',
          targetType: 'request',
          targetId: id,
          ipHash: c.get('ipHash'),
          httpRequestId: c.get('requestId'),
          detail: { amountFils: amount, limitFils: cap.make_safe_cap_fils },
        }),
      ]),
    );
    return c.json({ id, amountAed: amount / 100 }, 201);
  });

  return r;
}
