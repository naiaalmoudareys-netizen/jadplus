/**
 * Flow B facts from the database (ADR 0032; O3, S4): the request's report side (snagging choice, reports on
 * file, the re-inspection), its snag statuses, and the deadlines the visit steps set on a report request.
 * Shared by the report, snag and partner visit routes.
 */
import {
  OPEN_STATUSES,
  canActOnRequest,
  dubaiDate,
  dueAfterBooking,
  dueAfterInspection,
  reportActions,
  reportServiceOf,
  type Due,
  type ReportAction,
  type ReportKind,
  type ReportService,
  type ReportState,
  type SnaggingType,
  type SnagStatus,
} from '@jadplus/shared';
import type { Context } from 'hono';
import type { AppEnv } from '../env.js';
import { ApiError } from '../errors.js';
import { readFlowRow, type FlowRow } from './flow.js';
import { requestFacts } from './store.js';

type Ctx = Context<AppEnv>;

export interface ReportRow {
  id: string;
  kind: ReportKind;
  uploaded_at: number;
  byte_size: number;
}

export interface ReportFacts {
  readonly service: ReportService;
  readonly snaggingType: SnaggingType | null;
  readonly reinspectionRequestedAt: number | null;
  readonly reports: readonly ReportRow[];
}

/** The report side of a request, or null when its service runs another flow. */
export async function reportFacts(db: D1Database, requestId: string): Promise<ReportFacts | null> {
  const head = await db
    .prepare(
      `SELECT r.service_code, rr.snagging_type, rr.reinspection_requested_at
       FROM requests r LEFT JOIN report_requests rr ON rr.request_id = r.id WHERE r.id = ?`,
    )
    .bind(requestId)
    .first<{
      service_code: string;
      snagging_type: SnaggingType | null;
      reinspection_requested_at: number | null;
    }>();
  const service = head === null ? null : reportServiceOf(head.service_code);
  if (head === null || service === null) return null;
  const { results } = await db
    .prepare(
      'SELECT id, kind, uploaded_at, byte_size FROM request_reports WHERE request_id = ? ORDER BY uploaded_at, rowid',
    )
    .bind(requestId)
    .all<ReportRow>();
  return {
    service,
    // A snagging request raised before the choice existed went to the snagging provider (professional).
    snaggingType: service === 'snagging' ? (head.snagging_type ?? 'professional') : null,
    reinspectionRequestedAt: head.reinspection_requested_at,
    reports: results,
  };
}

/** The statuses of the snags on the list (removed ones left out). */
export async function snagStatuses(db: D1Database, requestId: string): Promise<SnagStatus[]> {
  const { results } = await db
    .prepare('SELECT status FROM snags WHERE request_id = ? AND removed_at IS NULL')
    .bind(requestId)
    .all<{ status: SnagStatus }>();
  return results.map((s) => s.status);
}

export function reportState(
  status: FlowRow['status'],
  facts: ReportFacts,
  snags: readonly SnagStatus[],
): ReportState {
  const has = (kind: ReportKind) => facts.reports.some((r) => r.kind === kind);
  return {
    service: facts.service,
    status,
    reported: has('snagging') || has('valuation'),
    reinspectionRequested: facts.reinspectionRequestedAt !== null,
    reinspectionReported: has('reinspection'),
    snags,
  };
}

export interface ReportFlow {
  readonly row: FlowRow;
  readonly facts: ReportFacts;
  readonly state: ReportState;
}

/** The report request with its state; 404 when the person may not see it or it runs another flow. */
export async function loadReport(c: Ctx, id: string): Promise<ReportFlow> {
  const db = c.env.DB;
  const row = await readFlowRow(db, id);
  const facts = row === null ? null : await reportFacts(db, id);
  if (row === null || facts === null) throw new ApiError(404, 'Not found.');
  return { row, facts, state: reportState(row.status, facts, await snagStatuses(db, id)) };
}

/**
 * The report request if the signed-in person may act on it (C-AZ-2: a provider only on its own job, an owner
 * only on their own request) AND take `action` now (reports.ts). Not theirs: 404. Not now: 409.
 */
export async function loadReportForAction(c: Ctx, id: string, action: ReportAction): Promise<ReportFlow> {
  const flow = await loadReport(c, id);
  const actor = c.get('auth');
  if (!canActOnRequest(actor, await requestFacts(c.env.DB, flow.row), dubaiDate(c.get('now')))) {
    throw new ApiError(404, 'Not found.');
  }
  if (!reportActions(actor.role, flow.state).includes(action)) {
    throw new ApiError(409, 'This step is not possible for this request now. Refresh and try again.');
  }
  return flow;
}

/** Whether the request is still open (snags can be fixed and decided only then). */
export function stillOpen(row: FlowRow): boolean {
  return OPEN_STATUSES.has(row.status);
}

const currentDue = (row: FlowRow): Due | null =>
  row.next_due_at === null || row.next_due_kind === null
    ? null
    : { at: row.next_due_at, kind: row.next_due_kind };

/**
 * S4: the deadline after the provider books a visit. The visit journey waits for the visit's end; a valuation
 * keeps its report deadline (reports.ts dueAfterBooking).
 */
export async function bookedDue(db: D1Database, row: FlowRow, windowEnd: number): Promise<Due> {
  const facts = row.flow === 'report' ? await reportFacts(db, row.id) : null;
  return facts === null
    ? { at: windowEnd, kind: 'visit' }
    : dueAfterBooking(facts.service, windowEnd, currentDue(row));
}

/**
 * S4: the deadline once the visit starts. None in the visit journey; on a report request the report is due
 * within 24 hours of the inspection (snagging, re-inspection), and a valuation keeps its own.
 */
export async function startedDue(db: D1Database, row: FlowRow, now: number): Promise<Due | null> {
  const facts = row.flow === 'report' ? await reportFacts(db, row.id) : null;
  if (facts === null) return null;
  return dueAfterInspection(facts.service, facts.reinspectionRequestedAt !== null, now, currentDue(row));
}
