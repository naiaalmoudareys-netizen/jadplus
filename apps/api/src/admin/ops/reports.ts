/**
 * Monthly reports for JAD+ Admin (ADR 0025; S5, S6, V4). jad_admin and jad_viewer. Counts and partner/service/
 * project names only: no personal data, so the CSV can be shared with management.
 *
 * - GET /reports/monthly?month=YYYY-MM       requests by service, project and partner, SLA met %, average rating,
 *                                            repeat visits (the Dubai calendar month)
 * - GET /reports/monthly.csv?month=YYYY-MM   the same numbers as CSV
 *
 * Counted in the month: requests raised (created), closed (closed in the month), SLA targets falling due
 * (excused ones left out), ratings given, repeat visits booked.
 */
import {
  adminMonthlyQuery,
  average,
  monthRange,
  monthlyReportCsv,
  percent,
  type AdminMonthlyReport,
} from '@jadplus/shared';
import type { Hono } from 'hono';
import { requireRole } from '../../auth/middleware.js';
import type { AppEnv } from '../../env.js';
import { LOCATION_JOIN } from '../../requests/views.js';
import { parseQuery } from '../../validate.js';
import { READ, type Ctx } from './common.js';

/** SQL fragments; ?1 and ?2 are the month's [start, end). */
const RAISED = 'r.created_at >= ?1 AND r.created_at < ?2';
const CLOSED = "r.status = 'closed' AND r.status_changed_at >= ?1 AND r.status_changed_at < ?2";

export interface MonthTotals {
  readonly raised: number;
  readonly closed: number;
  readonly slaMetPct: number | null;
}

/** Raised, closed and SLA met % in a month (shared with the overview). */
export async function monthTotals(db: D1Database, month: string): Promise<MonthTotals> {
  const { start, end } = monthRange(month);
  const row = await db
    .prepare(
      `SELECT
         (SELECT count(*) FROM requests r WHERE ${RAISED}) AS raised,
         (SELECT count(*) FROM requests r WHERE ${CLOSED}) AS closed,
         (SELECT count(*) FROM sla_outcomes WHERE due_at >= ?1 AND due_at < ?2 AND outcome = 'met') AS met,
         (SELECT count(*) FROM sla_outcomes WHERE due_at >= ?1 AND due_at < ?2 AND outcome <> 'excused') AS measured`,
    )
    .bind(start, end)
    .first<{ raised: number; closed: number; met: number; measured: number }>();
  return {
    raised: row?.raised ?? 0,
    closed: row?.closed ?? 0,
    slaMetPct: percent(row?.met ?? 0, row?.measured ?? 0),
  };
}

export async function monthlyReport(db: D1Database, month: string): Promise<AdminMonthlyReport> {
  const { start, end } = monthRange(month);
  const run = <T>(sql: string) => db.prepare(sql).bind(start, end).all<T>();
  const [totals, extra, services, projects, partners] = await Promise.all([
    monthTotals(db, month),
    db
      .prepare(
        `SELECT
           (SELECT count(*) FROM requests r WHERE ${RAISED} AND r.is_emergency = 1) AS emergencies,
           (SELECT count(*) FROM ratings WHERE at >= ?1 AND at < ?2) AS ratings,
           (SELECT COALESCE(sum(stars), 0) FROM ratings WHERE at >= ?1 AND at < ?2) AS stars,
           (SELECT count(*) FROM visits WHERE is_repeat = 1 AND created_at >= ?1 AND created_at < ?2) AS repeats`,
      )
      .bind(start, end)
      .first<{ emergencies: number; ratings: number; stars: number; repeats: number }>(),
    run<{ code: string; name: string; raised: number; closed: number }>(
      `SELECT s.code, s.name, sum(CASE WHEN ${RAISED} THEN 1 ELSE 0 END) AS raised,
              sum(CASE WHEN ${CLOSED} THEN 1 ELSE 0 END) AS closed
       FROM requests r JOIN services s ON s.code = r.service_code
       GROUP BY s.code HAVING raised > 0 OR closed > 0 ORDER BY raised DESC, s.sort_order`,
    ),
    run<{ project: string; raised: number }>(
      `SELECT COALESCE(ou.project, 'Unknown') AS project, count(*) AS raised
       FROM requests r ${LOCATION_JOIN} WHERE ${RAISED} GROUP BY 1 ORDER BY raised DESC, project`,
    ),
    run<{
      id: string;
      name: string;
      jobs: number;
      closed: number;
      met: number;
      measured: number;
      ratings: number;
      stars: number;
      repeats: number;
    }>(
      `SELECT p.id, p.name,
         (SELECT count(*) FROM requests r WHERE r.partner_id = p.id AND ${RAISED}) AS jobs,
         (SELECT count(*) FROM requests r WHERE r.partner_id = p.id AND ${CLOSED}) AS closed,
         (SELECT count(*) FROM sla_outcomes o WHERE o.partner_id = p.id AND o.due_at >= ?1 AND o.due_at < ?2
            AND o.outcome = 'met') AS met,
         (SELECT count(*) FROM sla_outcomes o WHERE o.partner_id = p.id AND o.due_at >= ?1 AND o.due_at < ?2
            AND o.outcome <> 'excused') AS measured,
         (SELECT count(*) FROM ratings g WHERE g.partner_id = p.id AND g.at >= ?1 AND g.at < ?2) AS ratings,
         (SELECT COALESCE(sum(stars), 0) FROM ratings g WHERE g.partner_id = p.id AND g.at >= ?1 AND g.at < ?2)
            AS stars,
         (SELECT count(*) FROM visits v JOIN requests r ON r.id = v.request_id
            WHERE r.partner_id = p.id AND v.is_repeat = 1 AND v.created_at >= ?1 AND v.created_at < ?2) AS repeats
       FROM partners p ORDER BY p.name`,
    ),
  ]);
  return {
    month,
    totals: {
      raised: totals.raised,
      emergencies: extra?.emergencies ?? 0,
      closed: totals.closed,
      slaMetPct: totals.slaMetPct,
      averageRating: average(extra?.stars ?? 0, extra?.ratings ?? 0),
      ratings: extra?.ratings ?? 0,
      repeatVisits: extra?.repeats ?? 0,
    },
    byService: services.results,
    byProject: projects.results,
    byPartner: partners.results
      .filter((p) => p.jobs + p.closed + p.measured + p.ratings + p.repeats > 0)
      .map((p) => ({
        partnerId: p.id,
        name: p.name,
        jobs: p.jobs,
        closed: p.closed,
        slaMetPct: percent(p.met, p.measured),
        averageRating: average(p.stars, p.ratings),
        repeatVisits: p.repeats,
      })),
  };
}

async function report(c: Ctx) {
  const { month } = parseQuery(c, adminMonthlyQuery);
  return c.json(await monthlyReport(c.env.DB, month));
}

async function reportCsv(c: Ctx) {
  const { month } = parseQuery(c, adminMonthlyQuery);
  const csv = monthlyReportCsv(await monthlyReport(c.env.DB, month));
  return c.body(csv, 200, {
    'content-type': 'text/csv; charset=utf-8',
    'content-disposition': `attachment; filename="jadplus-report-${month}.csv"`,
  });
}

export function reportRoutes(r: Hono<AppEnv>): void {
  r.get('/reports/monthly', requireRole(...READ), report);
  r.get('/reports/monthly.csv', requireRole(...READ), reportCsv);
}
