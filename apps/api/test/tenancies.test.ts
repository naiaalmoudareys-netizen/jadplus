/** Tenants (ADR 0021): R2, O4, A1, U4, U5, C-AZ-2, C-PD-1, C-PD-2, C-VAL-1, C-AUD-1. */
import {
  DEFAULT_CALENDAR,
  dubaiDate,
  inboxResponse,
  myPlacesResponse,
  ownerTenanciesResponse,
  preferredDays,
  requestRaisedResponse,
  tenantTenanciesResponse,
} from '@jadplus/shared';
import { describe, expect, it } from 'vitest';
import { runRequestClock } from '../src/jobs/request-clock.js';
import { createLogger } from '../src/logger.js';
import { NOW, SF_UNIT } from './db.js';
import { rows, world, type World } from './emergency-world.js';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const NEW_TENANT = 'nadia.tenant@example.com';

const post = (w: World, path: string, token: string, json: object = {}) =>
  w.h.request(path, { method: 'POST', token, json });
const get = (w: World, path: string, token: string) => w.h.request(path, { token });
const clock = (w: World) =>
  runRequestClock(
    w.h.env.DB,
    w.h.clock,
    createLogger({}, () => undefined),
  );
const kinds = async (w: World, token: string) =>
  inboxResponse.parse(await (await get(w, '/api/me/inbox', token)).json()).items.map((i) => i.kind);

/** The world's unit has a tenancy already (ten-1): the owner ends it, then invites a new tenant. */
async function invited(w: World, over: object = {}): Promise<{ id: string; token: string }> {
  await post(w, '/api/owner/tenancies/ten-1/end', w.ownerToken);
  const res = await post(w, '/api/owner/tenancies', w.ownerToken, {
    sfUnitId: SF_UNIT,
    name: 'Nadia Example',
    email: NEW_TENANT,
    startsOn: '2026-11-15',
    endsOn: '2027-11-14',
    ...over,
  });
  expect(res.status).toBe(201);
  const { id } = await res.json<{ id: string }>();
  return { id, token: await w.h.signIn(NEW_TENANT) };
}

async function tenantRequest(w: World, tenancyId: string, token: string): Promise<string> {
  const res = await post(w, '/api/requests', token, {
    tenancyId,
    serviceCode: 'maintenance',
    description: 'Bedroom AC is noisy.',
    preferredDate: preferredDays(dubaiDate(w.h.clock), DEFAULT_CALENDAR)[0],
    preferredSlot: 'afternoon',
  });
  const raised = requestRaisedResponse.parse(await res.json());
  expect(raised.awaitingOwner).toBe(true);
  return raised.requestId;
}

describe('inviting a tenant (R2, O4)', () => {
  it('creates the tenant’s account (encrypted), invites them, and they can sign in and accept', async () => {
    const w = await world();
    const { id, token } = await invited(w);
    expect(JSON.stringify(w.h.sqlite.prepare('SELECT * FROM users').all())).not.toContain('nadia');
    const owner = ownerTenanciesResponse.parse(
      await (await get(w, '/api/owner/tenancies', w.ownerToken)).json(),
    );
    expect(owner.tenancies[0]).toMatchObject({
      id,
      tenantName: 'Nadia Example',
      contact: 'n•••t@example.com',
      status: 'invited',
      current: false,
    });
    expect(await kinds(w, token)).toEqual(['tenancy_invited']);
    expect((await post(w, `/api/tenant/tenancies/${id}/accept`, token)).status).toBe(200);
    const mine = tenantTenanciesResponse.parse(await (await get(w, '/api/tenant/tenancies', token)).json());
    expect(mine.tenancies[0]).toMatchObject({ id, status: 'active', current: false, startsOn: '2026-11-15' });
    expect(rows(w, `SELECT action FROM audit_log WHERE target_id = '${id}' ORDER BY rowid`)).toEqual([
      { action: 'tenant_invited' },
      { action: 'tenancy_accepted' },
    ]);
  });

  it('C-AZ-2/C-VAL-1: own units only, one tenant at a time, sensible dates, not yourself', async () => {
    const w = await world();
    const body = {
      sfUnitId: SF_UNIT,
      name: 'Nadia Example',
      email: NEW_TENANT,
      startsOn: '2026-11-15',
      endsOn: '2027-11-14',
    };
    expect((await post(w, '/api/owner/tenancies', w.ownerToken, body)).status).toBe(409); // ten-1 is current
    expect(
      (await post(w, '/api/owner/tenancies', w.ownerToken, { ...body, sfUnitId: 'a0X000000000999AAA' }))
        .status,
    ).toBe(404);
    expect(
      (await post(w, '/api/owner/tenancies', w.ownerToken, { ...body, endsOn: '2026-11-01' })).status,
    ).toBe(400);
    expect(
      (await post(w, '/api/owner/tenancies', w.ownerToken, { ...body, phone: '+971500000000' })).status,
    ).toBe(400);
    expect((await post(w, '/api/owner/tenancies', w.tenantToken, body)).status).toBe(403);
    await post(w, '/api/owner/tenancies/ten-1/end', w.ownerToken);
    const self = await post(w, '/api/owner/tenancies', w.ownerToken, {
      ...body,
      email: 'layla.haddad@example.com',
    });
    expect(self.status).toBe(400);
  });

  it('C-AZ-2: a tenant cannot accept someone else’s invitation; an owner cannot touch another’s tenancy', async () => {
    const w = await world();
    const { id } = await invited(w);
    expect((await post(w, `/api/tenant/tenancies/${id}/accept`, w.tenantToken)).status).toBe(404);
    expect((await post(w, `/api/owner/tenancies/${id}/end`, w.tenantToken)).status).toBe(403);
  });
});

describe('owner approval (A1)', () => {
  it('a tenant’s routine request waits; approving sends it to the partner and tells the tenant', async () => {
    const w = await world();
    const id = await tenantRequest(w, 'ten-1', w.tenantToken);
    expect(rows(w, `SELECT status, partner_id FROM requests WHERE id = '${id}'`)).toEqual([
      { status: 'awaiting_owner', partner_id: null },
    ]);
    expect(await kinds(w, w.ownerToken)).toEqual(['approval_needed']);
    expect(
      (await post(w, `/api/requests/${id}/approval`, w.tenantToken, { decision: 'approve' })).status,
    ).toBe(403);
    expect(
      (await post(w, `/api/requests/${id}/approval`, w.ownerToken, { decision: 'approve' })).status,
    ).toBe(200);
    expect(rows(w, `SELECT status, partner_id, next_due_kind FROM requests WHERE id = '${id}'`)).toEqual([
      { status: 'assigned', partner_id: 'p-primary', next_due_kind: 'routine_response' },
    ]);
    expect(await kinds(w, w.tenantToken)).toEqual(['request_approved']);
  });

  it('declining closes the request; the owner is reminded once after 24 hours', async () => {
    const w = await world();
    const declined = await tenantRequest(w, 'ten-1', w.tenantToken);
    await post(w, `/api/requests/${declined}/approval`, w.ownerToken, { decision: 'decline' });
    expect(rows(w, `SELECT status, close_reason FROM requests WHERE id = '${declined}'`)).toEqual([
      { status: 'closed', close_reason: 'owner_declined_request' },
    ]);
    expect(await kinds(w, w.tenantToken)).toEqual(['request_declined']);
    const waiting = await tenantRequest(w, 'ten-1', w.tenantToken);
    w.h.clock = NOW + DAY;
    await clock(w);
    await clock(w);
    expect(
      rows(
        w,
        `SELECT count(*) AS n FROM inbox WHERE kind = 'approval_reminder' AND request_id = '${waiting}'`,
      ),
    ).toEqual([{ n: 1 }]);
  });

  it('E1: emergencies never wait for the owner', async () => {
    const w = await world();
    const res = await post(w, '/api/emergencies', w.tenantToken, {
      tenancyId: 'ten-1',
      type: 'water_leak',
      description: 'Water under the sink.',
    });
    expect(res.status).toBe(201);
    expect(rows(w, 'SELECT status FROM requests WHERE is_emergency = 1')).toEqual([{ status: 'assigned' }]);
  });
});

describe('the end of a tenancy (U4, U5)', () => {
  it('U4: warned 30 days before, once; ended the day after the end date; the tenant loses access', async () => {
    const w = await world(); // ten-1 ends 2026-12-31
    w.h.clock = Date.UTC(2026, 11, 1, 6); // 1 Dec: 30 days left
    await clock(w);
    await clock(w);
    expect(
      rows(
        w,
        `SELECT user_id, data FROM inbox WHERE kind = 'tenancy_ending' ORDER BY user_id = '${w.owner}' DESC`,
      ),
    ).toEqual([
      { user_id: w.owner, data: '{"endsOn":"2026-12-31","days":30}' },
      { user_id: w.tenant, data: '{"endsOn":"2026-12-31","days":30}' },
    ]);
    w.h.clock = Date.UTC(2027, 0, 1, 6);
    await clock(w);
    expect(rows(w, "SELECT status FROM tenancies WHERE id = 'ten-1'")).toEqual([{ status: 'ended' }]);
    expect(rows(w, "SELECT count(*) AS n FROM inbox WHERE kind = 'tenancy_ended'")).toEqual([{ n: 2 }]);
  });

  it('U5: the owner extends in one tap (also right after it ended); ending early revokes', async () => {
    const w = await world();
    w.h.clock = Date.UTC(2027, 0, 1, 6);
    await clock(w);
    // Two months later the earlier sessions have expired: both sign in again.
    const tenantToken = await w.h.signIn('omar.tenant@example.com');
    const ownerToken = await w.h.signIn('layla.haddad@example.com');
    const places = async () =>
      myPlacesResponse.parse(await (await get(w, '/api/me/places', tenantToken)).json()).places;
    expect(await places()).toEqual([]);
    expect(
      (await post(w, '/api/owner/tenancies/ten-1/extend', ownerToken, { endsOn: '2027-06-30' })).status,
    ).toBe(200);
    expect(rows(w, "SELECT status, ends_on FROM tenancies WHERE id = 'ten-1'")).toEqual([
      { status: 'active', ends_on: '2027-06-30' },
    ]);
    expect(await places()).toHaveLength(1);
    // An extension only moves the end later; to shorten, the owner ends the tenancy.
    expect(
      (await post(w, '/api/owner/tenancies/ten-1/extend', ownerToken, { endsOn: '2027-03-31' })).status,
    ).toBe(400);
    expect((await post(w, '/api/owner/tenancies/ten-1/end', ownerToken)).status).toBe(200);
    expect(rows(w, "SELECT status FROM tenancies WHERE id = 'ten-1'")).toEqual([{ status: 'revoked' }]);
    expect(await places()).toEqual([]);
  });
});
