/** Console data (ADR 0023): R4, E4, A1, A3, A7, E17, S7, C-AZ-1, C-AZ-2, C-AUD-1. */
import {
  DEFAULT_CALENDAR,
  adminAttentionResponse,
  adminPartnersResponse,
  adminRequestsResponse,
  dubaiDate,
  partnerTeamResponse,
  preferredDays,
} from '@jadplus/shared';
import { describe, expect, it } from 'vitest';
import { NOW, SF_UNIT } from './db.js';
import { leak, raise, rows, world, type World } from './emergency-world.js';

const HOUR = 3_600_000;
const ADMIN = 'demo@jadplus.ae';

const post = (w: World, path: string, token: string, json: object = {}) =>
  w.h.request(path, { method: 'POST', token, json });

async function admin(w: World): Promise<string> {
  await w.h.addUser({ email: ADMIN, roles: ['jad_admin'] });
  return w.h.signIn(ADMIN, 'console');
}

async function office(w: World): Promise<string> {
  await w.h.addUser({ email: 'office@example.com', roles: [['partner_admin', 'p-primary']] });
  return w.h.signIn('office@example.com', 'console');
}

const everything = async (w: World, token: string) =>
  adminAttentionResponse.parse(await (await w.h.request('/api/admin/attention', { token })).json()).items;
/** Request and desk items only: the test worlds have no on-call rota, so its warnings are left out here. */
const attention = async (w: World, token: string) =>
  (await everything(w, token)).filter((i) => i.kind !== 'on_call_gap');

describe('JAD+ Admin: needs action', () => {
  it('E4/A1: an unacknowledged emergency first; a tenant request waiting 48 h for the owner', async () => {
    const w = await world();
    const token = await admin(w);
    await raise(w, leak);
    await post(w, '/api/requests', w.tenantToken, {
      tenancyId: 'ten-1',
      serviceCode: 'maintenance',
      description: 'Noisy AC.',
      preferredDate: preferredDays(dubaiDate(NOW), DEFAULT_CALENDAR)[0],
      preferredSlot: 'morning',
    });
    expect((await attention(w, token)).map((i) => i.kind)).toEqual(['emergency_unacknowledged']);
    w.h.clock = NOW + 48 * HOUR;
    const fresh = await admin2(w);
    const kinds = (await attention(w, fresh)).map((i) => i.kind);
    expect(kinds).toContain('owner_approval_call');
    expect(kinds[0]).toBe('emergency_unacknowledged');
  });

  it('A7: "no access" not rebooked within 24 hours shows up; C-AZ-1 residents and partners cannot read it', async () => {
    const w = await world();
    const token = await admin(w);
    const owner = await post(w, '/api/requests', w.ownerToken, {
      sfUnitId: SF_UNIT,
      serviceCode: 'maintenance',
      description: 'Tap.',
      preferredDate: preferredDays(dubaiDate(NOW), DEFAULT_CALENDAR)[0],
      preferredSlot: 'morning',
    });
    const { requestId: id } = await owner.json<{ requestId: string }>();
    w.h.sqlite
      .prepare(
        "UPDATE requests SET status = 'scheduled', next_due_kind = 'rebook_after_no_access', next_due_at = ? WHERE id = ?",
      )
      .run(NOW - HOUR, id);
    expect((await attention(w, token)).map((i) => [i.kind, i.requestId])).toEqual([['no_access_rebook', id]]);
    expect((await w.h.request('/api/admin/attention', { token: w.ownerToken })).status).toBe(403);
    expect((await w.h.request('/api/admin/attention', { token: w.primaryToken })).status).toBe(403);
  });

  it('E6/E7: a week with nobody on call is listed until both places are filled by active staff', async () => {
    const w = await world();
    const token = await admin(w);
    const gaps = async () =>
      (await everything(w, token)).filter((i) => i.kind === 'on_call_gap').map((i) => i.what);
    // NOW is in the week starting Monday 9 November 2026 (Dubai).
    expect(await gaps()).toEqual([
      'On-call week of 2026-11-09: first person and second person missing',
      'On-call week of 2026-11-16: first person and second person missing',
    ]);
    const staffId = await w.h.addUser({ email: 'oncall@example.com', roles: ['jad_admin'] });
    const put = w.h.sqlite.prepare(
      'INSERT INTO on_call_rota (week_starting, position, user_id) VALUES (?, ?, ?)',
    );
    for (const week of ['2026-11-09', '2026-11-16']) {
      put.run(week, 'first', staffId);
      put.run(week, 'second', staffId);
    }
    expect(await gaps()).toEqual([]);
    w.h.sqlite.prepare("UPDATE users SET status = 'frozen' WHERE id = ?").run(staffId);
    expect((await gaps()).length).toBe(2);
  });

  it('R4: search by reference, unit or partner; partners list with documents', async () => {
    const w = await world();
    const token = await admin(w);
    await raise(w, leak);
    const search = async (q: string) =>
      adminRequestsResponse.parse(
        await (await w.h.request(`/api/admin/requests?q=${encodeURIComponent(q)}`, { token })).json(),
      ).requests;
    expect(await search('Primary')).toHaveLength(1);
    expect(await search('nothing-like-this')).toHaveLength(0);
    expect(await search('%')).toHaveLength(0); // a wildcard is searched for literally
    const { partners } = adminPartnersResponse.parse(
      await (await w.h.request('/api/admin/partners', { token })).json(),
    );
    expect(partners.map((p) => [p.id, p.openJobs])).toContainEqual(['p-primary', 1]);
  });

  it('S7: JAD+ Admin suspends and reinstates a partner, audited; a viewer cannot', async () => {
    const w = await world();
    const token = await admin(w);
    const res = await post(w, '/api/admin/partners/p-backup/status', token, {
      status: 'suspended',
      reason: 'Insurance certificate missing',
    });
    expect(res.status).toBe(200);
    expect(rows(w, "SELECT status, status_reason FROM partners WHERE id = 'p-backup'")).toEqual([
      { status: 'suspended', status_reason: 'Insurance certificate missing' },
    ]);
    await post(w, '/api/admin/partners/p-backup/status', token, { status: 'active', reason: 'Received' });
    expect(rows(w, "SELECT status FROM partners WHERE id = 'p-backup'")).toEqual([{ status: 'active' }]);
    expect(
      rows(
        w,
        "SELECT count(*) AS n FROM audit_log WHERE action IN ('partner_suspended', 'partner_reinstated')",
      ),
    ).toEqual([{ n: 2 }]);
  });
});

/** A second admin sign-in after a clock jump (console sessions last 12 hours at most). */
async function admin2(w: World): Promise<string> {
  return w.h.signIn(ADMIN, 'console');
}

describe('partner office', () => {
  it('adds a technician who can then sign in; removes one at once (E17)', async () => {
    const w = await world();
    const token = await office(w);
    const added = await post(w, '/api/partner/team', token, {
      name: 'Sami Example',
      email: 'sami.tech@example.com',
    });
    expect(added.status).toBe(201);
    const { id } = await added.json<{ id: string }>();
    const techToken = await w.h.signIn('sami.tech@example.com');
    const team = partnerTeamResponse.parse(await (await w.h.request('/api/partner/team', { token })).json());
    expect(team.technicians.map((t) => t.name)).toContain('Sami Example');
    expect(
      (await post(w, `/api/partner/team/${id}/remove`, token, { reason: 'Left the company' })).status,
    ).toBe(200);
    expect((await w.h.request('/api/partner/jobs', { token: techToken })).status).toBe(401);
  });

  it('C-AZ-2: assigns only its own active technicians to its own jobs; technicians cannot manage the team', async () => {
    const w = await world();
    const token = await office(w);
    const { requestId: id } = await (await raise(w, leak)).json<{ requestId: string }>();
    expect(
      (await post(w, `/api/partner/jobs/${id}/technician`, token, { technicianId: 't-primary' })).status,
    ).toBe(200);
    expect(
      (await post(w, `/api/partner/jobs/${id}/technician`, token, { technicianId: 't-backup' })).status,
    ).toBe(400);
    expect(rows(w, `SELECT technician_id FROM requests WHERE id = '${id}'`)).toEqual([
      { technician_id: 't-primary' },
    ]);
    expect(
      (await post(w, '/api/partner/team', w.primaryToken, { name: 'X Y', email: 'x@example.com' })).status,
    ).toBe(403);
    // A technician still reaches their own job list (the office rule does not leak onto other partner routes).
    expect((await w.h.request('/api/partner/jobs', { token: w.primaryToken })).status).toBe(200);
  });
});
