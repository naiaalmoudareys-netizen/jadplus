/** Owner/tenant views and messages inside JAD+: R1, R2, R3, U6, C-AZ-2, ADR 0009 (all contact on JAD+). */
import {
  CONTACT_REMOVED,
  messagePostedResponse,
  myPlacesResponse,
  myRequestsResponse,
  partnerJobsResponse,
  requestDetailResponse,
} from '@jadplus/shared';
import { describe, expect, it } from 'vitest';
import { SF_UNIT } from './db.js';
import { leak, raise, world, type World } from './emergency-world.js';

const LOCATION = {
  unitName: 'JAD288-1100',
  project: 'JAD 288',
  building: 'Building B',
  address: 'Jumeirah Village Circle, Dubai',
};

async function raised(w: World): Promise<string> {
  const res = await raise(w, leak);
  return (await res.json<{ requestId: string }>()).requestId;
}

const get = (w: World, path: string, token: string) => w.h.request(path, { token });
const say = (w: World, id: string, token: string, body: string) =>
  w.h.request(`/api/requests/${id}/messages`, { method: 'POST', token, json: { body } });

describe('where owners and tenants can raise (R1, R2)', () => {
  it('R1: an owner sees their units; R2: a tenant sees their current home, with where it is', async () => {
    const w = await world();
    const owner = myPlacesResponse.parse(await (await get(w, '/api/me/places', w.ownerToken)).json());
    expect(owner.places).toEqual([{ sfUnitId: SF_UNIT, tenancyId: null, location: LOCATION }]);
    const tenant = myPlacesResponse.parse(await (await get(w, '/api/me/places', w.tenantToken)).json());
    expect(tenant.places).toEqual([{ sfUnitId: null, tenancyId: 'ten-1', location: LOCATION }]);
  });

  it('U5: a tenancy that has ended no longer appears', async () => {
    const w = await world();
    w.h.sqlite.prepare("UPDATE tenancies SET ends_on = '2026-11-08'").run();
    const tenant = myPlacesResponse.parse(await (await get(w, '/api/me/places', w.tenantToken)).json());
    expect(tenant.places).toEqual([]);
  });
});

describe('my requests (R1, R2, R3)', () => {
  it('R1/R2: owner and tenant both follow the emergency: status, company handling it, location', async () => {
    const w = await world();
    await raised(w);
    for (const token of [w.ownerToken, w.tenantToken]) {
      const { requests } = myRequestsResponse.parse(await (await get(w, '/api/requests', token)).json());
      expect(requests).toEqual([
        expect.objectContaining({
          emergency: true,
          emergencyType: 'water_leak',
          status: 'assigned',
          partnerName: 'Primary Fixers LLC',
          partnerVerified: true,
          location: LOCATION,
        }),
      ]);
    }
    // S8: a suspended partner (e.g. lapsed insurance, S7) is no longer shown as JAD+ verified.
    w.h.sqlite
      .prepare(
        "UPDATE partners SET status = 'suspended', status_reason = 'Insurance lapsed' WHERE id = 'p-primary'",
      )
      .run();
    const after = myRequestsResponse.parse(await (await get(w, '/api/requests', w.ownerToken)).json());
    expect(after.requests[0]?.partnerVerified).toBe(false);
    expect((await get(w, '/api/requests', w.primaryToken)).status).toBe(403);
  });

  it('R3: the technician sees where the unit is, and no resident contact details', async () => {
    const w = await world();
    await raised(w);
    const body = await (await get(w, '/api/partner/jobs', w.primaryToken)).text();
    const { jobs } = partnerJobsResponse.parse(JSON.parse(body));
    expect(jobs[0]?.location).toEqual(LOCATION);
    expect(body).not.toMatch(/@example\.com|\+971/);
  });
});

describe('messages inside JAD+ (ADR 0009)', () => {
  it('ADR 0009: tenant, partner and owner talk on the request; labels show roles and company, never names', async () => {
    const w = await world();
    const id = await raised(w);
    expect((await say(w, id, w.tenantToken, 'The water is coming from the bathroom ceiling.')).status).toBe(
      201,
    );
    expect((await say(w, id, w.primaryToken, 'On our way, arriving within the hour.')).status).toBe(201);
    const detail = requestDetailResponse.parse(
      await (await get(w, `/api/requests/${id}`, w.ownerToken)).json(),
    );
    expect(detail.messages.map((m) => [m.author, m.mine, m.body])).toEqual([
      ['Tenant', false, 'The water is coming from the bathroom ceiling.'],
      ['Primary Fixers LLC', false, 'On our way, arriving within the hour.'],
    ]);
    expect(detail.canMessage).toBe(true);
    expect(detail.request.description).toBe(leak.description);
  });

  it('ADR 0009/S10: phone numbers, emails and WhatsApp links are removed before the message is saved', async () => {
    const w = await world();
    const id = await raised(w);
    const res = await say(
      w,
      id,
      w.primaryToken,
      'Call me on 050 000 0000 or wa.me/971500000000, tech@example.com',
    );
    const posted = messagePostedResponse.parse(await res.json());
    expect(posted.masked).toBe(true);
    expect(posted.message.body).not.toMatch(/050|971|@example\.com|wa\.me/);
    expect(posted.message.body).toContain(CONTACT_REMOVED);
    const stored = JSON.stringify(w.h.sqlite.prepare('SELECT body, masked FROM request_messages').all());
    expect(stored).not.toMatch(/050 000 0000|@example\.com/);
  });

  it('C-AZ-2: only people on the request can read or write; staff viewers read only', async () => {
    const w = await world();
    const id = await raised(w);
    expect((await get(w, `/api/requests/${id}`, w.backupToken)).status).toBe(404);
    expect((await say(w, id, w.backupToken, 'Hello')).status).toBe(404);
    await w.h.addUser({ email: 'viewer@example.com', roles: ['jad_viewer'] });
    const viewer = await w.h.signIn('viewer@example.com', 'console');
    const seen = requestDetailResponse.parse(await (await get(w, `/api/requests/${id}`, viewer)).json());
    expect(seen.canMessage).toBe(false);
    expect((await say(w, id, viewer, 'Hello')).status).toBe(403);
    w.h.sqlite.prepare("UPDATE tenancies SET ends_on = '2026-11-08'").run();
    expect((await get(w, `/api/requests/${id}`, w.tenantToken)).status).toBe(404);
  });

  it('a closed request takes no more messages; messages can never be edited or deleted', async () => {
    const w = await world();
    const id = await raised(w);
    await say(w, id, w.tenantToken, 'Thanks.');
    w.h.sqlite
      .prepare("UPDATE requests SET status = 'closed', close_reason = 'confirmed' WHERE id = ?")
      .run(id);
    expect((await say(w, id, w.tenantToken, 'One more thing')).status).toBe(409);
    expect(() => w.h.sqlite.prepare("UPDATE request_messages SET body = 'changed'").run()).toThrow(
      /append-only/,
    );
    expect(() => w.h.sqlite.prepare('DELETE FROM request_messages').run()).toThrow(/append-only/);
  });

  it('C-VAL-1: empty, oversized or unknown-field messages are refused', async () => {
    const w = await world();
    const id = await raised(w);
    expect((await say(w, id, w.tenantToken, '   ')).status).toBe(400);
    expect((await say(w, id, w.tenantToken, 'x'.repeat(1001))).status).toBe(400);
    const extra = await w.h.request(`/api/requests/${id}/messages`, {
      method: 'POST',
      token: w.tenantToken,
      json: { body: 'Hi', to: 'someone' },
    });
    expect(extra.status).toBe(400);
  });
});
