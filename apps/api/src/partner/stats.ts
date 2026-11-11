/**
 * A partner's own numbers (S5 "real data only"; ADR 0023): jobs finished, SLA targets met, ratings, repeat
 * visits, over the last 7, 30 or 90 days.
 *
 * - GET /api/partner/stats?days=7   a technician sees their own jobs; the partner office its whole company
 * - GET /api/partner/technician-stats?month=   the office's per-technician numbers (technician-stats.ts)
 *
 * Mounted on /api/partner next to other routers, so each route declares its roles (no '*' middleware).
 *
 * Owners and tenants never see scorecards (S8). Ratings are counted, never shown one by one, so a technician
 * cannot tell which resident rated them.
 */
import { partnerStatsQuery } from '@jadplus/shared';
import { Hono } from 'hono';
import { requireRole } from '../auth/middleware.js';
import type { AppEnv } from '../env.js';
import { parseQuery } from '../validate.js';
import { registerTechnicianStats } from './technician-stats.js';

const DAY = 86_400_000;

export function partnerStatsRoutes(): Hono<AppEnv> {
  const r = new Hono<AppEnv>();
  registerTechnicianStats(r);

  r.get('/stats', requireRole('partner', 'partner_admin'), async (c) => {
    const { days: raw } = parseQuery(c, partnerStatsQuery);
    const days = Number(raw ?? '7');
    const actor = c.get('auth');
    const db = c.env.DB;
    const since = c.get('now') - days * DAY;
    const company = actor.role === 'partner_admin';
    // A technician's scope: the jobs their technician record was sent to.
    const tech = company
      ? null
      : await db
          .prepare('SELECT id FROM technicians WHERE user_id = ? AND partner_id = ?')
          .bind(actor.userId, actor.partnerId)
          .first<{ id: string }>();
    // ?3 is always referenced so the statement binds the same three values either way.
    const mine = company ? '?3 = ?3' : 'r.technician_id = ?3';
    const row = await db
      .prepare(
        `SELECT
           (SELECT count(*) FROM requests r WHERE r.partner_id = ?1 AND ${mine} AND r.status_changed_at >= ?2
              AND (r.status = 'completed' OR (r.status = 'closed' AND r.close_reason IN ('confirmed', 'auto_closed'))))
             AS done,
           (SELECT count(*) FROM sla_outcomes o JOIN requests r ON r.id = o.request_id
              WHERE o.partner_id = ?1 AND ${mine} AND o.recorded_at >= ?2 AND o.outcome = 'met') AS met,
           (SELECT count(*) FROM sla_outcomes o JOIN requests r ON r.id = o.request_id
              WHERE o.partner_id = ?1 AND ${mine} AND o.recorded_at >= ?2 AND o.outcome <> 'excused') AS measured,
           (SELECT avg(g.stars) FROM ratings g JOIN requests r ON r.id = g.request_id
              WHERE g.partner_id = ?1 AND ${mine} AND g.at >= ?2) AS average,
           (SELECT count(*) FROM ratings g JOIN requests r ON r.id = g.request_id
              WHERE g.partner_id = ?1 AND ${mine} AND g.at >= ?2) AS rated,
           (SELECT count(*) FROM visits v JOIN requests r ON r.id = v.request_id
              WHERE r.partner_id = ?1 AND ${mine} AND v.is_repeat = 1 AND v.created_at >= ?2) AS repeats`,
      )
      .bind(actor.partnerId, since, tech?.id ?? '')
      .first<{
        done: number;
        met: number;
        measured: number;
        average: number | null;
        rated: number;
        repeats: number;
      }>();
    return c.json({
      days,
      scope: company ? 'company' : 'technician',
      jobsDone: row?.done ?? 0,
      onTime: { met: row?.met ?? 0, total: row?.measured ?? 0 },
      rating: {
        average:
          row?.average === null || row?.average === undefined ? null : Math.round(row.average * 10) / 10,
        count: row?.rated ?? 0,
      },
      repeatVisits: row?.repeats ?? 0,
    });
  });

  return r;
}
