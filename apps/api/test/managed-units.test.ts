/** Managed units (ADR 0034): O4, A1, R2, U5, C-AZ-1, C-AZ-2, C-AUD-1, C-VAL-1. */
import {
  adminManagedUnitsResponse,
  inboxResponse,
  officeManagedUnitResponse,
  officeManagedUnitsResponse,
  ownerTenanciesResponse,
  partnerCapabilitiesResponse,
  requestDetailResponse,
} from '@jadplus/shared';
import { describe, expect, it } from 'vitest';
import { NOW, SF_UNIT } from './db.js';
import { rows } from './emergency-world.js';
import {
  DAY,
  TODAY,
  get,
  managedWorld,
  post,
  put,
  setManaged,
  tenantRepair,
  type ManagedWorld,
} from './managed-world.js';

const kinds = async (w: ManagedWorld, token: string) =>
  inboxResponse.parse(await (await get(w, '/api/me/inbox', token)).json()).items.map((i) => i.kind);

describe('setting a unit as managed (O4)', () => {
  it('O4/C-AZ-1: JAD+ Admin sets it; viewers, offices and owners cannot; one arrangement at a time; audited', async () => {
    const w = await managedWorld();
    const body = {
      sfUnitId: SF_UNIT,
      ownerUserId: w.owner,
      providerId: 'p-harbor',
      since: TODAY,
      until: null,
    };
    expect((await post(w, '/api/admin/managed-units', w.viewer, body)).status).toBe(403);
    expect((await post(w, '/api/admin/managed-units', w.harbor, body)).status).toBe(403);
    expect((await post(w, '/api/admin/managed-units', w.ownerToken, body)).status).toBe(403);
    // Only a JAD Global team manages; only the unit's owner; strict body.
    expect(
      (await post(w, '/api/admin/managed-units', w.admin, { ...body, providerId: 'p-vip' })).status,
    ).toBe(400);
    expect(
      (await post(w, '/api/admin/managed-units', w.admin, { ...body, ownerUserId: w.tenant })).status,
    ).toBe(404);
    expect((await post(w, '/api/admin/managed-units', w.admin, { ...body, extra: 1 })).status).toBe(400);
    const id = await setManaged(w);
    expect((await post(w, '/api/admin/managed-units', w.admin, body)).status).toBe(409);
    const list = adminManagedUnitsResponse.parse(
      await (await get(w, `/api/admin/managed-units?ownerUserId=${w.owner}`, w.viewer)).json(),
    );
    expect(list.units[0]).toMatchObject({
      id,
      providerName: 'Harbor Property Management (demo)',
      current: true,
    });
    expect((await post(w, `/api/admin/managed-units/${id}/end`, w.admin)).status).toBe(200);
    expect((await post(w, `/api/admin/managed-units/${id}/end`, w.admin)).status).toBe(409);
    // History kept: a new arrangement is a new row.
    await setManaged(w);
    expect(rows(w, 'SELECT count(*) AS n FROM managed_units')).toEqual([{ n: 2 }]);
    expect(rows(w, `SELECT action, detail FROM audit_log WHERE target_id = '${id}' ORDER BY seq`)).toEqual([
      { action: 'managed_unit_set', detail: '{"source":"admin","provider":"p-harbor","until":null}' },
      { action: 'managed_unit_ended', detail: null },
    ]);
  });

  it('O4: bulk entry of complimentary management is all or nothing, by unit name and owner email', async () => {
    const w = await managedWorld();
    const row = { unitName: 'jad288-1100', ownerEmail: 'layla.haddad@example.com', until: '2027-11-08' };
    const bad = await post(w, '/api/admin/managed-units/bulk', w.admin, {
      providerId: 'p-harbor',
      rows: [row, { ...row, ownerEmail: 'nobody@example.com' }],
    });
    expect(bad.status).toBe(400);
    expect((await bad.json<{ problems: unknown[] }>()).problems).toEqual([
      { row: 2, problem: 'No owner with this email owns this unit (they sign in once first).' },
    ]);
    expect(rows(w, 'SELECT count(*) AS n FROM managed_units')).toEqual([{ n: 0 }]);
    const ok = await post(w, '/api/admin/managed-units/bulk', w.admin, {
      providerId: 'p-harbor',
      rows: [row],
    });
    expect(ok.status).toBe(201);
    expect(rows(w, 'SELECT source, until, owner_user_id FROM managed_units')).toEqual([
      { source: 'complimentary', until: '2027-11-08', owner_user_id: w.owner },
    ]);
    const again = await post(w, '/api/admin/managed-units/bulk', w.admin, {
      providerId: 'p-harbor',
      rows: [row],
    });
    expect(again.status).toBe(400);
    expect(
      (await post(w, '/api/admin/managed-units/bulk', w.viewer, { providerId: 'p-harbor', rows: [row] }))
        .status,
    ).toBe(403);
    // The audit log never holds the owner's email.
    expect(JSON.stringify(rows(w, 'SELECT detail FROM audit_log'))).not.toContain('layla');
  });

  it('O4: the owner’s property management consultation reaching "Active" makes the unit managed', async () => {
    const w = await managedWorld();
    const db = w.h.sqlite;
    db.prepare(
      `INSERT INTO requests (id, ref, service_code, sf_unit_id, owner_user_id, raised_by_user_id, raised_by_role,
         description, is_emergency, status, partner_id, created_at, updated_at, status_changed_at)
       VALUES ('req-pm', 'JAD-PM01', 'property-management', ?, ?, ?, 'owner', 'Manage my unit.', 0, 'assigned',
         'p-harbor', ?, ?, ?)`,
    ).run(SF_UNIT, w.owner, w.owner, NOW, NOW, NOW);
    db.prepare(
      `INSERT INTO consultations (request_id, service_code, answers, consent_partner_id, consent_version, consented_at)
       VALUES ('req-pm', 'property-management', '{}', 'p-harbor', 'consult-2026-11', ?)`,
    ).run(NOW);
    expect((await post(w, '/api/partner/jobs/req-pm/consultation/contact-made', w.harbor)).status).toBe(200);
    expect(
      (await post(w, '/api/partner/jobs/req-pm/consultation/stage', w.harbor, { stage: 'proposal' })).status,
    ).toBe(200);
    expect(rows(w, 'SELECT count(*) AS n FROM managed_units')).toEqual([{ n: 0 }]);
    expect(
      (await post(w, '/api/partner/jobs/req-pm/consultation/stage', w.harbor, { stage: 'active' })).status,
    ).toBe(200);
    expect(rows(w, 'SELECT source, request_id, provider_id, since, until FROM managed_units')).toEqual([
      { source: 'consultation', request_id: 'req-pm', provider_id: 'p-harbor', since: TODAY, until: null },
    ]);
    const mine = officeManagedUnitsResponse.parse(
      await (await get(w, '/api/partner/managed-units', w.harbor)).json(),
    );
    expect(mine.units).toHaveLength(1);
  });
});

describe('the managing office and the tenant (O4, U5)', () => {
  it('O4: the office invites, extends and ends; the owner reads but cannot change; other teams get 404', async () => {
    const w = await managedWorld();
    const id = await setManaged(w);
    const list = officeManagedUnitsResponse.parse(
      await (await get(w, '/api/partner/managed-units', w.harbor)).json(),
    );
    expect(list.units[0]).toMatchObject({ id, tenantStatus: 'active', awaitingApproval: 0 });
    expect(
      officeManagedUnitsResponse.parse(await (await get(w, '/api/partner/managed-units', w.otherTeam)).json())
        .units,
    ).toEqual([]);
    expect((await get(w, `/api/partner/managed-units/${id}`, w.otherTeam)).status).toBe(404);
    expect((await post(w, `/api/partner/managed-units/${id}/tenancies/ten-1/end`, w.otherTeam)).status).toBe(
      404,
    );
    expect((await get(w, `/api/partner/managed-units/${id}`, w.primaryToken)).status).toBe(403);

    // The owner sees the tenancy, but the manager looks after it.
    const owner = await post(w, '/api/owner/tenancies/ten-1/extend', w.ownerToken, { endsOn: '2027-06-30' });
    expect(owner.status).toBe(409);
    expect(await owner.json()).toMatchObject({ code: 'managed' });
    expect((await post(w, '/api/owner/tenancies/ten-1/end', w.ownerToken)).status).toBe(409);
    expect(
      ownerTenanciesResponse.parse(await (await get(w, '/api/owner/tenancies', w.ownerToken)).json())
        .tenancies,
    ).toHaveLength(1);

    const extended = await post(w, `/api/partner/managed-units/${id}/tenancies/ten-1/extend`, w.harbor, {
      endsOn: '2027-06-30',
    });
    expect(extended.status).toBe(200);
    expect((await post(w, `/api/partner/managed-units/${id}/tenancies/ten-1/end`, w.harbor)).status).toBe(
      200,
    );
    const invited = await post(w, `/api/partner/managed-units/${id}/tenancies`, w.harbor, {
      sfUnitId: SF_UNIT,
      name: 'Nadia Example',
      email: 'nadia.tenant@example.com',
      startsOn: '2026-11-15',
      endsOn: '2027-11-14',
    });
    expect(invited.status).toBe(201);
    const tid = (await invited.json<{ id: string }>()).id;
    expect(rows(w, `SELECT owner_user_id, created_by FROM tenancies WHERE id = '${tid}'`)).toEqual([
      { owner_user_id: w.owner, created_by: w.harborUser },
    ]);
    const detail = officeManagedUnitResponse.parse(
      await (await get(w, `/api/partner/managed-units/${id}`, w.harbor)).json(),
    );
    expect(detail.tenancy).toMatchObject({
      id: tid,
      tenantName: 'Nadia Example',
      contact: 'n•••t@example.com',
    });
    expect(
      rows(w, "SELECT action, actor_role FROM audit_log WHERE target_type = 'tenancy' ORDER BY seq"),
    ).toEqual([
      { action: 'tenancy_extended', actor_role: 'partner_admin' },
      { action: 'tenancy_ended_by_manager', actor_role: 'partner_admin' },
      { action: 'tenant_invited', actor_role: 'partner_admin' },
    ]);
  });

  it('O4: once the arrangement ends the owner keeps the tenancy again and the office loses the unit', async () => {
    const w = await managedWorld();
    const id = await setManaged(w);
    await post(w, `/api/admin/managed-units/${id}/end`, w.admin);
    expect((await get(w, `/api/partner/managed-units/${id}`, w.harbor)).status).toBe(404);
    expect(
      (await post(w, '/api/owner/tenancies/ten-1/extend', w.ownerToken, { endsOn: '2027-06-30' })).status,
    ).toBe(200);
  });
});

describe('approval by the manager (A1)', () => {
  it('A1: the tenant’s repair waits for the manager, not the owner; approval goes to the manager’s company', async () => {
    const w = await managedWorld();
    const id = await setManaged(w);
    expect((await put(w, '/api/partner/manager-settings', w.harbor, { partnerId: 'p-harbor' })).status).toBe(
      400,
    );
    expect(
      (await put(w, '/api/partner/manager-settings', w.primaryOffice, { partnerId: 'p-vip' })).status,
    ).toBe(403);
    expect((await put(w, '/api/partner/manager-settings', w.harbor, { partnerId: 'p-vip' })).status).toBe(
      200,
    );
    const req = await tenantRepair(w);
    expect(await kinds(w, w.ownerToken)).not.toContain('approval_needed');

    const detail = requestDetailResponse.parse(
      await (await get(w, `/api/requests/${req}`, w.ownerToken)).json(),
    );
    expect(detail.actions).not.toContain('approve_request');
    const owner = await post(w, `/api/requests/${req}/approval`, w.ownerToken, { decision: 'approve' });
    expect(owner.status).toBe(409);

    const list = officeManagedUnitsResponse.parse(
      await (await get(w, '/api/partner/managed-units', w.harbor)).json(),
    );
    expect(list.units[0]?.awaitingApproval).toBe(1);
    const path = `/api/partner/managed-units/${id}/requests/${req}/approval`;
    expect((await post(w, path, w.otherTeam, { decision: 'approve' })).status).toBe(404);
    expect((await post(w, path, w.harbor, { decision: 'approve' })).status).toBe(200);
    expect(rows(w, `SELECT status, partner_id FROM requests WHERE id = '${req}'`)).toEqual([
      { status: 'assigned', partner_id: 'p-vip' },
    ]);
    expect((await post(w, path, w.harbor, { decision: 'approve' })).status).toBe(409);
    expect(await kinds(w, w.tenantToken)).toContain('request_approved');
    expect(
      rows(
        w,
        `SELECT action, actor_role FROM audit_log WHERE target_id = '${req}' AND action LIKE '%manager'`,
      ),
    ).toEqual([{ action: 'request_approved_by_manager', actor_role: 'partner_admin' }]);
  });

  it('A1: without a usable maintenance company the normal routing applies; a decline closes the request', async () => {
    const w = await managedWorld();
    const id = await setManaged(w);
    await put(w, '/api/partner/manager-settings', w.harbor, { partnerId: 'p-vip' });
    w.h.sqlite
      .prepare(
        "UPDATE partners SET status = 'suspended', status_reason = 'Insurance lapsed' WHERE id = 'p-vip'",
      )
      .run();
    const first = await tenantRepair(w);
    await post(w, `/api/partner/managed-units/${id}/requests/${first}/approval`, w.harbor, {
      decision: 'approve',
    });
    expect(rows(w, `SELECT partner_id FROM requests WHERE id = '${first}'`)).toEqual([
      { partner_id: 'p-primary' },
    ]);
    const second = await tenantRepair(w);
    await post(w, `/api/partner/managed-units/${id}/requests/${second}/approval`, w.harbor, {
      decision: 'decline',
    });
    expect(rows(w, `SELECT status, close_reason FROM requests WHERE id = '${second}'`)).toEqual([
      { status: 'closed', close_reason: 'owner_declined_request' },
    ]);
  });

  it('O4: the owner’s own repairs on a managed unit run the normal owner flow; the office sees them', async () => {
    const w = await managedWorld();
    const id = await setManaged(w);
    const res = await post(w, '/api/requests', w.ownerToken, {
      sfUnitId: SF_UNIT,
      serviceCode: 'maintenance',
      description: 'Kitchen tap dripping.',
      preferredDate: DAY,
      preferredSlot: 'morning',
    });
    expect(res.status).toBe(201);
    const detail = officeManagedUnitResponse.parse(
      await (await get(w, `/api/partner/managed-units/${id}`, w.harbor)).json(),
    );
    expect(detail.requests[0]).toMatchObject({
      raisedBy: 'owner',
      status: 'assigned',
      serviceCode: 'maintenance',
    });
  });
});

describe('capabilities (the office menu)', () => {
  it('the office learns its kind, its services and whether it manages units now', async () => {
    const w = await managedWorld();
    const before = partnerCapabilitiesResponse.parse(
      await (await get(w, '/api/partner/capabilities', w.harbor)).json(),
    );
    expect(before).toEqual({ kind: 'jad_group', services: ['property-management'], managesUnits: false });
    await setManaged(w);
    const after = partnerCapabilitiesResponse.parse(
      await (await get(w, '/api/partner/capabilities', w.harbor)).json(),
    );
    expect(after.managesUnits).toBe(true);
    const maint = partnerCapabilitiesResponse.parse(
      await (await get(w, '/api/partner/capabilities', w.primaryOffice)).json(),
    );
    expect(maint).toEqual({ kind: 'external', services: ['maintenance'], managesUnits: false });
    expect((await get(w, '/api/partner/capabilities', w.primaryToken)).status).toBe(403);
  });
});
