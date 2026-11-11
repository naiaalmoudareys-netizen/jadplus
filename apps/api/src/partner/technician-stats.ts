/**
 * Per-technician numbers for the partner office (ADR 0025; S5 real data only, S6, S8), partner_admin, own
 * company only (C-AZ-2):
 *
 * - GET /api/partner/technician-stats?month=YYYY-MM   each active technician's jobs done, SLA targets met,
 *                                                     average rating, repeat visits and open jobs, for one
 *                                                     Dubai month, or the last 30 days without `month`
 *
 * The office already sees its technicians' names (team page), so this read is not audited; no resident data is
 * read. The calculation is packages/shared technicianFigures; here only the recorded facts are fetched.
 */
import {
  PARTNER_TARGETS,
  TECHNICIAN_STATS_DAYS,
  technicianFigures,
  technicianStatsPeriod,
  technicianStatsQuery,
  type TechnicianStats,
} from '@jadplus/shared';
import type { Hono } from 'hono';
import { requireRole } from '../auth/middleware.js';
import type { AppEnv } from '../env.js';
import { parseQuery } from '../validate.js';
import { OPEN_SQL, activeTeam, companyOf } from './company/common.js';

interface Tech {
  technician_id: string | null;
}

export function registerTechnicianStats(r: Hono<AppEnv>): void {
  r.get('/technician-stats', requireRole('partner_admin'), async (c) => {
    const { month } = parseQuery(c, technicianStatsQuery);
    const partnerId = companyOf(c);
    const { start, end } = technicianStatsPeriod(month ?? null, c.get('now'));
    const db = c.env.DB;
    const all = <T>(sql: string, ...binds: (string | number)[]) =>
      db
        .prepare(sql)
        .bind(...binds)
        .all<T>()
        .then((x) => x.results);
    const [team, done, outcomes, ratings, repeats, open] = await Promise.all([
      activeTeam(c, partnerId),
      all<Tech>(
        `SELECT technician_id FROM requests WHERE partner_id = ? AND status_changed_at >= ? AND status_changed_at < ?
         AND (status = 'completed' OR (status = 'closed' AND close_reason IN ('confirmed', 'auto_closed')))`,
        partnerId,
        start,
        end,
      ),
      all<Tech & { outcome: 'met' | 'missed' | 'excused' }>(
        `SELECT r.technician_id, o.outcome FROM sla_outcomes o JOIN requests r ON r.id = o.request_id
         WHERE o.partner_id = ? AND o.recorded_at >= ? AND o.recorded_at < ?`,
        partnerId,
        start,
        end,
      ),
      all<Tech & { stars: number }>(
        `SELECT r.technician_id, g.stars FROM ratings g JOIN requests r ON r.id = g.request_id
         WHERE g.partner_id = ? AND g.at >= ? AND g.at < ?`,
        partnerId,
        start,
        end,
      ),
      all<Tech>(
        `SELECT r.technician_id FROM visits v JOIN requests r ON r.id = v.request_id
         WHERE r.partner_id = ? AND v.is_repeat = 1 AND v.created_at >= ? AND v.created_at < ?`,
        partnerId,
        start,
        end,
      ),
      all<Tech>(
        `SELECT technician_id FROM requests WHERE partner_id = ? AND technician_id IS NOT NULL
         AND status IN (${OPEN_SQL})`,
        partnerId,
      ),
    ]);
    const tech = (t: Tech) => ({ technicianId: t.technician_id });
    const body: TechnicianStats = {
      month: month ?? null,
      days: month === undefined ? TECHNICIAN_STATS_DAYS : null,
      targets: PARTNER_TARGETS,
      technicians: technicianFigures(team, {
        done: done.map(tech),
        outcomes: outcomes.map((o) => ({ ...tech(o), outcome: o.outcome })),
        ratings: ratings.map((g) => ({ ...tech(g), stars: g.stars })),
        repeatVisits: repeats.map(tech),
        open: open.map(tech),
      }),
    };
    return c.json(body);
  });
}
