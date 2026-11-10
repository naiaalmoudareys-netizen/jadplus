/** JAD+ Admin: people, accounts, tenancies, desk queue, staff, audit log, reports (ADR 0025; U5, U9, C-AUD-1). */
import {
  adminAuditResponse,
  adminDeskDetailResponse,
  adminDeskQueueResponse,
  adminMonthlyReportResponse,
  adminPeopleResponse,
  adminPersonResponse,
  adminStaffResponse,
} from '@jadplus/shared';
import { describe, expect, it } from 'vitest';
import { importKeys } from '../src/crypto.js';
import { demoDeskRequests } from '../src/portal/desk.js';
import { NOW } from './db.js';
import { TEST_DATA_KEY, TEST_INDEX_KEY } from './harness.js';
import { EMAILS, leak, raise, rows, world, type World } from './emergency-world.js';

const ADMIN = 'demo@jadplus.ae';
const VIEWER = 'viewer@jadplus.ae';

const post = (w: World, path: string, token: string, json: object = {}) =>
  w.h.request(path, { method: 'POST', token, json });
const get = (w: World, path: string, token: string) => w.h.request(path, { token });

async function staff(w: World): Promise<{ admin: string; viewer: string; adminId: string }> {
  const adminId = await w.h.addUser({ email: ADMIN, roles: ['jad_admin'] });
  await w.h.addUser({ email: VIEWER, roles: ['jad_viewer'] });
  return { admin: await w.h.signIn(ADMIN, 'console'), viewer: await w.h.signIn(VIEWER, 'console'), adminId };
}

describe('people', () => {
  it('C-PD-2: found by exact email or by unit name; every look at a person is audited without personal data', async () => {
    const w = await world();
    const { viewer } = await staff(w);
    const byEmail = adminPeopleResponse.parse(
      await (
        await get(w, `/api/admin/people?q=${encodeURIComponent(EMAILS.owner.toUpperCase())}`, viewer)
      ).json(),
    );
    expect(byEmail.people.map((p) => [p.id, p.email, p.roles.map((r) => r.role)])).toEqual([
      [w.owner, EMAILS.owner, ['owner']],
    ]);
    const byUnit = adminPeopleResponse.parse(
      await (await get(w, '/api/admin/people?q=jad288-1100', viewer)).json(),
    );
    expect(byUnit.people.map((p) => p.id).sort()).toEqual([w.owner, w.tenant].sort());
    const none = adminPeopleResponse.parse(
      await (await get(w, '/api/admin/people?q=%2B971500000001', viewer)).json(),
    );
    expect(none.people).toEqual([]);
    const audit = rows(w, "SELECT target_id, detail FROM audit_log WHERE action = 'person_viewed'");
    expect(audit).toHaveLength(3);
    expect(JSON.stringify(audit)).not.toContain('@');
    expect((await get(w, '/api/admin/people?q=x', viewer)).status).toBe(400);
    expect((await get(w, `/api/admin/people?q=${EMAILS.owner}`, w.ownerToken)).status).toBe(403);
  });

  it('a person’s page: units, tenancies on both sides, requests, live sessions', async () => {
    const w = await world();
    const { viewer } = await staff(w);
    await raise(w, leak);
    const owner = adminPersonResponse.parse(
      await (await get(w, `/api/admin/people/${w.owner}`, viewer)).json(),
    );
    expect(owner.ownerUnits.map((u) => u.unitName)).toEqual(['JAD288-1100']);
    expect(owner.tenancies.map((t) => [t.id, t.side])).toEqual([['ten-1', 'owner']]);
    expect(owner.requests).toHaveLength(1);
    expect(owner.activeSessions).toBe(1);
    const tenant = adminPersonResponse.parse(
      await (await get(w, `/api/admin/people/${w.tenant}`, viewer)).json(),
    );
    expect(tenant.tenancies.map((t) => t.side)).toEqual(['tenant']);
    expect((await get(w, '/api/admin/people/nobody', viewer)).status).toBe(404);
  });
});

describe('accounts', () => {
  it('C-SES-1: JAD+ Admin signs a person out everywhere', async () => {
    const w = await world();
    const { admin, viewer } = await staff(w);
    expect((await post(w, `/api/admin/people/${w.owner}/sign-out-everywhere`, viewer)).status).toBe(403);
    const res = await post(w, `/api/admin/people/${w.owner}/sign-out-everywhere`, admin);
    expect(await res.json()).toEqual({ id: w.owner, status: 'active', sessionsEnded: 1 });
    expect((await get(w, '/api/requests', w.ownerToken)).status).toBe(401);
  });

  it('U9: a frozen account can read but not change; the reason is kept encrypted; nobody freezes themselves', async () => {
    const w = await world();
    const { admin, adminId } = await staff(w);
    const reason = { reason: 'Legal representative letter received' };
    expect((await post(w, `/api/admin/people/${w.owner}/freeze`, admin, reason)).status).toBe(200);
    expect((await get(w, '/api/requests', w.ownerToken)).status).toBe(200);
    expect(
      (await raise(w, { ...leak, tenancyId: undefined, sfUnitId: 'a0X000000000001AAA' }, w.ownerToken))
        .status,
    ).toBe(403);
    const stored = w.h.sqlite.prepare('SELECT action, reason_enc FROM admin_reasons').get() as {
      action: string;
      reason_enc: Uint8Array;
    };
    expect(stored.action).toBe('account_frozen');
    expect(new TextDecoder('latin1').decode(stored.reason_enc)).not.toContain('Legal');
    expect((await post(w, `/api/admin/people/${w.owner}/freeze`, admin, reason)).status).toBe(409);
    expect((await post(w, `/api/admin/people/${w.owner}/unfreeze`, admin, reason)).status).toBe(200);
    expect(rows(w, 'SELECT status FROM users WHERE id = ?', w.owner)).toEqual([{ status: 'active' }]);
    expect((await post(w, `/api/admin/people/${adminId}/freeze`, admin, reason)).status).toBe(409);
  });

  it('U5: JAD+ Admin extends and ends a tenancy for the owner; both are told it ended', async () => {
    const w = await world();
    const { admin } = await staff(w);
    const ext = await post(w, '/api/admin/tenancies/ten-1/extend', admin, { endsOn: '2027-06-30' });
    expect(await ext.json()).toEqual({ id: 'ten-1', status: 'active', endsOn: '2027-06-30' });
    expect((await post(w, '/api/admin/tenancies/ten-1/extend', admin, { endsOn: '2027-01-01' })).status).toBe(
      400,
    );
    const end = await post(w, '/api/admin/tenancies/ten-1/end', admin, { reason: 'Owner asked by phone' });
    expect(end.status).toBe(200);
    expect(rows(w, "SELECT status FROM tenancies WHERE id = 'ten-1'")).toEqual([{ status: 'revoked' }]);
    expect(rows(w, "SELECT user_id FROM inbox WHERE kind = 'tenancy_ended' ORDER BY user_id")).toHaveLength(
      2,
    );
    expect((await post(w, '/api/admin/tenancies/ten-1/end', admin, { reason: 'Again' })).status).toBe(409);
  });
});

describe('desk queue (ADR 0011)', () => {
  it('the desk works a request and replies; the owner sees the reply in demo mode', async () => {
    const w = await world();
    const { admin, viewer } = await staff(w);
    const asked = await post(w, '/api/owner/desk-requests', w.ownerToken, {
      type: 'Update my contact details',
      dealId: null,
      details: 'New mobile +971 50 000 0000',
    });
    const { id } = await asked.json<{ id: string }>();
    const queue = adminDeskQueueResponse.parse(
      await (await get(w, '/api/admin/desk-requests?status=New', viewer)).json(),
    );
    expect(queue.requests.map((d) => [d.id, d.hasDetails, d.replied])).toEqual([[id, true, false]]);
    expect(JSON.stringify(queue)).not.toContain('+971');
    const detail = adminDeskDetailResponse.parse(
      await (await get(w, `/api/admin/desk-requests/${id}`, viewer)).json(),
    );
    expect([detail.ownerEmail, detail.details]).toEqual([EMAILS.owner, 'New mobile +971 50 000 0000']);
    expect(rows(w, "SELECT count(*) AS n FROM audit_log WHERE action = 'desk_request_viewed'")).toEqual([
      { n: 1 },
    ]);

    const reply = { status: 'Completed', reply: 'Your mobile number is updated.' };
    expect((await post(w, `/api/admin/desk-requests/${id}`, viewer, reply)).status).toBe(403);
    expect((await post(w, `/api/admin/desk-requests/${id}`, admin, reply)).status).toBe(200);
    expect((await post(w, `/api/admin/desk-requests/${id}`, admin, { status: 'In progress' })).status).toBe(
      409,
    );
    const keys = await importKeys(TEST_INDEX_KEY, TEST_DATA_KEY);
    const shown = await demoDeskRequests(w.h.env.DB, w.owner, { deals: [] }, keys);
    expect(shown.map((d) => [d.status, d.reply])).toEqual([['Completed', 'Your mobile number is updated.']]);
  });

  it('a request already in Salesforce is worked there, not here', async () => {
    const w = await world();
    const { admin } = await staff(w);
    const asked = await post(w, '/api/owner/desk-requests', w.ownerToken, {
      type: 'Close my JAD+ account',
      dealId: null,
    });
    const { id } = await asked.json<{ id: string }>();
    w.h.sqlite.prepare("UPDATE desk_requests SET sf_request_id = 'a1B000000000001AAA' WHERE id = ?").run(id);
    expect((await post(w, `/api/admin/desk-requests/${id}`, admin, { status: 'In progress' })).status).toBe(
      409,
    );
  });
});

describe('staff accounts', () => {
  it('C-AZ-1: JAD+ Admin adds and removes staff; removal ends their sessions; nobody removes themselves', async () => {
    const w = await world();
    const { admin, viewer, adminId } = await staff(w);
    expect((await get(w, '/api/admin/staff', viewer)).status).toBe(403);
    const added = await post(w, '/api/admin/staff', admin, {
      name: 'Sara Example',
      email: 'sara@jadplus.ae',
      role: 'jad_viewer',
    });
    expect(added.status).toBe(201);
    const { userId } = await added.json<{ userId: string }>();
    const saraToken = await w.h.signIn('sara@jadplus.ae', 'console');
    const list = adminStaffResponse.parse(await (await get(w, '/api/admin/staff', admin)).json());
    expect(list.staff.map((s) => [s.name, s.role])).toContainEqual(['Sara Example', 'jad_viewer']);
    expect(
      (
        await post(w, '/api/admin/staff', admin, {
          name: 'Sara',
          email: 'sara@jadplus.ae',
          role: 'jad_admin',
        })
      ).status,
    ).toBe(409);
    const removed = await post(w, `/api/admin/staff/${userId}/remove`, admin, { reason: 'Left the company' });
    expect(await removed.json()).toEqual({ userId, sessionsEnded: 1 });
    expect((await get(w, '/api/admin/overview', saraToken)).status).toBe(401);
    expect((await post(w, `/api/admin/staff/${adminId}/remove`, admin, { reason: 'Myself' })).status).toBe(
      409,
    );
    expect((await post(w, `/api/admin/staff/${w.owner}/remove`, admin, { reason: 'Not staff' })).status).toBe(
      404,
    );
  });
});

describe('audit log viewer', () => {
  it('C-AUD-1: newest first, 100 per page, filters; reading it is logged; viewers cannot', async () => {
    const w = await world();
    const { admin, viewer, adminId } = await staff(w);
    const insert = w.h.sqlite.prepare(
      "INSERT INTO audit_log (at, actor_user_id, actor_role, action, target_type, target_id) VALUES (?, ?, 'jad_admin', 'partner_flagged', 'partner', 'p-1')",
    );
    for (let i = 0; i < 105; i += 1) insert.run(NOW + i, adminId);
    expect((await get(w, '/api/admin/audit', viewer)).status).toBe(403);
    const first = adminAuditResponse.parse(
      await (await get(w, '/api/admin/audit?action=partner_flagged', admin)).json(),
    );
    expect(first.entries).toHaveLength(100);
    expect(first.entries[0]?.at).toBe(NOW + 104);
    expect(first.nextBefore).not.toBeNull();
    const second = adminAuditResponse.parse(
      await (
        await get(w, `/api/admin/audit?action=partner_flagged&before=${String(first.nextBefore)}`, admin)
      ).json(),
    );
    expect([second.entries.length, second.nextBefore]).toEqual([5, null]);
    const self = adminAuditResponse.parse(
      await (await get(w, '/api/admin/audit?action=audit_log_viewed', admin)).json(),
    );
    expect(self.entries).toHaveLength(2);
    expect((await get(w, '/api/admin/audit?action=Bad', admin)).status).toBe(400);
  });
});

describe('monthly report', () => {
  it('S5: by service, project and partner, as JSON and CSV, without personal data', async () => {
    const w = await world();
    const { viewer } = await staff(w);
    await raise(w, leak);
    const report = adminMonthlyReportResponse.parse(
      await (await get(w, '/api/admin/reports/monthly?month=2026-11', viewer)).json(),
    );
    expect(report.totals).toMatchObject({ raised: 1, emergencies: 1, closed: 0, slaMetPct: null });
    expect(report.byService).toEqual([{ code: 'maintenance', name: 'Maintenance', raised: 1, closed: 0 }]);
    expect(report.byProject).toEqual([{ project: 'JAD 288', raised: 1 }]);
    expect(report.byPartner.map((p) => [p.name, p.jobs])).toEqual([['Primary Fixers LLC', 1]]);
    const csv = await get(w, '/api/admin/reports/monthly.csv?month=2026-11', viewer);
    expect(csv.headers.get('content-type')).toBe('text/csv; charset=utf-8');
    expect(csv.headers.get('content-disposition')).toBe('attachment; filename="jadplus-report-2026-11.csv"');
    const text = await csv.text();
    expect(text).toContain('partner,Primary Fixers LLC,1,0,,,0');
    expect(text).not.toContain('@');
    const october = adminMonthlyReportResponse.parse(
      await (await get(w, '/api/admin/reports/monthly?month=2026-10', viewer)).json(),
    );
    expect(october.totals.raised).toBe(0);
    expect((await get(w, '/api/admin/reports/monthly?month=2026-13', viewer)).status).toBe(400);
  });
});
