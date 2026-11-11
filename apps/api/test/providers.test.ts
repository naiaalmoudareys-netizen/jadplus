/**
 * In-house teams as providers (ADR 0030): S3, S4, P6, C-AZ-1, C-AZ-2, C-AUD-1, C-PD-2. A JAD Global team
 * ('jad_group') takes in-house services through the same primary/backup assignment and partner office as an
 * outside partner; JAD+ Admin adds providers and closes old in-house requests nobody could take.
 */
import {
  DEFAULT_CALENDAR,
  addWorkingMinutes,
  adminPartnersResponse,
  adminServicesResponse,
  dubaiDate,
  myRequestsResponse,
  partnerJobsResponse,
  preferredDays,
  providerAddedResponse,
  requestDetailResponse,
  requestRaisedResponse,
  servicesResponse,
} from '@jadplus/shared';
import { describe, expect, it } from 'vitest';
import { NOW, SF_UNIT } from './db.js';
import { rows, world, type World } from './emergency-world.js';

const HOUR = 3_600_000;
const DAY = preferredDays(dubaiDate(NOW), DEFAULT_CALENDAR)[0] ?? '';
const ask = (serviceCode: string) => ({
  sfUnitId: SF_UNIT,
  serviceCode,
  description: 'Please get in touch.',
  preferredDate: DAY,
  preferredSlot: 'morning',
});

const post = (w: World, path: string, token: string, json: object) =>
  w.h.request(path, { method: 'POST', token, json });

/** A fictional JAD Global team with an office admin and one team member, primary on the given services. */
async function team(
  w: World,
  id: string,
  services: readonly string[],
): Promise<{ office: string; member: string }> {
  const db = w.h.sqlite;
  db.prepare(
    "INSERT INTO partners (id, name, kind, created_at, updated_at) VALUES (?, ?, 'jad_group', ?, ?)",
  ).run(id, `${id} (demo)`, NOW, NOW);
  const memberId = await w.h.addUser({ email: `${id}.member@example.com`, roles: [['partner', id]] });
  db.prepare('INSERT INTO technicians (id, partner_id, user_id, created_at) VALUES (?, ?, ?, ?)').run(
    `t-${id}`,
    id,
    memberId,
    NOW,
  );
  await w.h.addUser({ email: `${id}.office@example.com`, roles: [['partner_admin', id]] });
  const sp = db.prepare(
    "INSERT INTO service_partners (id, service_code, partner_id, rank, started_at) VALUES (?, ?, ?, 'primary', ?)",
  );
  for (const code of services) sp.run(`sp-${id}-${code}`, code, id, NOW);
  return {
    office: await w.h.signIn(`${id}.office@example.com`, 'console'),
    member: await w.h.signIn(`${id}.member@example.com`),
  };
}

async function admin(w: World): Promise<{ admin: string; viewer: string }> {
  await w.h.addUser({ email: 'demo@jadplus.ae', roles: ['jad_admin'] });
  await w.h.addUser({ email: 'viewer@jadplus.ae', roles: ['jad_viewer'] });
  return {
    admin: await w.h.signIn('demo@jadplus.ae', 'console'),
    viewer: await w.h.signIn('viewer@jadplus.ae', 'console'),
  };
}

const jobs = async (w: World, token: string) =>
  partnerJobsResponse.parse(await (await w.h.request('/api/partner/jobs', { token })).json()).jobs;

describe('in-house services go to a JAD Global team (ADR 0030, P6)', () => {
  it('P6/S3: with a team assigned the service is live; the request goes to the team with its own clock (S4)', async () => {
    const w = await world();
    const harbor = await team(w, 'harbor-re', ['leasing']);
    const { services } = servicesResponse.parse(
      await (await w.h.request('/api/services', { token: w.ownerToken })).json(),
    );
    expect(services.find((s) => s.code === 'leasing')).toMatchObject({
      routing: 'jad',
      flow: 'consultation',
    });
    expect(services.find((s) => s.code === 'resale')?.routing).toBe('coming_soon');

    const res = await post(w, '/api/requests', w.ownerToken, ask('leasing'));
    expect(res.status).toBe(201);
    expect(requestRaisedResponse.parse(await res.json()).sentTo).toBe('harbor-re (demo)');
    expect(rows(w, 'SELECT status, partner_id, next_due_at, next_due_kind FROM requests')).toEqual([
      {
        status: 'assigned',
        partner_id: 'harbor-re',
        next_due_at: addWorkingMinutes(NOW, 9 * 60, DEFAULT_CALENDAR),
        next_due_kind: 'first_contact',
      },
    ]);
    expect((await jobs(w, harbor.member)).map((j) => j.serviceName)).toEqual(['Leasing']);
    // The owner sees the team by name, marked as a JAD Global team.
    const { requests } = myRequestsResponse.parse(
      await (await w.h.request('/api/requests', { token: w.ownerToken })).json(),
    );
    expect(requests[0]).toMatchObject({ partnerName: 'harbor-re (demo)', partnerKind: 'jad_group' });
  });

  it('P6: an outside partner wrongly assigned to an in-house service never takes its requests', async () => {
    const w = await world();
    w.h.sqlite
      .prepare(
        "INSERT INTO service_partners (id, service_code, partner_id, rank, started_at) VALUES ('sp-x', 'resale', 'p-primary', 'primary', ?)",
      )
      .run(NOW);
    const res = await post(w, '/api/requests', w.ownerToken, ask('resale'));
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ code: 'coming_soon' });
  });

  it('S4: investor education has no clock; a booking for snagging runs 48 hours round the clock', async () => {
    const w = await world();
    await team(w, 'harbor-re', ['education']);
    expect((await post(w, '/api/requests', w.ownerToken, ask('education'))).status).toBe(201);
    expect(rows(w, 'SELECT next_due_at, next_due_kind FROM requests')).toEqual([
      { next_due_at: null, next_due_kind: null },
    ]);
    w.h.sqlite.prepare("UPDATE service_partners SET service_code = 'snagging' WHERE id = 'sp-1'").run();
    expect((await post(w, '/api/requests', w.ownerToken, ask('snagging'))).status).toBe(201);
    expect(
      rows(w, "SELECT next_due_at, next_due_kind FROM requests WHERE service_code = 'snagging'"),
    ).toEqual([{ next_due_at: NOW + 48 * HOUR, next_due_kind: 'snagging_booking' }]);
  });

  it('S4/S5: the team’s first answer is measured against the service’s first deadline', async () => {
    const w = await world();
    const harbor = await team(w, 'harbor-re', ['mortgage']);
    // Mortgage is a partner service: a JAD Global team does not fit it, so it stays "coming soon".
    expect((await post(w, '/api/requests', w.ownerToken, ask('mortgage'))).status).toBe(422);
    w.h.sqlite
      .prepare("UPDATE service_partners SET service_code = 'handover' WHERE partner_id = 'harbor-re'")
      .run();
    const raised = await post(w, '/api/requests', w.ownerToken, ask('handover'));
    const { requestId } = requestRaisedResponse.parse(await raised.json());
    w.h.clock = NOW + HOUR;
    const visit = await post(w, `/api/partner/jobs/${requestId}/visit`, harbor.member, {
      technicianId: 't-harbor-re',
      windowStart: NOW + 26 * HOUR,
      windowEnd: NOW + 28 * HOUR,
    });
    expect(visit.status).toBe(200);
    expect(rows(w, 'SELECT partner_id, metric, outcome FROM sla_outcomes')).toEqual([
      { partner_id: 'harbor-re', metric: 'service_milestone', outcome: 'met' },
    ]);
  });

  it('C-AZ-1/C-AZ-2: a JAD Global team’s office sees only its own jobs, and outside partners not its jobs', async () => {
    const w = await world();
    const harbor = await team(w, 'harbor-re', ['leasing']);
    const other = await team(w, 'harbor-pm', ['property-management']);
    await post(w, '/api/requests', w.ownerToken, ask('leasing'));
    await post(w, '/api/requests', w.ownerToken, ask('maintenance'));
    await post(w, '/api/requests', w.ownerToken, ask('property-management'));
    expect((await jobs(w, harbor.office)).map((j) => j.serviceName)).toEqual(['Leasing']);
    expect((await jobs(w, other.office)).map((j) => j.serviceName)).toEqual(['Property Management']);
    expect((await jobs(w, w.primaryToken)).map((j) => j.serviceName)).toEqual(['Maintenance']);
    const leasing = rows(w, "SELECT id FROM requests WHERE service_code = 'leasing'") as { id: string }[];
    const id = leasing[0]?.id ?? '';
    expect((await w.h.request(`/api/requests/${id}`, { token: other.office })).status).toBe(404);
    expect((await w.h.request(`/api/requests/${id}`, { token: w.primaryToken })).status).toBe(404);
    expect((await w.h.request(`/api/requests/${id}`, { token: harbor.office })).status).toBe(200);
  });
});

describe('JAD+ Admin: provider companies (ADR 0030)', () => {
  const harbor = {
    name: 'Harbor Real Estate (demo)',
    kind: 'jad_group',
    adminName: 'Layla Haddad',
    adminEmail: 'harbor.re.demo@jadplus.ae',
  };

  it('S10/S7: JAD+ Admin adds a JAD Global team; it starts suspended until its documents are verified; audited', async () => {
    const w = await world();
    const { admin: token } = await admin(w);
    const res = await post(w, '/api/admin/partners', token, harbor);
    expect(res.status).toBe(201);
    const added = providerAddedResponse.parse(await res.json());
    expect(added).toMatchObject({ kind: 'jad_group', status: 'suspended' });
    expect(
      rows(w, 'SELECT name, kind, status, status_reason, suspended_by FROM partners WHERE id = ?', added.id),
    ).toEqual([
      {
        name: 'Harbor Real Estate (demo)',
        kind: 'jad_group',
        status: 'suspended',
        status_reason: 'Trade licence not on file; Insurance not on file',
        suspended_by: 'compliance',
      },
    ]);
    expect(
      rows(w, 'SELECT role FROM user_roles WHERE partner_id = ? AND revoked_at IS NULL', added.id),
    ).toEqual([{ role: 'partner_admin' }]);
    // C-PD-2: the audit entry names the kind, never the person.
    const audit = rows(w, "SELECT target_id, detail FROM audit_log WHERE action = 'provider_added'") as {
      target_id: string;
      detail: string;
    }[];
    expect(audit).toEqual([
      { target_id: added.id, detail: JSON.stringify({ kind: 'jad_group', newPerson: true }) },
    ]);
    expect(audit[0]?.detail).not.toContain('harbor.re.demo');
    // The office admin signs in to the partner office console like any partner office.
    const office = await w.h.signIn('harbor.re.demo@jadplus.ae', 'console');
    expect((await w.h.request('/api/partner/team', { token: office })).status).toBe(200);
    // The Partners list shows the kind.
    const list = adminPartnersResponse.parse(
      await (await w.h.request('/api/admin/partners', { token })).json(),
    ).partners;
    expect(list.find((p) => p.id === added.id)?.kind).toBe('jad_group');
    expect(list.find((p) => p.id === 'p-primary')?.kind).toBe('external');
  });

  it('C-AZ-1/C-VAL-1: viewers and residents cannot add providers; a duplicate name or bad payload is refused', async () => {
    const w = await world();
    const { admin: token, viewer } = await admin(w);
    expect((await post(w, '/api/admin/partners', viewer, harbor)).status).toBe(403);
    expect((await post(w, '/api/admin/partners', w.ownerToken, harbor)).status).toBe(403);
    expect((await post(w, '/api/admin/partners', token, { ...harbor, kind: 'franchise' })).status).toBe(400);
    expect((await post(w, '/api/admin/partners', token, { ...harbor, extra: 1 })).status).toBe(400);
    expect((await post(w, '/api/admin/partners', token, harbor)).status).toBe(201);
    const again = await post(w, '/api/admin/partners', token, {
      ...harbor,
      name: ' harbor real estate (DEMO) ',
      adminEmail: 'someone.else@example.com',
    });
    expect(again.status).toBe(409);
    expect(rows(w, "SELECT count(*) AS n FROM partners WHERE kind = 'jad_group'")).toEqual([{ n: 1 }]);
  });

  it('S3/ADR 0030: an in-house service takes JAD Global teams only, a partner service outside partners only', async () => {
    const w = await world();
    const { admin: token } = await admin(w);
    await team(w, 'harbor-re', []);
    const set = (code: string, primaryId: string) =>
      post(w, `/api/admin/services/${code}/partners`, token, { primaryId, backupId: null });
    expect((await set('leasing', 'p-backup')).status).toBe(422);
    expect((await set('mortgage', 'harbor-re')).status).toBe(422);
    expect((await set('leasing', 'harbor-re')).status).toBe(200);
    const services = adminServicesResponse.parse(
      await (await w.h.request('/api/admin/services', { token })).json(),
    ).services;
    expect(services.find((s) => s.code === 'leasing')).toMatchObject({
      routing: 'jad',
      providerKind: 'jad_group',
      primary: { id: 'harbor-re', kind: 'jad_group' },
    });
  });
});

describe('JAD+ Admin: old in-house requests nobody could take (ADR 0030)', () => {
  /** An in-house request stored before teams were providers: submitted, no provider. */
  function legacy(w: World, id = 'r-legacy'): string {
    w.h.sqlite
      .prepare(
        `INSERT INTO requests (id, ref, service_code, sf_unit_id, owner_user_id, raised_by_user_id, raised_by_role,
           description, is_emergency, status, next_due_at, next_due_kind, created_at, updated_at, status_changed_at)
         VALUES (?, 'JAD-LEG01', 'valuation', ?, ?, ?, 'owner', 'Value my unit.', 0, 'submitted', ?,
           'routine_response', ?, ?, ?)`,
      )
      .run(id, SF_UNIT, w.owner, w.owner, NOW + 4 * HOUR, NOW, NOW, NOW);
    return id;
  }

  it('JAD+ Admin marks it handled with a reason: work done, the resident confirms; noted and audited', async () => {
    const w = await world();
    const { admin: token, viewer } = await admin(w);
    const id = legacy(w);
    expect(
      (await post(w, `/api/admin/requests/${id}/handled`, viewer, { reason: 'Valued by phone.' })).status,
    ).toBe(403);
    expect((await post(w, `/api/admin/requests/${id}/handled`, token, { reason: 'x' })).status).toBe(400);
    const res = await post(w, `/api/admin/requests/${id}/handled`, token, { reason: 'Valued by phone.' });
    expect(res.status).toBe(200);
    expect(rows(w, 'SELECT status, partner_id, next_due_at FROM requests')).toEqual([
      { status: 'completed', partner_id: null, next_due_at: null },
    ]);
    expect(rows(w, "SELECT user_id FROM inbox WHERE kind = 'work_done'")).toEqual([{ user_id: w.owner }]);
    expect(rows(w, 'SELECT kind FROM request_notes')).toEqual([{ kind: 'handled_by_jad' }]);
    expect(rows(w, "SELECT target_id FROM audit_log WHERE action = 'request_handled_by_jad'")).toEqual([
      { target_id: id },
    ]);
    expect((await post(w, `/api/admin/requests/${id}/handled`, token, { reason: 'Again.' })).status).toBe(
      409,
    );
    // The owner confirms; there is no provider to rate.
    expect((await post(w, `/api/requests/${id}/confirm`, w.ownerToken, { done: true })).status).toBe(200);
    const detail = requestDetailResponse.parse(
      await (await w.h.request(`/api/requests/${id}`, { token: w.ownerToken })).json(),
    );
    expect(detail.request.status).toBe('closed');
    expect(detail.actions).not.toContain('rate');
  });

  it('only a routine request waiting with no provider can be marked handled', async () => {
    const w = await world();
    const { admin: token } = await admin(w);
    const id = legacy(w);
    w.h.sqlite
      .prepare("UPDATE requests SET partner_id = 'p-primary', status = 'assigned' WHERE id = ?")
      .run(id);
    expect((await post(w, `/api/admin/requests/${id}/handled`, token, { reason: 'Done.' })).status).toBe(409);
    w.h.sqlite.prepare("UPDATE requests SET status = 'submitted' WHERE id = ?").run(id);
    expect((await post(w, `/api/admin/requests/${id}/handled`, token, { reason: 'Done.' })).status).toBe(409);
  });

  it('E6/S4: it can instead be moved to a JAD Global team, with the service’s first deadline; not to an outside partner', async () => {
    const w = await world();
    const { admin: token } = await admin(w);
    await team(w, 'harbor-re', ['valuation']);
    const id = legacy(w);
    const move = (partnerId: string) =>
      post(w, `/api/admin/requests/${id}/reassign`, token, { partnerId, reason: 'Team now on JAD+.' });
    expect((await move('p-primary')).status).toBe(409);
    expect((await move('harbor-re')).status).toBe(200);
    expect(rows(w, 'SELECT status, partner_id, next_due_at, next_due_kind FROM requests')).toEqual([
      {
        status: 'assigned',
        partner_id: 'harbor-re',
        next_due_at: addWorkingMinutes(NOW, 3 * 9 * 60, DEFAULT_CALENDAR),
        next_due_kind: 'valuation_report',
      },
    ]);
  });
});
