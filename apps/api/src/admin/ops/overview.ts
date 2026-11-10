/**
 * GET /overview (jad_admin, jad_viewer; ADR 0025, R4): live counts for the JAD+ Admin home and this month
 * against last month (Dubai calendar months). Counts only, no personal data.
 */
import { OPEN_STATUSES, clockPaused, dayRange, monthOf, previousMonth, type Status } from '@jadplus/shared';
import type { Hono } from 'hono';
import { requireRole } from '../../auth/middleware.js';
import type { AppEnv } from '../../env.js';
import { READ, type Ctx } from './common.js';
import { monthTotals } from './reports.js';

const marks = (n: number) => Array.from({ length: n }, () => '?').join(', ');

async function overview(c: Ctx) {
  const db = c.env.DB;
  const now = c.get('now');
  const open = [...OPEN_STATUSES];
  // Overdue: past the next deadline while the clock runs (a quote or the owner's approval pauses it).
  const running = open.filter((s) => !clockPaused(s));
  const today = dayRange(now);
  const thisMonth = monthOf(now);
  const lastMonth = previousMonth(thisMonth);
  const [counts, byStatus, current, previous] = await Promise.all([
    db
      .prepare(
        `SELECT
           (SELECT count(*) FROM requests WHERE is_emergency = 1 AND status IN (${marks(open.length)})) AS emergencies,
           (SELECT count(*) FROM visits WHERE window_start >= ? AND window_start < ? AND status <> 'cancelled') AS visits,
           (SELECT count(*) FROM requests WHERE status IN (${marks(running.length)}) AND next_due_at < ?) AS overdue,
           (SELECT count(*) FROM requests WHERE status IN ('awaiting_owner', 'quote_sent')) AS waiting,
           (SELECT count(*) FROM desk_requests WHERE status IN ('New', 'In progress')) AS desk,
           (SELECT count(*) FROM partners WHERE status = 'suspended') AS suspended`,
      )
      .bind(...open, today.start, today.end, ...running, now)
      .first<{
        emergencies: number;
        visits: number;
        overdue: number;
        waiting: number;
        desk: number;
        suspended: number;
      }>(),
    db
      .prepare(
        `SELECT status, count(*) AS count FROM requests WHERE status IN (${marks(open.length)})
         GROUP BY status ORDER BY status`,
      )
      .bind(...open)
      .all<{ status: Status; count: number }>(),
    monthTotals(db, thisMonth),
    monthTotals(db, lastMonth),
  ]);
  return c.json({
    live: {
      activeEmergencies: counts?.emergencies ?? 0,
      openByStatus: byStatus.results,
      visitsToday: counts?.visits ?? 0,
      overdue: counts?.overdue ?? 0,
      waitingForOwners: counts?.waiting ?? 0,
      openDeskRequests: counts?.desk ?? 0,
      partnersSuspended: counts?.suspended ?? 0,
    },
    thisMonth: { month: thisMonth, ...current },
    lastMonth: { month: lastMonth, ...previous },
  });
}

export function overviewRoutes(r: Hono<AppEnv>): void {
  r.get('/overview', requireRole(...READ), overview);
}
