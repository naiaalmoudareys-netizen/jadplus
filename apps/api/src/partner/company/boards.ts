/**
 * The work boards of a provider workspace (ADR 0036), partner_admin, own company only (C-AZ-2):
 *
 * - GET /api/partner/consultations   the consultations pipeline (O5, P5): open ones and those finished in the
 *                                    last 30 days, with the steps recorded and the first-call deadline (S4)
 * - GET /api/partner/inspections     inspections and reports (O3, S4): open ones and those finished in the last
 *                                    30 days, with the reports on file and the open snags
 *
 * Units are named by unit and project only, never the owner: the owner's details open only on the request page,
 * where the consent is checked and every look is audited (ADR 0031).
 */
import {
  type PartnerConsultation,
  type PartnerInspection,
  type ReportKind,
  type ReportService,
  type SnaggingType,
  type Status,
} from '@jadplus/shared';
import type { Hono } from 'hono';
import { requireRole } from '../../auth/middleware.js';
import type { AppEnv } from '../../env.js';
import { LOCATION_JOIN } from '../../requests/views.js';
import { workspacePage } from '../workspace.js';
import { DAY, OPEN_SQL, companyOf } from './common.js';

/** How long a finished consultation or inspection stays on its board. */
const RECENT_DAYS = 30;

/** Open requests of the company, or finished ones changed since `since`. */
const IN_REACH = `r.partner_id = ?1 AND (r.status IN (${OPEN_SQL}) OR r.status_changed_at >= ?2)`;

export async function loadConsultations(
  db: D1Database,
  partnerId: string,
  now: number,
): Promise<PartnerConsultation[]> {
  const { results } = await db
    .prepare(
      `SELECT r.id, r.ref, r.service_code, r.status, r.next_due_at, r.created_at, ou.unit_name, ou.project
       FROM requests r JOIN consultations c ON c.request_id = r.id ${LOCATION_JOIN}
       WHERE ${IN_REACH} ORDER BY r.created_at LIMIT 300`,
    )
    .bind(partnerId, now - RECENT_DAYS * DAY)
    .all<{
      id: string;
      ref: string;
      service_code: string;
      status: Status;
      next_due_at: number | null;
      created_at: number;
      unit_name: string | null;
      project: string | null;
    }>();
  // The steps of the same requests, in one query bound to the company (no id list: D1 limits bound values).
  const { results: steps } = await db
    .prepare(
      `SELECT s.request_id, s.step, s.at FROM consultation_steps s JOIN requests r ON r.id = s.request_id
       WHERE ${IN_REACH} ORDER BY s.at, s.rowid`,
    )
    .bind(partnerId, now - RECENT_DAYS * DAY)
    .all<{ request_id: string; step: string; at: number }>();
  return results.map((r) => {
    const own = steps.filter((s) => s.request_id === r.id);
    return {
      id: r.id,
      ref: r.ref,
      serviceCode: r.service_code,
      unitName: r.unit_name,
      project: r.project,
      status: r.status,
      steps: own.map((s) => s.step),
      lastStepAt: own.at(-1)?.at ?? null,
      nextDueAt: r.next_due_at,
      createdAt: r.created_at,
    };
  });
}

export async function loadInspections(
  db: D1Database,
  partnerId: string,
  now: number,
): Promise<PartnerInspection[]> {
  const { results } = await db
    .prepare(
      `SELECT r.id, r.ref, r.status, r.next_due_at, r.next_due_kind, r.created_at, rr.service, rr.snagging_type,
         rr.reinspection_requested_at, ou.unit_name, ou.project,
         (SELECT count(*) FROM snags s WHERE s.request_id = r.id AND s.status = 'open' AND s.removed_at IS NULL)
           AS snags_open
       FROM requests r JOIN report_requests rr ON rr.request_id = r.id ${LOCATION_JOIN}
       WHERE ${IN_REACH} ORDER BY r.next_due_at IS NULL, r.next_due_at, r.created_at LIMIT 300`,
    )
    .bind(partnerId, now - RECENT_DAYS * DAY)
    .all<{
      id: string;
      ref: string;
      status: Status;
      next_due_at: number | null;
      next_due_kind: string | null;
      created_at: number;
      service: ReportService;
      snagging_type: SnaggingType | null;
      reinspection_requested_at: number | null;
      unit_name: string | null;
      project: string | null;
      snags_open: number;
    }>();
  const { results: reports } = await db
    .prepare(
      `SELECT x.request_id, x.kind, x.uploaded_at FROM request_reports x JOIN requests r ON r.id = x.request_id
       WHERE ${IN_REACH} ORDER BY x.uploaded_at`,
    )
    .bind(partnerId, now - RECENT_DAYS * DAY)
    .all<{ request_id: string; kind: ReportKind; uploaded_at: number }>();
  return results.map((r) => ({
    id: r.id,
    ref: r.ref,
    service: r.service,
    snaggingType: r.snagging_type,
    unitName: r.unit_name,
    project: r.project,
    status: r.status,
    nextDueAt: r.next_due_at,
    nextDueKind: r.next_due_kind,
    reports: reports
      .filter((x) => x.request_id === r.id)
      .map((x) => ({ kind: x.kind, uploadedAt: x.uploaded_at })),
    reinspectionRequested: r.reinspection_requested_at !== null,
    snagsOpen: r.snags_open,
    createdAt: r.created_at,
  }));
}

export function registerBoards(r: Hono<AppEnv>): void {
  const office = requireRole('partner_admin');

  r.get('/consultations', office, workspacePage('consultations'), async (c) =>
    c.json({ consultations: await loadConsultations(c.env.DB, companyOf(c), c.get('now')) }),
  );

  r.get('/inspections', office, workspacePage('inspections'), async (c) =>
    c.json({ inspections: await loadInspections(c.env.DB, companyOf(c), c.get('now')) }),
  );
}
