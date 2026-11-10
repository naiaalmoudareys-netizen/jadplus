/** Routine requests and the service catalogue: S1, S2, S3, S4, R1, C-AZ-1, C-AZ-2, C-VAL-1, ADR 0012. */
import {
  DEFAULT_CALENDAR,
  SERVICES,
  addWorkingMinutes,
  dubaiDate,
  preferredDays,
  myRequestsResponse,
  partnerJobsResponse,
  requestRaisedResponse,
  servicesResponse,
} from '@jadplus/shared';
import { describe, expect, it } from 'vitest';
import { NOW, SF_UNIT, migratedDb } from './db.js';
import { world, type World } from './emergency-world.js';

const raise = (w: World, json: object, token = w.ownerToken) =>
  w.h.request('/api/requests', { method: 'POST', token, json });

/** The first working day offered from the test clock (NOW, Monday 9-Nov-2026). */
const DAY = preferredDays(dubaiDate(NOW), DEFAULT_CALENDAR)[0] ?? '';

const tap = {
  sfUnitId: SF_UNIT,
  serviceCode: 'maintenance',
  description: 'Kitchen tap is dripping.',
  preferredDate: DAY,
  preferredSlot: 'morning',
};

describe('service catalogue (S1, S2)', () => {
  it('S1/S2: 12 services; a partner service without a partner is "coming soon"; in-house goes to JAD+', async () => {
    const w = await world();
    const res = await w.h.request('/api/services', { token: w.ownerToken });
    const { services } = servicesResponse.parse(await res.json());
    expect(services).toHaveLength(12);
    const routing = Object.fromEntries(services.map((s) => [s.code, s.routing]));
    expect(routing).toMatchObject({ maintenance: 'partner', snagging: 'coming_soon', handover: 'jad' });
  });

  it('the catalogue in the database mirrors services.ts (no drift)', () => {
    const rows = migratedDb()
      .prepare('SELECT code, name, grp, delivery FROM services ORDER BY sort_order')
      .all();
    expect(rows).toEqual(
      SERVICES.map((s) => ({ code: s.code, name: s.name, grp: s.group, delivery: s.delivery })),
    );
  });
});

describe('raising a routine request (R1, S3, S4)', () => {
  it('ADR 0013: the preferred day must be an offered working day; the request keeps day and window', async () => {
    const w = await world();
    expect((await raise(w, { ...tap, preferredDate: '2026-11-14' })).status).toBe(400); // a Saturday
    expect((await raise(w, { ...tap, preferredSlot: 'midnight' })).status).toBe(400);
    expect((await raise(w, tap)).status).toBe(201);
    const { requests } = myRequestsResponse.parse(
      await (await w.h.request('/api/requests', { token: w.ownerToken })).json(),
    );
    expect(requests[0]?.preferredVisit).toEqual({ date: DAY, slot: 'morning' });
  });

  it('S3/S4: maintenance goes straight to the primary partner with the 4-working-hour response clock', async () => {
    const w = await world();
    const res = await raise(w, tap);
    expect(res.status).toBe(201);
    expect(requestRaisedResponse.parse(await res.json()).sentTo).toBe('Primary Fixers LLC');
    expect(
      w.h.sqlite
        .prepare('SELECT status, partner_id, is_emergency, next_due_at, next_due_kind FROM requests')
        .all(),
    ).toEqual([
      {
        status: 'assigned',
        partner_id: 'p-primary',
        is_emergency: 0,
        next_due_at: addWorkingMinutes(w.h.clock, 240, DEFAULT_CALENDAR),
        next_due_kind: 'routine_response',
      },
    ]);
    const { jobs } = partnerJobsResponse.parse(
      await (await w.h.request('/api/partner/jobs', { token: w.primaryToken })).json(),
    );
    expect(jobs.map((j) => [j.serviceName, j.emergency])).toEqual([['Maintenance', false]]);
  });

  it('S3: with the primary suspended, the backup takes it', async () => {
    const w = await world({ primaryStatus: 'suspended' });
    expect(requestRaisedResponse.parse(await (await raise(w, tap)).json()).sentTo).toBe('Backup Fixers LLC');
  });

  it('an in-house service goes to the JAD+ team; the owner sees it with its service name', async () => {
    const w = await world();
    const res = await raise(w, { ...tap, serviceCode: 'valuation', description: 'Value my unit please.' });
    expect(requestRaisedResponse.parse(await res.json()).sentTo).toBe('the JAD+ team');
    const { requests } = myRequestsResponse.parse(
      await (await w.h.request('/api/requests', { token: w.ownerToken })).json(),
    );
    expect(requests.map((r) => [r.serviceName, r.status, r.partnerName])).toEqual([
      ['Property Valuation', 'submitted', null],
    ]);
  });

  it('S2: a "coming soon" service cannot be requested', async () => {
    const w = await world();
    const res = await raise(w, { ...tap, serviceCode: 'snagging' });
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ code: 'coming_soon' });
  });

  it('C-AZ-1/C-AZ-2/C-VAL-1: residents only, own units only, known services only', async () => {
    const w = await world();
    expect((await raise(w, tap, w.primaryToken)).status).toBe(403);
    // A tenant names their tenancy, never a unit (raiseRequestBody + place()).
    expect((await raise(w, tap, w.tenantToken)).status).toBe(404);
    expect((await raise(w, { ...tap, sfUnitId: 'a0X000000000999AAA' })).status).toBe(404);
    expect((await raise(w, { ...tap, serviceCode: 'teleport' })).status).toBe(400);
    expect((await raise(w, { ...tap, description: ' ' })).status).toBe(400);
    expect(
      w.h.sqlite.prepare("SELECT count(*) AS n FROM audit_log WHERE action = 'request_raised'").all(),
    ).toEqual([{ n: 0 }]);
  });
});
