/**
 * Flow B, inspection with a report (ADR 0032; O3, S4, L2):
 *
 * - GET  /api/requests/:id/report                     the report side: snagging choice, reports on file, the
 *                                                     re-inspection, the L2 line, the person's steps
 * - POST /api/requests/:id/report                     the provider uploads the report PDF (raw body, 20 MB at
 *                                                     most, "%PDF-" sniffed); one of each kind per request
 * - GET  /api/requests/:id/report/:reportId/file      the PDF, after the access check; every download audited
 * - POST /api/requests/:id/reinspection               the owner asks for the one free re-inspection
 * - GET  /api/me/reports                              every report on the owner's requests (My unit → Documents)
 *
 * Reports are the owner's: tenants never see them (R2). A provider sees only its own jobs and JAD+ staff see
 * all (C-AZ-2). The client's file name is never stored; the file stays in private R2 (C-UPL-1, C-PD-3).
 */
import {
  REPORT_DUE_KINDS,
  REPORT_MAX_BYTES,
  VALUATION_DISCLAIMER,
  isPdf,
  reinspectionBookingDue,
  reportActions,
  reportFileParam,
  reportMilestone,
  reportServiceOf,
  reportUpload,
  requestIdParam,
  slaMet,
  type ReportService,
} from '@jadplus/shared';
import { Hono } from 'hono';
import { auditStatement } from '../audit.js';
import { requireRole } from '../auth/middleware.js';
import { newId } from '../crypto.js';
import type { AppEnv } from '../env.js';
import { ApiError } from '../errors.js';
import { parseParams } from '../validate.js';
import { withConflictCheck } from './concurrency.js';
import { loadReport, loadReportForAction, reportFacts, type ReportRow } from './report-store.js';
import { visibleRequest } from './resident.js';
import { changeStatements } from './transition.js';
import { LOCATION_JOIN } from './views.js';

/** Matches the upload route, which gets a 20 MB body limit instead of the API's 64 KB (app.ts). */
export const REPORT_UPLOAD_PATH = /^\/api\/requests\/[A-Za-z0-9_-]{1,64}\/report$/;

const TOO_LARGE = 'Reports can be up to 20 MB.';

/** Who sees the report deadline: the provider and JAD+ staff, never the owner (S8). */
const DUE_ROLES: ReadonlySet<string> = new Set(['partner', 'partner_admin', 'jad_admin', 'jad_viewer']);
const DUE_KINDS: ReadonlySet<string> = new Set(REPORT_DUE_KINDS);

async function digest(bytes: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
}

const toFile = (r: ReportRow) => ({
  id: r.id,
  kind: r.kind,
  uploadedAt: r.uploaded_at,
  byteSize: r.byte_size,
});

export function reportRoutes(): Hono<AppEnv> {
  const r = new Hono<AppEnv>();

  r.get(
    '/requests/:id/report',
    requireRole('owner', 'partner', 'partner_admin', 'jad_admin', 'jad_viewer'),
    async (c) => {
      const { id } = parseParams(c, requestIdParam);
      await visibleRequest(c, id);
      const role = c.get('auth').role;
      if ((await reportFacts(c.env.DB, id)) === null) {
        return c.json({
          service: null,
          snaggingType: null,
          reports: [],
          reinspectionRequestedAt: null,
          disclaimer: null,
          actions: [],
          reportDueAt: null,
        });
      }
      const { row, facts, state } = await loadReport(c, id);
      const due =
        DUE_ROLES.has(role) && row.next_due_kind !== null && DUE_KINDS.has(row.next_due_kind)
          ? row.next_due_at
          : null;
      return c.json({
        service: facts.service,
        snaggingType: facts.snaggingType,
        reports: facts.reports.map(toFile),
        reinspectionRequestedAt: facts.reinspectionRequestedAt,
        disclaimer: facts.service === 'valuation' ? VALUATION_DISCLAIMER : null,
        actions: role === 'jad_viewer' ? [] : reportActions(role, state),
        reportDueAt: due,
      });
    },
  );

  r.post('/requests/:id/report', requireRole('partner', 'partner_admin'), async (c) => {
    const { id } = parseParams(c, requestIdParam);
    const { row, state } = await loadReportForAction(c, id, 'upload_report');
    const declared = (c.req.header('content-type') ?? '').split(';')[0]?.trim().toLowerCase();
    const bytes = new Uint8Array(await c.req.arrayBuffer());
    if (bytes.length === 0 || bytes.length > REPORT_MAX_BYTES) throw new ApiError(413, TOO_LARGE);
    if (declared !== 'application/pdf' || !isPdf(bytes)) throw new ApiError(415, 'Please upload a PDF.');
    const db = c.env.DB;
    const actor = c.get('auth');
    const now = c.get('now');
    // loadReportForAction checked the job is this provider's, so the request has this partner.
    const partnerId = row.partner_id ?? '';
    const outcome = reportUpload(state);
    const reportId = newId();
    const key = `requests/${id}/reports/${reportId}.pdf`;
    await c.env.MEDIA.put(key, bytes, { httpMetadata: { contentType: 'application/pdf' } });
    const milestone =
      reportMilestone(row.next_due_kind) && row.next_due_at !== null
        ? [
            db
              .prepare(
                `INSERT OR IGNORE INTO sla_outcomes (id, request_id, partner_id, metric, due_at, met_at, outcome, recorded_at)
                 VALUES (?, ?, ?, 'service_milestone', ?, ?, ?, ?)`,
              )
              .bind(
                newId(),
                id,
                partnerId,
                row.next_due_at,
                slaMet(row.next_due_at, now) ? now : null,
                slaMet(row.next_due_at, now) ? 'met' : 'missed',
                now,
              ),
          ]
        : [];
    await withConflictCheck(async () =>
      db.batch([
        ...changeStatements(c, row, {
          to: outcome.to,
          nextDue: null,
          audit: 'report_uploaded',
          detail: { kind: outcome.kind, bytes: bytes.length },
        }),
        db
          .prepare(
            `INSERT INTO request_reports (id, request_id, kind, r2_key, byte_size, sha256, partner_id, uploaded_by_user_id, uploaded_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            reportId,
            id,
            outcome.kind,
            key,
            bytes.length,
            await digest(bytes),
            partnerId,
            actor.userId,
            now,
          ),
        // The inspection is over: a visit that took place is done; one booked but not made is called off.
        db.prepare("UPDATE visits SET status = 'done' WHERE request_id = ? AND status = 'arrived'").bind(id),
        db
          .prepare(
            "UPDATE visits SET status = 'cancelled' WHERE request_id = ? AND status IN ('booked', 'on_the_way')",
          )
          .bind(id),
        ...(outcome.to === 'completed'
          ? [
              db
                .prepare(
                  'UPDATE requests SET arrival_window_start = NULL, arrival_window_end = NULL WHERE id = ?',
                )
                .bind(id),
            ]
          : []),
        ...milestone,
      ]),
    );
    return c.json({ id: reportId, kind: outcome.kind, status: outcome.to }, 201);
  });

  r.get(
    '/requests/:id/report/:reportId/file',
    requireRole('owner', 'partner', 'partner_admin', 'jad_admin', 'jad_viewer'),
    async (c) => {
      const { id, reportId } = parseParams(c, reportFileParam);
      await visibleRequest(c, id);
      const report = await c.env.DB.prepare(
        'SELECT kind, r2_key FROM request_reports WHERE id = ? AND request_id = ?',
      )
        .bind(reportId, id)
        .first<{ kind: string; r2_key: string }>();
      const object = report === null ? null : await c.env.MEDIA.get(report.r2_key);
      if (report === null || object === null) throw new ApiError(404, 'Not found.');
      const actor = c.get('auth');
      await auditStatement(c.env.DB, {
        at: c.get('now'),
        actorUserId: actor.userId,
        actorRole: actor.role,
        action: 'report_downloaded',
        targetType: 'request_report',
        targetId: reportId,
        ipHash: c.get('ipHash'),
        httpRequestId: c.get('requestId'),
        detail: { kind: report.kind },
      }).run();
      return new Response(object.body, {
        headers: {
          'content-type': 'application/pdf',
          'content-disposition': 'attachment; filename="report.pdf"',
          'cache-control': 'private, no-store',
        },
      });
    },
  );

  r.post('/requests/:id/reinspection', requireRole('owner'), async (c) => {
    const { id } = parseParams(c, requestIdParam);
    const { row } = await loadReportForAction(c, id, 'request_reinspection');
    const db = c.env.DB;
    const actor = c.get('auth');
    const now = c.get('now');
    await withConflictCheck(() =>
      db.batch([
        // Back to the provider, who books the re-inspection within 48 hours (S4).
        ...changeStatements(c, row, {
          to: 'reopened',
          nextDue: reinspectionBookingDue(now),
          audit: 'reinspection_requested',
        }),
        // Once per request: the table's trigger refuses a second re-inspection.
        db
          .prepare(
            `INSERT INTO report_requests (request_id, service, snagging_type, reinspection_requested_at, reinspection_requested_by, created_at)
             VALUES (?, 'snagging', 'professional', ?, ?, ?)
             ON CONFLICT (request_id) DO UPDATE SET reinspection_requested_at = excluded.reinspection_requested_at,
               reinspection_requested_by = excluded.reinspection_requested_by`,
          )
          .bind(id, now, actor.userId, now),
      ]),
    );
    return c.json({ id, status: 'reopened' });
  });

  r.get('/me/reports', requireRole('owner'), async (c) => {
    const { results } = await c.env.DB.prepare(
      `SELECT rp.id, rp.kind, rp.uploaded_at, rp.byte_size, r.id AS request_id, r.ref, r.sf_unit_id, r.service_code,
              ou.unit_name
       FROM request_reports rp JOIN requests r ON r.id = rp.request_id ${LOCATION_JOIN}
       WHERE r.owner_user_id = ? ORDER BY rp.uploaded_at DESC, rp.rowid DESC LIMIT 200`,
    )
      .bind(c.get('auth').userId)
      .all<
        ReportRow & {
          request_id: string;
          ref: string;
          sf_unit_id: string;
          service_code: string;
          unit_name: string | null;
        }
      >();
    return c.json({
      reports: results.flatMap((x) => {
        const service: ReportService | null = reportServiceOf(x.service_code);
        return service === null
          ? []
          : [
              {
                ...toFile(x),
                requestId: x.request_id,
                ref: x.ref,
                sfUnitId: x.sf_unit_id,
                unitName: x.unit_name,
                service,
              },
            ];
      }),
    });
  });

  return r;
}
