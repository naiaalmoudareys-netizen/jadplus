/**
 * GET /audit?action=&actor=&target=&person=&from=&to=&before= (jad_admin only; ADR 0025, C-AUD-1): the audit
 * log, newest first, AUDIT_PAGE_SIZE entries per page. `before` is the last `seq` already shown. The hashed IP
 * is not shown. Reading the log is itself logged, with the filters used (ids and times only).
 *
 * `person` finds one account by exact email or mobile through its blind index (ADR 0003), never by name: names
 * are encrypted without an index, and searching them would mean decrypting every account. The entries are then
 * what that person did and what was done to them. The address itself is never logged, only the account found;
 * showing that person's name is recorded as 'person_viewed' (C-PD-1), as in the people search.
 */
import { AUDIT_PAGE_SIZE, adminAuditQuery, auditPersonLookup } from '@jadplus/shared';
import type { Hono } from 'hono';
import { requireRole } from '../../auth/middleware.js';
import { blindIndex } from '../../crypto.js';
import type { AppEnv } from '../../env.js';
import { parseQuery } from '../../validate.js';
import { decrypted, parseDetail, staffAudit, type Ctx } from './common.js';

/** The account with this exact email or mobile, or null. */
async function findPerson(c: Ctx, q: string): Promise<{ userId: string; name: string | null } | null> {
  const search = auditPersonLookup(q);
  if (search === null) return null;
  const hash = await blindIndex(c.get('keys'), search.kind, search.value);
  const column = search.kind === 'email' ? 'email_hash' : 'phone_hash';
  const row = await c.env.DB.prepare(`SELECT id, name_enc FROM users WHERE ${column} = ?`)
    .bind(hash)
    .first<{ id: string; name_enc: unknown }>();
  if (row === null) return null;
  return { userId: row.id, name: await decrypted(c, row.name_enc, `users.name:${row.id}`) };
}

async function auditLog(c: Ctx) {
  const q = parseQuery(c, adminAuditQuery);
  const person = q.person === undefined ? null : await findPerson(c, q.person);
  const viewed = (found: number) =>
    staffAudit(
      c,
      'audit_log_viewed',
      { type: 'audit_log', id: 'all' },
      {
        action: q.action ?? null,
        actor: q.actor ?? null,
        target: q.target ?? null,
        person: person?.userId ?? null,
        personSearched: q.person !== undefined,
        from: q.from ?? null,
        to: q.to ?? null,
        before: q.before ?? null,
        entries: found,
      },
    );
  if (q.person !== undefined && person === null) {
    await viewed(0).run();
    return c.json({ entries: [], nextBefore: null, person: null });
  }
  const { results } = await c.env.DB.prepare(
    `SELECT seq, at, actor_user_id, actor_role, action, target_type, target_id, detail FROM audit_log
     WHERE (?1 IS NULL OR action = ?1) AND (?2 IS NULL OR actor_user_id = ?2) AND (?3 IS NULL OR target_id = ?3)
       AND (?4 IS NULL OR at >= ?4) AND (?5 IS NULL OR at < ?5) AND (?6 IS NULL OR seq < ?6)
       AND (?8 IS NULL OR actor_user_id = ?8 OR target_id = ?8)
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
      person?.userId ?? null,
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
    viewed(page.length),
    ...(person === null ? [] : [staffAudit(c, 'person_viewed', { type: 'user', id: person.userId })]),
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
    person,
  });
}

export function auditLogRoutes(r: Hono<AppEnv>): void {
  r.get('/audit', requireRole('jad_admin'), auditLog);
}
