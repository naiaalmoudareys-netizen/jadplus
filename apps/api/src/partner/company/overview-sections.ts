/**
 * The workspace sections of GET /api/partner/overview (ADR 0036) besides home services (overview.ts): handovers,
 * managed units, consultations, inspections and reports, investor education. Each reads only this company's
 * work (C-AZ-2); the route asks only for the sections its workspace has.
 */
import {
  addDays,
  consultationColumn,
  consultationColumns,
  dubaiDate,
  firstCallDue,
  firstCallState,
  inspectionGroup,
  monthOf,
  monthRange,
  OPEN_STATUSES,
  previousMonth,
  SERVICES,
  type PartnerOverview,
  type VisitSlot,
} from '@jadplus/shared';
import { managedNowSql } from '../../managed/store.js';
import { LOCATION_JOIN } from '../../requests/views.js';
import { loadConsultations, loadInspections } from './boards.js';
import { OPEN_SQL, dubaiDay } from './common.js';

type Section<K extends keyof PartnerOverview> = NonNullable<PartnerOverview[K]>;

/** Handovers in progress, key collections this week, and the snags the handover team fixes (ADR 0032, 0033). */
export async function handoverSection(
  db: D1Database,
  partnerId: string,
  now: number,
): Promise<Section<'handover'>> {
  const today = dubaiDate(now);
  const counts = await db
    .prepare(
      `SELECT
         (SELECT count(*) FROM handover_checklists hc JOIN requests r ON r.id = hc.request_id
            WHERE r.partner_id = ?1 AND hc.completed_at IS NULL) AS in_progress,
         (SELECT count(*) FROM requests r WHERE r.partner_id = ?1 AND r.service_code = 'handover'
            AND r.status IN (${OPEN_SQL})
            AND NOT EXISTS (SELECT 1 FROM handover_checklists hc WHERE hc.request_id = r.id OR hc.sf_unit_id = r.sf_unit_id))
           AS waiting,
         (SELECT count(*) FROM snags s JOIN requests r ON r.id = s.request_id
            WHERE s.status = 'open' AND s.removed_at IS NULL AND r.service_code = 'snagging' AND r.status IN (${OPEN_SQL})
              AND EXISTS (SELECT 1 FROM request_reports rp WHERE rp.request_id = r.id AND rp.kind = 'snagging'))
           AS snags_open,
         (SELECT count(*) FROM snags s JOIN requests r ON r.id = s.request_id
            WHERE s.status = 'open' AND s.removed_at IS NULL AND s.reopen_count > 0 AND r.service_code = 'snagging'
              AND r.status IN (${OPEN_SQL})
              AND EXISTS (SELECT 1 FROM request_reports rp WHERE rp.request_id = r.id AND rp.kind = 'snagging'))
           AS snags_reopened`,
    )
    .bind(partnerId)
    .first<{ in_progress: number; waiting: number; snags_open: number; snags_reopened: number }>();
  const { results: keys } = await db
    .prepare(
      `SELECT hc.id, hc.key_date, hc.key_slot, ou.unit_name, ou.project
       FROM handover_checklists hc JOIN requests r ON r.id = hc.request_id ${LOCATION_JOIN}
       WHERE r.partner_id = ? AND hc.completed_at IS NULL AND hc.key_date >= ? AND hc.key_date <= ?
       ORDER BY hc.key_date, hc.key_slot`,
    )
    .bind(partnerId, today, addDays(today, 6))
    .all<{
      id: string;
      key_date: string;
      key_slot: VisitSlot;
      unit_name: string | null;
      project: string | null;
    }>();
  return {
    inProgress: counts?.in_progress ?? 0,
    waitingToStart: counts?.waiting ?? 0,
    keyCollectionsThisWeek: keys.map((k) => ({
      id: k.id,
      unitName: k.unit_name,
      project: k.project,
      date: k.key_date,
      slot: k.key_slot,
    })),
    snagsOpen: counts?.snags_open ?? 0,
    snagsReopened: counts?.snags_reopened ?? 0,
  };
}

/** Units managed today, tenants' repairs waiting for approval (A1), and last month's statements still due. */
export async function managedSection(
  db: D1Database,
  partnerId: string,
  now: number,
): Promise<Section<'managed'>> {
  const today = dubaiDate(now);
  const month = previousMonth(monthOf(now));
  const lastDay = addDays(dubaiDate(monthRange(month).end), -1);
  const { results: units } = await db
    .prepare(
      `SELECT m.id, m.sf_unit_id, m.since, ou.unit_name, ou.project,
         (SELECT count(*) FROM requests q WHERE q.sf_unit_id = m.sf_unit_id AND q.status = 'awaiting_owner'
            AND q.tenancy_id IS NOT NULL) AS waiting,
         (SELECT count(*) FROM managed_statements s WHERE s.managed_unit_id = m.id AND s.month = ?3) AS statements
       FROM managed_units m
       LEFT JOIN owner_units ou ON ou.rowid =
         (SELECT x.rowid FROM owner_units x WHERE x.sf_unit_id = m.sf_unit_id ORDER BY x.synced_at DESC LIMIT 1)
       WHERE m.provider_id = ?1 AND ${managedNowSql('m', '?2')} ORDER BY ou.unit_name, m.since`,
    )
    .bind(partnerId, today, month)
    .all<{
      id: string;
      sf_unit_id: string;
      since: string;
      unit_name: string | null;
      project: string | null;
      waiting: number;
      statements: number;
    }>();
  return {
    units: units.length,
    approvalsWaiting: units.reduce((n, u) => n + u.waiting, 0),
    // Due when the unit was managed during last month (from its last day at the latest) and has none for it.
    statementsDue: units
      .filter((u) => u.since <= lastDay && u.statements === 0)
      .map((u) => ({ id: u.id, unitName: u.unit_name, project: u.project })),
    statementMonth: month,
  };
}

/** Open consultations by stage, per service, and first calls due today or overdue (O5, P5, S4). */
export async function consultationsSection(
  db: D1Database,
  partnerId: string,
  now: number,
): Promise<Section<'consultations'>> {
  const open = (await loadConsultations(db, partnerId, now)).filter((c) => OPEN_STATUSES.has(c.status));
  const dayEnd = dubaiDay(dubaiDate(now)).end;
  const codes = SERVICES.filter((s) => open.some((c) => c.serviceCode === s.code));
  let today = 0;
  let overdue = 0;
  for (const c of open) {
    const state = firstCallState(firstCallDue(c), now, dayEnd);
    if (state === 'today') today += 1;
    if (state === 'overdue') overdue += 1;
  }
  return {
    byService: codes.map((s) => {
      const mine = open.filter((c) => c.serviceCode === s.code);
      return {
        serviceCode: s.code,
        serviceName: s.name,
        columns: consultationColumns(s.code).map((col) => ({
          ...col,
          count: mine.filter((c) => consultationColumn(c.serviceCode, c.steps) === col.id).length,
        })),
      };
    }),
    firstCallsDueToday: today,
    firstCallsOverdue: overdue,
  };
}

/** Reports due (and overdue), reports uploaded this month, open snags on its own inspections (O3, S4). */
export async function reportsSection(
  db: D1Database,
  partnerId: string,
  now: number,
): Promise<Section<'reports'>> {
  const list = await loadInspections(db, partnerId, now);
  const due = list.filter((i) => inspectionGroup(i) === 'report_due');
  const { start } = monthRange(monthOf(now));
  const uploaded = await db
    .prepare('SELECT count(*) AS n FROM request_reports WHERE partner_id = ? AND uploaded_at >= ?')
    .bind(partnerId, start)
    .first<{ n: number }>();
  return {
    due: due.length,
    overdue: due.filter((i) => i.nextDueAt !== null && i.nextDueAt < now).length,
    uploadedThisMonth: uploaded?.n ?? 0,
    snagsOpen: list.reduce((n, i) => n + (OPEN_STATUSES.has(i.status) ? i.snagsOpen : 0), 0),
  };
}

/** The next investor session with its seats, and books owners asked for that are not sent yet (O5). */
export async function educationSection(db: D1Database, now: number): Promise<Section<'education'>> {
  const next = await db
    .prepare(
      `SELECT s.id, s.title, s.starts_at, s.seats,
         (SELECT count(*) FROM education_bookings b WHERE b.session_id = s.id AND b.cancelled_at IS NULL) AS taken
       FROM education_sessions s WHERE s.starts_at > ? AND s.cancelled_at IS NULL ORDER BY s.starts_at LIMIT 1`,
    )
    .bind(now)
    .first<{ id: string; title: string; starts_at: number; seats: number; taken: number }>();
  const books = await db
    .prepare("SELECT count(*) AS n FROM education_book_requests WHERE status = 'requested'")
    .first<{ n: number }>();
  return {
    nextSession:
      next === null
        ? null
        : { id: next.id, title: next.title, startsAt: next.starts_at, seats: next.seats, booked: next.taken },
    booksToSend: books?.n ?? 0,
  };
}
