/**
 * The person's in-app notifications (ADR 0019).
 *
 * - GET  /api/me/inbox        the latest 50, newest first, with the number not read yet
 * - POST /api/me/inbox/read   mark some (ids) or all as read
 *
 * Only the person's own items (C-AZ-2), and only for requests they may still see: a tenant whose tenancy ended
 * no longer sees that unit's notifications. Building notice items (V1) show in the owner and tenant views while
 * the notice has not been withdrawn.
 */
import {
  ROLES,
  canViewRequest,
  dubaiDate,
  inboxData,
  markReadBody,
  type Actor,
  type UserRole,
} from '@jadplus/shared';
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
  request_id: string | null;
  item_tenancy_id: string | null;
  notice_id: string | null;
  notice_withdrawn_at: number | null;
  ref: string | null;
  at: number;
  read_at: number | null;
  data: string | null;
  owner_user_id: string | null;
  tenancy_id: string | null;
  partner_id: string | null;
  t_owner: string | null;
  t_tenant: string | null;
}

/**
 * Request items: only while the person may still see the request (canViewRequest). Tenancy items: in the
 * view they belong to (the owner's in the owner view, the tenant's in the tenant view).
 */
async function visibleTo(db: D1Database, actor: Actor, row: Row, today: string): Promise<boolean> {
  if (row.notice_id !== null) {
    return (actor.role === 'owner' || actor.role === 'tenant') && row.notice_withdrawn_at === null;
  }
  if (row.item_tenancy_id !== null) {
    return (
      (actor.role === 'owner' && row.t_owner === actor.userId) ||
      (actor.role === 'tenant' && row.t_tenant === actor.userId)
    );
  }
  if (row.owner_user_id === null) return false;
  // E6: the first partner is told the emergency moved to the backup, although the job is no longer theirs.
  // The item carries only the reference; the job itself stays out of reach.
  if (row.kind === 'job_moved_away') return actor.role === 'partner' || actor.role === 'partner_admin';
  return canViewRequest(actor, await requestFacts(db, { ...row, owner_user_id: row.owner_user_id }), today);
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
        `SELECT i.id, i.kind, i.request_id, i.tenancy_id AS item_tenancy_id, i.notice_id,
                bn.withdrawn_at AS notice_withdrawn_at, r.ref, i.at, i.read_at, i.data,
                r.owner_user_id, r.tenancy_id, r.partner_id, t.owner_user_id AS t_owner, t.tenant_user_id AS t_tenant
         FROM inbox i LEFT JOIN requests r ON r.id = i.request_id LEFT JOIN tenancies t ON t.id = i.tenancy_id
           LEFT JOIN building_notices bn ON bn.id = i.notice_id
         WHERE i.user_id = ? ORDER BY i.at DESC, i.rowid DESC LIMIT ?`,
      )
      .bind(actor.userId, LIMIT)
      .all<Row>();
    const visible: Row[] = [];
    for (const row of results) {
      if (await visibleTo(db, actor, row, today)) visible.push(row);
    }
    return c.json({
      items: visible.map((row) => ({
        id: row.id,
        kind: row.kind,
        requestId: row.request_id,
        tenancyId: row.item_tenancy_id,
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
