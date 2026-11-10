/**
 * Monthly scorecard and export (ADR 0025; S5 "real data only", S6, S8), partner_admin, own company only:
 *
 * - GET /api/partner/scorecard?month=YYYY-MM   SLA hits by metric, response and completion times (from the
 *                                              request history), ratings, repeat visits, incidents, vs targets
 * - GET /api/partner/export.csv?month=YYYY-MM  the company's jobs raised that month: reference, service, project,
 *                                              building, raised, finished, status, SLA met, rating. No personal
 *                                              data; audited.
 *
 * JAD+ Admin reads the same scorecard through GET /api/admin/partners/:id/scorecard (admin/partner-extras.ts).
 */
import {
  PARTNER_TARGETS,
  SLA_METRICS,
  csvLine,
  dubaiDateTime,
  monthOf,
  monthQuery,
  monthRange,
  wholePercent,
  type PartnerScorecard,
  type SlaMetric,
} from '@jadplus/shared';
import type { Hono } from 'hono';
import { requireRole } from '../../auth/middleware.js';
import type { AppEnv } from '../../env.js';
import { LOCATION_JOIN } from '../../requests/views.js';
import { parseQuery } from '../../validate.js';
import { audit, companyOf, monthFigures } from './common.js';

const MIN = 60_000;

/** Average of the gaps (end - start) that are known and not negative, in whole minutes; null with none. */
function averageMinutes(pairs: readonly (readonly [number, number | null])[]): number | null {
  const gaps = pairs.flatMap(([start, end]) => (end !== null && end >= start ? [end - start] : []));
  return gaps.length === 0 ? null : Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length / MIN);
}

/** One partner's scorecard for one Dubai month, from recorded facts only (S5). */
export async function scorecardFor(
  db: D1Database,
  partner: { readonly id: string; readonly name: string },
  month: string,
): Promise<PartnerScorecard> {
  const { start, end } = monthRange(month);
  const figures = await monthFigures(db, partner.id, month);
  const { results: outcomes } = await db
    .prepare(
      `SELECT metric, outcome, count(*) AS n FROM sla_outcomes WHERE partner_id = ? AND recorded_at >= ?
       AND recorded_at < ? GROUP BY metric, outcome`,
    )
    .bind(partner.id, start, end)
    .all<{ metric: SlaMetric; outcome: 'met' | 'missed' | 'excused'; n: number }>();
  const { results: times } = await db
    .prepare(
      `SELECT
         COALESCE((SELECT MIN(e.at) FROM request_events e WHERE e.request_id = r.id AND e.kind = 'assigned'
           AND e.partner_id = ?1), r.created_at) AS assigned_at,
         (SELECT MIN(e.at) FROM request_events e WHERE e.request_id = r.id
           AND e.kind IN ('acknowledged', 'visit_booked')) AS responded_at,
         (SELECT MIN(e.at) FROM request_events e WHERE e.request_id = r.id AND e.kind = 'status_changed'
           AND e.to_status = 'completed') AS completed_at
       FROM requests r WHERE r.partner_id = ?1 AND r.created_at >= ?2 AND r.created_at < ?3`,
    )
    .bind(partner.id, start, end)
    .all<{ assigned_at: number; responded_at: number | null; completed_at: number | null }>();
  const { results: stars } = await db
    .prepare(
      'SELECT stars, count(*) AS n FROM ratings WHERE partner_id = ? AND at >= ? AND at < ? GROUP BY stars',
    )
    .bind(partner.id, start, end)
    .all<{ stars: number; n: number }>();
  const { results: incidents } = await db
    .prepare(
      `SELECT kind, count(*) AS n FROM partner_incidents WHERE partner_id = ? AND at >= ? AND at < ?
       GROUP BY kind ORDER BY kind`,
    )
    .bind(partner.id, start, end)
    .all<{ kind: string; n: number }>();

  const count = (metric: SlaMetric, outcome: string) =>
    outcomes.find((o) => o.metric === metric && o.outcome === outcome)?.n ?? 0;
  const onTimePercent = wholePercent(figures.met, figures.measured);
  const repeatVisitPercent = wholePercent(figures.repeatVisits, figures.jobsDone);
  return {
    partnerId: partner.id,
    partnerName: partner.name,
    month,
    jobsDone: figures.jobsDone,
    sla: SLA_METRICS.map((metric) => {
      const met = count(metric, 'met');
      const missed = count(metric, 'missed');
      return {
        metric,
        met,
        missed,
        excused: count(metric, 'excused'),
        percent: wholePercent(met, met + missed),
      };
    }),
    onTimePercent,
    averageResponseMinutes: averageMinutes(times.map((t) => [t.assigned_at, t.responded_at] as const)),
    averageCompletionMinutes: averageMinutes(times.map((t) => [t.assigned_at, t.completed_at] as const)),
    rating: {
      average: figures.averageRating,
      count: figures.ratings,
      stars: [1, 2, 3, 4, 5].map((s) => stars.find((r) => r.stars === s)?.n ?? 0),
    },
    repeatVisits: figures.repeatVisits,
    repeatVisitPercent,
    incidents: incidents.map((i) => ({ kind: i.kind, count: i.n })),
    targets: PARTNER_TARGETS,
    meets: {
      onTime: onTimePercent === null ? null : onTimePercent >= PARTNER_TARGETS.onTimePercent,
      rating: figures.averageRating === null ? null : figures.averageRating >= PARTNER_TARGETS.averageRating,
      repeatVisits:
        repeatVisitPercent === null ? null : repeatVisitPercent <= PARTNER_TARGETS.repeatVisitPercent,
    },
  };
}

const CSV_HEADER = [
  'Reference',
  'Service',
  'Project',
  'Building',
  'Raised',
  'Finished',
  'Status',
  'SLA met',
  'Rating',
];

export function registerScorecard(r: Hono<AppEnv>): void {
  const office = requireRole('partner_admin');

  r.get('/scorecard', office, async (c) => {
    const { month } = parseQuery(c, monthQuery);
    const partnerId = companyOf(c);
    const row = await c.env.DB.prepare('SELECT name FROM partners WHERE id = ?')
      .bind(partnerId)
      .first<{ name: string }>();
    return c.json(
      await scorecardFor(c.env.DB, { id: partnerId, name: row?.name ?? '' }, month ?? monthOf(c.get('now'))),
    );
  });

  r.get('/export.csv', office, async (c) => {
    const { month: asked } = parseQuery(c, monthQuery);
    const month = asked ?? monthOf(c.get('now'));
    const partnerId = companyOf(c);
    const { start, end } = monthRange(month);
    const { results } = await c.env.DB.prepare(
      `SELECT r.ref, r.status, r.created_at, ou.project, ou.building,
         (SELECT name FROM services WHERE code = r.service_code) AS service,
         (SELECT MIN(e.at) FROM request_events e WHERE e.request_id = r.id AND e.kind = 'status_changed'
           AND e.to_status = 'completed') AS finished_at,
         (SELECT count(*) FROM sla_outcomes o WHERE o.request_id = r.id AND o.partner_id = r.partner_id
           AND o.outcome = 'missed') AS missed,
         (SELECT count(*) FROM sla_outcomes o WHERE o.request_id = r.id AND o.partner_id = r.partner_id
           AND o.outcome = 'met') AS met,
         (SELECT g.stars FROM ratings g WHERE g.request_id = r.id AND g.partner_id = r.partner_id) AS stars
       FROM requests r ${LOCATION_JOIN}
       WHERE r.partner_id = ? AND r.created_at >= ? AND r.created_at < ? ORDER BY r.created_at`,
    )
      .bind(partnerId, start, end)
      .all<{
        ref: string;
        status: string;
        created_at: number;
        project: string | null;
        building: string | null;
        service: string | null;
        finished_at: number | null;
        missed: number;
        met: number;
        stars: number | null;
      }>();
    const lines = results.map((j) =>
      csvLine([
        j.ref,
        j.service,
        j.project,
        j.building,
        dubaiDateTime(j.created_at),
        j.finished_at === null ? null : dubaiDateTime(j.finished_at),
        j.status,
        j.missed > 0 ? 'No' : j.met > 0 ? 'Yes' : null,
        j.stars,
      ]),
    );
    await audit(c, 'partner_jobs_exported', 'partner', partnerId, { month, rows: results.length }).run();
    return new Response(csvLine(CSV_HEADER) + lines.join(''), {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="jadplus-jobs-${month}.csv"`,
        'cache-control': 'private, no-store',
      },
    });
  });
}
