/**
 * JAD+ Admin API, phase A (BUILD_SPEC S6, S7, P3, E6, E7, section 11; ADR 0006):
 * - the partner review list the daily check fills, and resolving an item with a note;
 * - the weekly on-call rota (JAD+ Admin + a second person).
 * Reading: jad_admin and jad_viewer. Changing: jad_admin only. Every change is audited (C-AUD-1).
 */
import {
  canBeOnCall,
  dubaiDate,
  onCallQuery,
  onCallWeekParam,
  resolveReviewBody,
  reviewListQuery,
  setOnCallBody,
  weekStarting,
  type UserRole,
} from '@jadplus/shared';
import { Hono } from 'hono';
import { z } from 'zod';
import { auditStatement } from '../audit.js';
import { requireRole } from '../auth/middleware.js';
import type { AppEnv } from '../env.js';
import { ApiError } from '../errors.js';
import { parseJsonBody, parseParams, parseQuery } from '../validate.js';

const itemParam = z.strictObject({ id: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/) });
/** How many rota weeks one read returns. */
const ROTA_WEEKS = 12;

interface ReviewRow {
  id: string;
  partner_id: string;
  partner_name: string;
  partner_status: string;
  kind: string;
  detail: string | null;
  opened_at: number;
  resolved_at: number | null;
  resolution_note: string | null;
}

async function liveRoles(db: D1Database, userId: string): Promise<UserRole[]> {
  const { results } = await db
    .prepare(
      `SELECT g.role FROM user_roles g JOIN users u ON u.id = g.user_id
       WHERE g.user_id = ? AND g.revoked_at IS NULL AND u.status = 'active'`,
    )
    .bind(userId)
    .all<{ role: UserRole }>();
  return results.map((r) => r.role);
}

export function adminRoutes(): Hono<AppEnv> {
  const admin = new Hono<AppEnv>();

  // S6/S7: partners needing a decision, oldest first.
  admin.get('/partner-review', requireRole('jad_admin', 'jad_viewer'), async (c) => {
    const { status } = parseQuery(c, reviewListQuery);
    const { results } = await c.env.DB.prepare(
      `SELECT i.id, i.partner_id, p.name AS partner_name, p.status AS partner_status, i.kind, i.detail,
              i.opened_at, i.resolved_at, i.resolution_note
       FROM partner_review_items i JOIN partners p ON p.id = i.partner_id
       ${status === 'open' ? 'WHERE i.resolved_at IS NULL' : ''}
       ORDER BY i.resolved_at IS NOT NULL, i.opened_at LIMIT 500`,
    ).all<ReviewRow>();
    return c.json({
      items: results.map((r) => ({
        id: r.id,
        partner: { id: r.partner_id, name: r.partner_name, status: r.partner_status },
        kind: r.kind,
        detail: r.detail === null ? null : (JSON.parse(r.detail) as unknown),
        openedAt: r.opened_at,
        resolvedAt: r.resolved_at,
        resolutionNote: r.resolution_note,
      })),
    });
  });

  admin.post('/partner-review/:id/resolve', requireRole('jad_admin'), async (c) => {
    const { id } = parseParams(c, itemParam);
    const { note } = await parseJsonBody(c, resolveReviewBody);
    const actor = c.get('auth');
    const now = c.get('now');
    const db = c.env.DB;
    const item = await db
      .prepare('SELECT resolved_at FROM partner_review_items WHERE id = ?')
      .bind(id)
      .first<{ resolved_at: number | null }>();
    if (item?.resolved_at !== null) throw new ApiError(404, 'Not found or already resolved.');
    try {
      await db.batch([
        // If someone resolved it meanwhile, the empty note breaks the CHECK and the whole batch (including
        // the audit entry) rolls back: an item is resolved, and audited, exactly once.
        db
          .prepare(
            `UPDATE partner_review_items SET
               resolution_note = CASE WHEN resolved_at IS NULL THEN ? ELSE '' END,
               resolved_by = CASE WHEN resolved_at IS NULL THEN ? ELSE resolved_by END,
               resolved_at = CASE WHEN resolved_at IS NULL THEN ? ELSE resolved_at END
             WHERE id = ?`,
          )
          .bind(note, actor.userId, now, id),
        auditStatement(db, {
          at: now,
          actorUserId: actor.userId,
          actorRole: actor.role,
          action: 'partner_review_resolved',
          targetType: 'partner_review_item',
          targetId: id,
          ipHash: c.get('ipHash'),
          httpRequestId: c.get('requestId'),
        }),
      ]);
    } catch (err) {
      if (err instanceof Error && /CHECK constraint failed/i.test(err.message)) {
        throw new ApiError(404, 'Not found or already resolved.');
      }
      throw err;
    }
    return c.json({ id, resolvedAt: now });
  });

  // Section 11: the rota from a given Monday (default: this week), with empty weeks shown as gaps.
  admin.get('/on-call', requireRole('jad_admin', 'jad_viewer'), async (c) => {
    const { from } = parseQuery(c, onCallQuery);
    const start = from ?? weekStarting(dubaiDate(c.get('now')));
    const { results } = await c.env.DB.prepare(
      `SELECT week_starting, position, user_id FROM on_call_rota
       WHERE week_starting >= ? AND week_starting < date(?, '+${ROTA_WEEKS * 7} days')
       ORDER BY week_starting, position`,
    )
      .bind(start, start)
      .all<{ week_starting: string; position: 'first' | 'second'; user_id: string }>();
    const weeks = Array.from({ length: ROTA_WEEKS }, (_, i) => {
      const week = new Date(Date.parse(`${start}T00:00:00Z`) + i * 7 * 86_400_000).toISOString().slice(0, 10);
      const at = (position: 'first' | 'second') =>
        results.find((r) => r.week_starting === week && r.position === position)?.user_id ?? null;
      return { weekStarting: week, first: at('first'), second: at('second') };
    });
    return c.json({ weeks });
  });

  admin.put('/on-call/:week', requireRole('jad_admin'), async (c) => {
    const { week } = parseParams(c, onCallWeekParam);
    const body = await parseJsonBody(c, setOnCallBody);
    const db = c.env.DB;
    const now = c.get('now');
    if (week < weekStarting(dubaiDate(now))) throw new ApiError(422, 'Past weeks cannot be changed.');
    for (const position of ['first', 'second'] as const) {
      if (!canBeOnCall(position, await liveRoles(db, body[position]))) {
        throw new ApiError(
          422,
          `The ${position} person must be ${position === 'first' ? 'a JAD+ Admin' : 'JAD+ staff'}.`,
        );
      }
    }
    const actor = c.get('auth');
    const put = (position: 'first' | 'second') =>
      db
        .prepare(
          `INSERT INTO on_call_rota (week_starting, position, user_id) VALUES (?, ?, ?)
           ON CONFLICT (week_starting, position) DO UPDATE SET user_id = excluded.user_id`,
        )
        .bind(week, position, body[position]);
    await db.batch([
      put('first'),
      put('second'),
      auditStatement(db, {
        at: now,
        actorUserId: actor.userId,
        actorRole: actor.role,
        action: 'on_call_rota_set',
        targetType: 'on_call_week',
        targetId: week,
        ipHash: c.get('ipHash'),
        httpRequestId: c.get('requestId'),
        detail: { first: body.first, second: body.second },
      }),
    ]);
    return c.json({ weekStarting: week, first: body.first, second: body.second });
  });

  return admin;
}
