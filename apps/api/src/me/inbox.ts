/**
 * The person's in-app notifications (ADR 0019).
 *
 * - GET  /api/me/inbox        the latest 50, newest first, with the number not read yet
 * - POST /api/me/inbox/read   mark some (ids) or all as read
 *
 * Only the person's own items (C-AZ-2), and only for requests they may still see: a tenant whose tenancy ended
 * no longer sees that unit's notifications.
 */
import { ROLES, dubaiDate, canViewRequest, inboxData, markReadBody, type UserRole } from '@jadplus/shared';
import { Hono } from 'hono';
import { requireRole } from '../auth/middleware.js';
import type { AppEnv } from '../env.js';
import { requestFacts } from '../requests/store.js';
import { parseJsonBody } from '../validate.js';

const EVERY_ROLE: readonly UserRole[] = ROLES.filter((r): r is UserRole => r !== 'system');
const LIMIT = 50;

interface Row {
  id: string;
  kind: string;
  request_id: string;
  ref: string;
  at: number;
  read_at: number | null;
  data: string | null;
  owner_user_id: string;
  tenancy_id: string | null;
  partner_id: string | null;
}

export function inboxRoutes(): Hono<AppEnv> {
  const r = new Hono<AppEnv>();
  r.use('/me/inbox', requireRole(...EVERY_ROLE));
  r.use('/me/inbox/*', requireRole(...EVERY_ROLE));

  r.get('/me/inbox', async (c) => {
    const actor = c.get('auth');
    const db = c.env.DB;
    const today = dubaiDate(c.get('now'));
    const { results } = await db
      .prepare(
        `SELECT i.id, i.kind, i.request_id, r.ref, i.at, i.read_at, i.data, r.owner_user_id, r.tenancy_id, r.partner_id
         FROM inbox i JOIN requests r ON r.id = i.request_id
         WHERE i.user_id = ? ORDER BY i.at DESC, i.rowid DESC LIMIT ?`,
      )
      .bind(actor.userId, LIMIT)
      .all<Row>();
    const visible: Row[] = [];
    for (const row of results) {
      if (canViewRequest(actor, await requestFacts(db, row), today)) visible.push(row);
    }
    return c.json({
      items: visible.map((row) => ({
        id: row.id,
        kind: row.kind,
        requestId: row.request_id,
        ref: row.ref,
        at: row.at,
        read: row.read_at !== null,
        data: inboxData.parse(row.data === null ? {} : JSON.parse(row.data)),
      })),
      unread: visible.filter((row) => row.read_at === null).length,
    });
  });

  r.post('/me/inbox/read', async (c) => {
    const body = await parseJsonBody(c, markReadBody);
    const { userId } = c.get('auth');
    const now = c.get('now');
    const db = c.env.DB;
    if ('all' in body) {
      await db
        .prepare('UPDATE inbox SET read_at = ? WHERE user_id = ? AND read_at IS NULL')
        .bind(now, userId)
        .run();
    } else {
      await db
        .prepare(
          `UPDATE inbox SET read_at = ? WHERE user_id = ? AND read_at IS NULL
           AND id IN (${body.ids.map(() => '?').join(', ')})`,
        )
        .bind(now, userId, ...body.ids)
        .run();
    }
    return c.body(null, 204);
  });

  return r;
}
