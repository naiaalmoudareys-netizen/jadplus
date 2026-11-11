/**
 * Shared pieces of the partner office tools (ADR 0025): the signed-in company, its technicians, the audit
 * entry, and the month figures used by the overview and the scorecard. A partner only ever reaches its own
 * company's rows (C-AZ-2): every query here is bound to the session's partner id.
 */
import { OPEN_STATUSES, monthRange } from '@jadplus/shared';
import type { Context } from 'hono';
import { auditStatement, type AuditAction } from '../../audit.js';
import { decryptField, toBytes } from '../../crypto.js';
import type { AppEnv } from '../../env.js';
import { ApiError } from '../../errors.js';

export type Ctx = Context<AppEnv>;

export const DAY = 86_400_000;
const DUBAI_OFFSET = 4 * 3_600_000;

/** The open statuses as an SQL list. Built from the shared status constants only, never from input. */
export const OPEN_SQL = [...OPEN_STATUSES].map((s) => `'${s}'`).join(', ');

/**
 * SQL: request `r` is not a consultation. Consultations are a conversation, not a home visit: nobody is sent, so
 * they stay off Dispatch and the home-services figures and live on the consultations board (ADR 0036).
 */
export const NOT_CONSULTATION =
  "r.service_code NOT IN (SELECT code FROM services WHERE flow = 'consultation')";

/** The company of the signed-in partner or partner office (sessions in a partner role always carry one). */
export function companyOf(c: Ctx): string {
  const id = c.get('auth').partnerId;
  if (id === null) throw new ApiError(403, 'Not allowed.');
  return id;
}

/** [start, end) in UTC ms of a Dubai calendar day. */
export function dubaiDay(date: string): { readonly start: number; readonly end: number } {
  const start = Date.parse(`${date}T00:00:00Z`) - DUBAI_OFFSET;
  return { start, end: start + DAY };
}

type Detail = Readonly<Record<string, string | number | boolean | null>>;

/** The audit entry for a change by the signed-in person, to batch with the change (C-AUD-1). */
export function audit(
  c: Ctx,
  action: AuditAction,
  targetType: string,
  targetId: string,
  detail?: Detail,
): D1PreparedStatement {
  const a = c.get('auth');
  return auditStatement(c.env.DB, {
    at: c.get('now'),
    actorUserId: a.userId,
    actorRole: a.role,
    action,
    targetType,
    targetId,
    ipHash: c.get('ipHash'),
    httpRequestId: c.get('requestId'),
    ...(detail === undefined ? {} : { detail }),
  });
}

export interface TeamMember {
  readonly id: string;
  readonly userId: string;
  readonly name: string;
}

/** The company's active technicians with their names, in the order they joined. */
export async function activeTeam(c: Ctx, partnerId: string): Promise<TeamMember[]> {
  const { results } = await c.env.DB.prepare(
    `SELECT t.id, t.user_id, u.name_enc FROM technicians t JOIN users u ON u.id = t.user_id
     WHERE t.partner_id = ? AND t.status = 'active' ORDER BY t.created_at, t.id`,
  )
    .bind(partnerId)
    .all<{ id: string; user_id: string; name_enc: unknown }>();
  const keys = c.get('keys');
  return Promise.all(
    results.map(async (t) => ({
      id: t.id,
      userId: t.user_id,
      name:
        t.name_enc === null
          ? 'Team member'
          : await decryptField(keys, toBytes(t.name_enc), `users.name:${t.user_id}`),
    })),
  );
}

/**
 * A technician of the signed-in company, or 404. The office reaches its whole team; a technician (role
 * partner) reaches only their own record, and only when `selfAllowed`.
 */
export async function companyTechnician(
  c: Ctx,
  technicianId: string,
  opts: { readonly selfAllowed: boolean; readonly activeOnly: boolean },
): Promise<{ readonly id: string; readonly userId: string }> {
  const actor = c.get('auth');
  const row = await c.env.DB.prepare(
    `SELECT id, user_id FROM technicians WHERE id = ? AND partner_id = ?
     ${opts.activeOnly ? "AND status = 'active'" : ''}`,
  )
    .bind(technicianId, companyOf(c))
    .first<{ id: string; user_id: string }>();
  const own = actor.role === 'partner_admin' || (opts.selfAllowed && row?.user_id === actor.userId);
  if (row === null || !own) throw new ApiError(404, 'Not found.');
  return { id: row.id, userId: row.user_id };
}

export interface MonthFigures {
  readonly jobsDone: number;
  readonly met: number;
  readonly measured: number;
  readonly averageRating: number | null;
  readonly ratings: number;
  readonly repeatVisits: number;
}

/** A company's real numbers for one month (S5): jobs done, SLA targets met, ratings, repeat visits. */
export async function monthFigures(db: D1Database, partnerId: string, month: string): Promise<MonthFigures> {
  const { start, end } = monthRange(month);
  const row = await db
    .prepare(
      `SELECT
         (SELECT count(*) FROM requests WHERE partner_id = ?1 AND status_changed_at >= ?2 AND status_changed_at < ?3
            AND (status = 'completed' OR (status = 'closed' AND close_reason IN ('confirmed', 'auto_closed')))) AS done,
         (SELECT count(*) FROM sla_outcomes WHERE partner_id = ?1 AND recorded_at >= ?2 AND recorded_at < ?3
            AND outcome = 'met') AS met,
         (SELECT count(*) FROM sla_outcomes WHERE partner_id = ?1 AND recorded_at >= ?2 AND recorded_at < ?3
            AND outcome <> 'excused') AS measured,
         (SELECT avg(stars) FROM ratings WHERE partner_id = ?1 AND at >= ?2 AND at < ?3) AS average,
         (SELECT count(*) FROM ratings WHERE partner_id = ?1 AND at >= ?2 AND at < ?3) AS rated,
         (SELECT count(*) FROM visits v JOIN requests r ON r.id = v.request_id
            WHERE r.partner_id = ?1 AND v.is_repeat = 1 AND v.created_at >= ?2 AND v.created_at < ?3) AS repeats`,
    )
    .bind(partnerId, start, end)
    .first<{
      done: number;
      met: number;
      measured: number;
      average: number | null;
      rated: number;
      repeats: number;
    }>();
  const average = row?.average ?? null;
  return {
    jobsDone: row?.done ?? 0,
    met: row?.met ?? 0,
    measured: row?.measured ?? 0,
    averageRating: average === null ? null : Math.round(average * 10) / 10,
    ratings: row?.rated ?? 0,
    repeatVisits: row?.repeats ?? 0,
  };
}
