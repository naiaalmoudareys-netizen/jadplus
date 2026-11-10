/**
 * GET /api/partner/overview (partner_admin; ADR 0025; R3, E4, S5, S6, S7): the office's first screen.
 * Today's work, this month against last month and JAD+ targets, and what needs attention: documents expiring
 * or lapsed, being close to the S6 "low client reviews" line, and technicians away today.
 */
import {
  EMERGENCY_ACK_MINUTES,
  MISSED_EMERGENCY_WINDOW_DAYS,
  PARTNER_DOCUMENT_KINDS,
  PARTNER_TARGETS,
  RATING_WINDOW_DAYS,
  dubaiDate,
  expiryRequired,
  monthOf,
  partnerDocumentStanding,
  previousMonth,
  reviewWatch,
  wholePercent,
  type PartnerDocumentKind,
  type PartnerOverview,
} from '@jadplus/shared';
import type { Hono } from 'hono';
import { requireRole } from '../../auth/middleware.js';
import type { AppEnv } from '../../env.js';
import { DAY, OPEN_SQL, activeTeam, companyOf, dubaiDay, monthFigures, type Ctx } from './common.js';

const MIN = 60_000;
type Alert = PartnerOverview['alerts'][number];

export const DOCUMENT_LABELS: Record<PartnerDocumentKind, string> = {
  trade_licence: 'Trade licence',
  insurance: 'Insurance',
  signed_sop_sla_kpi: 'Signed SOP / SLA / KPI',
  rate_card: 'Rate card',
};

/** Latest verified expiry per document kind; `onFile` false when JAD+ holds none of that kind. */
export async function verifiedDocuments(
  db: D1Database,
  partnerId: string,
): Promise<Map<PartnerDocumentKind, string | null>> {
  const { results } = await db
    .prepare(
      'SELECT kind, MAX(expires_on) AS expires_on FROM partner_documents WHERE partner_id = ? GROUP BY kind',
    )
    .bind(partnerId)
    .all<{ kind: PartnerDocumentKind; expires_on: string | null }>();
  return new Map(results.map((r) => [r.kind, r.expires_on]));
}

async function documentAlerts(c: Ctx, partnerId: string, today: string): Promise<Alert[]> {
  const docs = await verifiedDocuments(c.env.DB, partnerId);
  const alerts: Alert[] = [];
  for (const kind of PARTNER_DOCUMENT_KINDS) {
    const expiresOn = docs.get(kind);
    const standing = partnerDocumentStanding(expiresOn === undefined ? null : { expiresOn }, today);
    const label = DOCUMENT_LABELS[kind];
    if (standing === 'expiring_soon') {
      alerts.push({ kind: 'document', level: 'warning', text: `${label} expires on ${expiresOn ?? ''}.` });
    } else if (standing === 'lapsed') {
      alerts.push({ kind: 'document', level: 'flagged', text: `${label} expired on ${expiresOn ?? ''}.` });
    } else if (standing === 'missing' && expiryRequired(kind)) {
      alerts.push({ kind: 'document', level: 'flagged', text: `${label} is not on file with JAD+.` });
    }
  }
  return alerts;
}

async function reviewAlerts(db: D1Database, partnerId: string, now: number): Promise<Alert[]> {
  const ratings = await db
    .prepare('SELECT at, stars FROM ratings WHERE partner_id = ? AND at > ?')
    .bind(partnerId, now - RATING_WINDOW_DAYS * DAY)
    .all<{ at: number; stars: number }>();
  const missed = await db
    .prepare(
      `SELECT recorded_at AS at FROM sla_outcomes WHERE partner_id = ? AND outcome = 'missed'
       AND metric IN ('emergency_ack', 'emergency_on_site') AND recorded_at > ?`,
    )
    .bind(partnerId, now - MISSED_EMERGENCY_WINDOW_DAYS * DAY)
    .all<{ at: number }>();
  const breaches = await db
    .prepare(
      `SELECT kind, at FROM partner_incidents WHERE partner_id = ? AND resolved_at IS NULL
       AND kind IN ('safety_breach', 'honesty_breach')`,
    )
    .bind(partnerId)
    .all<{ kind: 'safety_breach' | 'honesty_breach'; at: number }>();
  const watch = reviewWatch(
    {
      ratings: ratings.results,
      missedEmergencies: missed.results.map((m) => m.at),
      breaches: breaches.results,
    },
    now,
  );
  return watch.map((w): Alert => {
    if (w.kind === 'low_rating') {
      const avg = w.average.toFixed(1);
      return {
        kind: w.kind,
        level: w.level,
        text:
          w.level === 'flagged'
            ? `Average rating ${avg} over 30 days is below ${PARTNER_TARGETS.averageRating.toFixed(1)}: JAD+ will review.`
            : `Average rating ${avg} over 30 days is close to the ${PARTNER_TARGETS.averageRating.toFixed(1)} line.`,
      };
    }
    if (w.kind === 'missed_emergencies') {
      return {
        kind: w.kind,
        level: w.level,
        text:
          w.level === 'flagged'
            ? `${String(w.count)} missed emergencies in 90 days: JAD+ will review.`
            : 'One missed emergency in 90 days: a second one puts you on JAD+ review.',
      };
    }
    return { kind: 'breach', level: 'flagged', text: 'An open safety or honesty breach is on record.' };
  });
}

const figures = async (db: D1Database, partnerId: string, month: string) => {
  const f = await monthFigures(db, partnerId, month);
  return {
    month,
    jobsDone: f.jobsDone,
    onTimePercent: wholePercent(f.met, f.measured),
    averageRating: f.averageRating,
    ratings: f.ratings,
    repeatVisits: f.repeatVisits,
  };
};

export function registerOverview(r: Hono<AppEnv>): void {
  r.get('/overview', requireRole('partner_admin'), async (c) => {
    const partnerId = companyOf(c);
    const db = c.env.DB;
    const now = c.get('now');
    const today = dubaiDate(now);
    const day = dubaiDay(today);
    const { results: emergencies } = await db
      .prepare(
        `SELECT r.id, r.ref, COALESCE((SELECT MAX(e.at) FROM request_events e WHERE e.request_id = r.id
           AND e.kind = 'assigned' AND e.partner_id = r.partner_id), r.created_at) AS since
         FROM requests r WHERE r.partner_id = ? AND r.is_emergency = 1 AND r.acknowledged_at IS NULL
           AND r.status IN (${OPEN_SQL}) ORDER BY since`,
      )
      .bind(partnerId)
      .all<{ id: string; ref: string; since: number }>();
    const counts = await db
      .prepare(
        `SELECT
           (SELECT count(*) FROM visits v JOIN requests r ON r.id = v.request_id WHERE r.partner_id = ?1
              AND v.window_start >= ?2 AND v.window_start < ?3 AND v.status <> 'cancelled') AS visits,
           (SELECT count(*) FROM requests WHERE partner_id = ?1 AND status IN (${OPEN_SQL})
              AND next_due_at < ?4) AS overdue,
           (SELECT count(*) FROM requests WHERE partner_id = ?1 AND status IN (${OPEN_SQL})
              AND technician_id IS NULL) AS unassigned,
           (SELECT count(*) FROM quotes WHERE partner_id = ?1 AND status = 'pending') AS quotes`,
      )
      .bind(partnerId, day.start, day.end, now)
      .first<{ visits: number; overdue: number; unassigned: number; quotes: number }>();
    const team = new Map((await activeTeam(c, partnerId)).map((t) => [t.id, t.name]));
    const { results: away } = await db
      .prepare(
        `SELECT u.technician_id, u.reason, MAX(u.to_date) AS until FROM technician_unavailability u
         JOIN technicians t ON t.id = u.technician_id
         WHERE t.partner_id = ? AND t.status = 'active' AND u.from_date <= ? AND u.to_date >= ?
         GROUP BY u.technician_id`,
      )
      .bind(partnerId, today, today)
      .all<{
        technician_id: string;
        reason: PartnerOverview['unavailableToday'][number]['reason'];
        until: string;
      }>();
    const thisMonth = monthOf(now);
    const body: PartnerOverview = {
      today: {
        emergencies: emergencies.map((e) => ({
          id: e.id,
          ref: e.ref,
          minutesLeft: Math.ceil((e.since + EMERGENCY_ACK_MINUTES * MIN - now) / MIN),
        })),
        visitsToday: counts?.visits ?? 0,
        overdue: counts?.overdue ?? 0,
        unassigned: counts?.unassigned ?? 0,
        quotesWaiting: counts?.quotes ?? 0,
      },
      thisMonth: await figures(db, partnerId, thisMonth),
      lastMonth: await figures(db, partnerId, previousMonth(thisMonth)),
      targets: PARTNER_TARGETS,
      alerts: [...(await documentAlerts(c, partnerId, today)), ...(await reviewAlerts(db, partnerId, now))],
      unavailableToday: away.map((a) => ({
        technicianId: a.technician_id,
        name: team.get(a.technician_id) ?? 'Team member',
        reason: a.reason,
        until: a.until,
      })),
    };
    return c.json(body);
  });
}
