/**
 * GET /audit?action=&actor=&target=&from=&to=&before= (jad_admin only; ADR 0025, C-AUD-1): the audit log, newest
 * first, AUDIT_PAGE_SIZE entries per page. `before` is the last `seq` already shown. The hashed IP is not shown.
 * Reading the log is itself logged, with the filters used (ids and times only).
 */
import { AUDIT_PAGE_SIZE, adminAuditQuery } from '@jadplus/shared';
import type { Hono } from 'hono';
import { requireRole } from '../../auth/middleware.js';
import type { AppEnv } from '../../env.js';
import { parseQuery } from '../../validate.js';
import { parseDetail, staffAudit, type Ctx } from './common.js';

async function auditLog(c: Ctx) {
  const q = parseQuery(c, adminAuditQuery);
  const { results } = await c.env.DB.prepare(
    `SELECT seq, at, actor_user_id, actor_role, action, target_type, target_id, detail FROM audit_log
     WHERE (?1 IS NULL OR action = ?1) AND (?2 IS NULL OR actor_user_id = ?2) AND (?3 IS NULL OR target_id = ?3)
       AND (?4 IS NULL OR at >= ?4) AND (?5 IS NULL OR at < ?5) AND (?6 IS NULL OR seq < ?6)
     ORDER BY seq DESC LIMIT ?7`,
  )
    .bind(
      q.action ?? null,
      q.actor ?? null,
      q.target ?? null,
      q.from ?? null,
      q.to ?? null,
      q.before ?? null,
      AUDIT_PAGE_SIZE + 1,
    )
    .all<{
      seq: number;
      at: number;
      actor_user_id: string | null;
      actor_role: string;
      action: string;
      target_type: string | null;
      target_id: string | null;
      detail: string | null;
    }>();
  const page = results.slice(0, AUDIT_PAGE_SIZE);
  const last = page.at(-1);
  await c.env.DB.batch([
    staffAudit(
      c,
      'audit_log_viewed',
      { type: 'audit_log', id: 'all' },
      {
        action: q.action ?? null,
        actor: q.actor ?? null,
        target: q.target ?? null,
        from: q.from ?? null,
        to: q.to ?? null,
        before: q.before ?? null,
      },
    ),
  ]);
  return c.json({
    entries: page.map((e) => ({
      seq: e.seq,
      at: e.at,
      actorUserId: e.actor_user_id,
      actorRole: e.actor_role,
      action: e.action,
      targetType: e.target_type,
      targetId: e.target_id,
      detail: parseDetail(e.detail),
    })),
    nextBefore: results.length > AUDIT_PAGE_SIZE && last !== undefined ? last.seq : null,
  });
}

export function auditLogRoutes(r: Hono<AppEnv>): void {
  r.get('/audit', requireRole('jad_admin'), auditLog);
}
