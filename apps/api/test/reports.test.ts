/** Flow B reports (ADR 0032): O3, S4, L2, C-UPL-1, C-AZ-1, C-AZ-2, C-AUD-1. */
import {
  ownerReportsResponse,
  reportUploadedResponse,
  requestDetailResponse,
  requestRaisedResponse,
  requestReportResponse,
} from '@jadplus/shared';
import { describe, expect, it } from 'vitest';
import { SF_UNIT } from './db.js';
import { rows } from './emergency-world.js';
import { inspect, pdf, post, raiseReport, reportWorld, upload, type ReportWorld } from './reports-world.js';

const HOUR = 3_600_000;

const sendReport = (w: ReportWorld, id: string, token: string, body = pdf(), type = 'application/pdf') =>
  upload(w, `/api/requests/${id}/report`, token, body, type);

const report = async (w: ReportWorld, id: string, token: string) =>
  requestReportResponse.parse(await (await w.h.request(`/api/requests/${id}/report`, { token })).json());

const status = (w: ReportWorld, id: string) =>
  rows(w, 'SELECT status, next_due_kind, next_due_at FROM requests WHERE id = ?', id)[0];

describe('snagging choice (O3)', () => {
  it('O3: soft snagging goes to the JAD Global handover team, professional to the inspector', async () => {
    const w = await reportWorld();
    const soft = await raiseReport(w, 'snagging', 'soft');
    const pro = await raiseReport(w, 'snagging', 'professional');
    expect(rows(w, 'SELECT partner_id FROM requests WHERE id = ?', soft)).toEqual([
      { partner_id: 'p-handover' },
    ]);
    expect(rows(w, 'SELECT partner_id FROM requests WHERE id = ?', pro)).toEqual([
      { partner_id: 'p-inspector' },
    ]);
    expect(rows(w, 'SELECT service, snagging_type FROM report_requests ORDER BY snagging_type')).toEqual([
      { service: 'snagging', snagging_type: 'professional' },
      { service: 'snagging', snagging_type: 'soft' },
    ]);
    expect((await report(w, soft, w.ownerToken)).snaggingType).toBe('soft');
  });

  it('O3: without a handover team, soft snagging is "coming soon"; the choice is for snagging only', async () => {
    const w = await reportWorld();
    w.h.sqlite.prepare("UPDATE service_partners SET ended_at = started_at WHERE id = 'sp-handover'").run();
    const res = await post(w, '/api/requests', w.ownerToken, {
      sfUnitId: SF_UNIT,
      serviceCode: 'snagging',
      snaggingType: 'soft',
      description: 'Soft snagging please.',
      preferredDate: '2026-11-10',
      preferredSlot: 'morning',
    });
    expect(res.status).toBe(422);
    const wrong = await post(w, '/api/requests', w.ownerToken, {
      sfUnitId: SF_UNIT,
      serviceCode: 'maintenance',
      snaggingType: 'soft',
      description: 'Tap.',
      preferredDate: '2026-11-10',
      preferredSlot: 'morning',
    });
    expect(wrong.status).toBe(400);
  });
});

describe('report upload (O3, C-UPL-1)', () => {
  it('O3/C-UPL-1: a PDF only (sniffed), 20 MB at most, from the provider of the job only', async () => {
    const w = await reportWorld();
    const id = await raiseReport(w, 'snagging');
    await inspect(w, id, w.inspectorOffice, 't-inspector');
    expect((await sendReport(w, id, w.inspectorOffice, pdf(), 'image/png')).status).toBe(415);
    const fake = new TextEncoder().encode('<html>not a pdf</html>') as Uint8Array<ArrayBuffer>;
    expect((await sendReport(w, id, w.inspectorOffice, fake)).status).toBe(415);
    expect((await sendReport(w, id, w.inspectorOffice, pdf(20 * 1024 * 1024 + 1))).status).toBe(413);
    // C-AZ-2: another partner cannot tell the job exists; residents and staff cannot upload.
    expect((await sendReport(w, id, w.primaryToken)).status).toBe(404);
    expect((await sendReport(w, id, w.ownerToken)).status).toBe(403);
    expect((await sendReport(w, id, w.admin)).status).toBe(403);
    expect(rows(w, 'SELECT count(*) AS n FROM request_reports')).toEqual([{ n: 0 }]);
  });

  it('O3: the snagging report must follow the inspection; without snags it finishes the request', async () => {
    const w = await reportWorld();
    const id = await raiseReport(w, 'snagging');
    expect((await sendReport(w, id, w.inspectorOffice)).status).toBe(409);
    await inspect(w, id, w.inspectorOffice, 't-inspector');
    const res = await sendReport(w, id, w.inspectorTech);
    expect(res.status).toBe(201);
    expect(reportUploadedResponse.parse(await res.json())).toMatchObject({
      kind: 'snagging',
      status: 'completed',
    });
    expect((await sendReport(w, id, w.inspectorOffice)).status).toBe(409);
    const stored = rows(w, 'SELECT kind, byte_size, partner_id, length(sha256) AS h FROM request_reports');
    expect(stored).toEqual([{ kind: 'snagging', byte_size: 600, partner_id: 'p-inspector', h: 32 }]);
    expect(rows(w, "SELECT count(*) AS n FROM audit_log WHERE action = 'report_uploaded'")).toEqual([
      { n: 1 },
    ]);
    // The owner confirms the report (no "not done"); confirming closes it.
    const detail = requestDetailResponse.parse(
      await (await w.h.request(`/api/requests/${id}`, { token: w.ownerToken })).json(),
    );
    expect(detail.actions).toEqual(['confirm_done']);
  });

  it('O3: a valuation may be reported without a visit; L2 line on it', async () => {
    const w = await reportWorld();
    const id = await raiseReport(w, 'valuation');
    expect(rows(w, 'SELECT partner_id FROM requests WHERE id = ?', id)).toEqual([{ partner_id: 'p-valuer' }]);
    const res = await sendReport(w, id, w.valuerOffice);
    expect(res.status).toBe(201);
    expect(status(w, id)).toMatchObject({ status: 'completed', next_due_kind: null });
    const view = await report(w, id, w.ownerToken);
    expect(view.disclaimer).toBe('Indicative valuation, not a formal appraisal.');
    expect(view.reports.map((r) => r.kind)).toEqual(['valuation']);
    expect(view.reportDueAt).toBeNull();
    // S4/S5: delivered within 3 working days, counted as the service milestone.
    expect(rows(w, 'SELECT metric, outcome FROM sla_outcomes WHERE request_id = ?', id)).toEqual([
      { metric: 'service_milestone', outcome: 'met' },
    ]);
  });
});

describe('report deadlines (S4)', () => {
  it('S4: snagging report due 24 hours after the inspection starts; valuation keeps 3 working days', async () => {
    const w = await reportWorld();
    const id = await raiseReport(w, 'snagging');
    expect(status(w, id)).toMatchObject({ next_due_kind: 'snagging_booking' });
    await inspect(w, id, w.inspectorOffice, 't-inspector');
    expect(status(w, id)).toEqual({
      status: 'in_progress',
      next_due_kind: 'snagging_report',
      next_due_at: w.h.clock + 24 * HOUR,
    });
    expect((await report(w, id, w.inspectorOffice)).reportDueAt).toBe(w.h.clock + 24 * HOUR);
    expect((await report(w, id, w.ownerToken)).reportDueAt).toBeNull();

    const v = await raiseReport(w, 'valuation');
    const due = status(w, v) as { next_due_at: number };
    w.h.sqlite
      .prepare(
        "INSERT INTO technicians (id, partner_id, user_id, created_at) SELECT 't-valuer', 'p-valuer', id, 1 FROM users LIMIT 1",
      )
      .run();
    await inspect(w, v, w.valuerOffice, 't-valuer');
    expect(status(w, v)).toEqual({
      status: 'in_progress',
      next_due_kind: 'valuation_report',
      next_due_at: due.next_due_at,
    });
  });

  it('S4: an overdue report shows in JAD+ Admin "Needs action"', async () => {
    const w = await reportWorld();
    const id = await raiseReport(w, 'snagging');
    await inspect(w, id, w.inspectorOffice, 't-inspector');
    w.h.clock += 25 * HOUR;
    const admin = await w.h.signIn('demo@jadplus.ae', 'console');
    const res = await w.h.request('/api/admin/attention', { token: admin });
    expect(JSON.stringify(await res.json())).toContain(id);
  });
});

describe('report access and download (C-AZ-1, C-AZ-2, C-AUD-1)', () => {
  it('C-AUD-1: owner, provider and staff download the PDF, each download audited; tenant and others never', async () => {
    const w = await reportWorld();
    const id = await raiseReport(w, 'valuation');
    await sendReport(w, id, w.valuerOffice);
    const { reports } = ownerReportsResponse.parse(
      await (await w.h.request('/api/me/reports', { token: w.ownerToken })).json(),
    );
    expect(reports).toMatchObject([
      { requestId: id, sfUnitId: SF_UNIT, service: 'valuation', kind: 'valuation' },
    ]);
    const file = `/api/requests/${id}/report/${reports[0]?.id ?? ''}/file`;
    for (const token of [w.ownerToken, w.valuerOffice, w.admin, w.viewer]) {
      const res = await w.h.request(file, { token });
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe('application/pdf');
      expect(res.headers.get('cache-control')).toContain('no-store');
      expect(String.fromCharCode(...new Uint8Array(await res.arrayBuffer()).subarray(0, 5))).toBe('%PDF-');
    }
    expect(
      rows(w, "SELECT actor_role FROM audit_log WHERE action = 'report_downloaded' ORDER BY rowid"),
    ).toEqual([
      { actor_role: 'owner' },
      { actor_role: 'partner_admin' },
      { actor_role: 'jad_admin' },
      { actor_role: 'jad_viewer' },
    ]);
    expect((await w.h.request(file, { token: w.tenantToken })).status).toBe(403);
    expect((await w.h.request(`/api/requests/${id}/report`, { token: w.tenantToken })).status).toBe(403);
    expect((await w.h.request('/api/me/reports', { token: w.tenantToken })).status).toBe(403);
    expect((await w.h.request(file, { token: w.primaryToken })).status).toBe(404);
    expect((await w.h.request(file, { token: w.inspectorOffice })).status).toBe(404);
  });

  it('a request of another flow has no report side', async () => {
    const w = await reportWorld();
    const res = await post(w, '/api/requests', w.ownerToken, {
      sfUnitId: SF_UNIT,
      serviceCode: 'maintenance',
      description: 'Tap.',
      preferredDate: '2026-11-10',
      preferredSlot: 'morning',
    });
    const { requestId } = requestRaisedResponse.parse(await res.json());
    expect(await report(w, requestId, w.ownerToken)).toMatchObject({
      service: null,
      reports: [],
      actions: [],
    });
  });
});
