/** JAD+ Admin operations on requests (ADR 0025): R4, A1, E6, E13, U8, V3, C-AZ-1, C-PD-2, C-AUD-1. */
import {
  DEFAULT_CALENDAR,
  adminNotesResponse,
  adminOverviewResponse,
  adminRaiseResponse,
  adminRequestActionResponse,
  adminTimelineResponse,
  dubaiDate,
  preferredDays,
} from '@jadplus/shared';
import { describe, expect, it } from 'vitest';
import { NOW, SF_UNIT } from './db.js';
import { EMAILS, leak, raise, rows, world, type World } from './emergency-world.js';

const ADMIN = 'demo@jadplus.ae';
const VIEWER = 'viewer@jadplus.ae';
const DAY_ONE = preferredDays(dubaiDate(NOW), DEFAULT_CALENDAR)[0];

const post = (w: World, path: string, token: string, json: object = {}) =>
  w.h.request(path, { method: 'POST', token, json });

async function staff(w: World): Promise<{ admin: string; viewer: string }> {
  await w.h.addUser({ email: ADMIN, roles: ['jad_admin'] });
  await w.h.addUser({ email: VIEWER, roles: ['jad_viewer'] });
  return { admin: await w.h.signIn(ADMIN, 'console'), viewer: await w.h.signIn(VIEWER, 'console') };
}

async function emergency(w: World): Promise<string> {
  const res = await raise(w, leak);
  return (await res.json<{ requestId: string }>()).requestId;
}

async function routine(w: World): Promise<string> {
  const res = await post(w, '/api/requests', w.ownerToken, {
    sfUnitId: SF_UNIT,
    serviceCode: 'maintenance',
    description: 'Kitchen tap dripping.',
    preferredDate: DAY_ONE,
    preferredSlot: 'morning',
  });
  return (await res.json<{ requestId: string }>()).requestId;
}

/** The in-app items a technician received, in order. */
const inboxKinds = (w: World, technicianId: string) =>
  rows(
    w,
    `SELECT i.kind FROM inbox i JOIN technicians t ON t.user_id = i.user_id
     WHERE t.id = ? ORDER BY i.at, i.rowid`,
    technicianId,
  ).map((r) => (r as { kind: string }).kind);

describe('JAD+ Admin overview', () => {
  it('R4: live counts and this month against last month; viewers read it, residents cannot', async () => {
    const w = await world();
    const { admin, viewer } = await staff(w);
    await emergency(w);
    await routine(w);
    const res = await w.h.request('/api/admin/overview', { token: viewer });
    expect(res.status).toBe(200);
    const o = adminOverviewResponse.parse(await res.json());
    expect(o.live.activeEmergencies).toBe(1);
    expect(o.live.openByStatus).toEqual([{ status: 'assigned', count: 2 }]);
    expect(o.thisMonth).toEqual({ month: '2026-11', raised: 2, closed: 0, slaMetPct: null });
    expect(o.lastMonth.month).toBe('2026-10');
    expect((await w.h.request('/api/admin/overview', { token: admin })).status).toBe(200);
    expect((await w.h.request('/api/admin/overview', { token: w.ownerToken })).status).toBe(403);
  });
});

describe('request timeline and staff notes', () => {
  it('C-PD-1: the timeline shows roles and partner names, never a person', async () => {
    const w = await world();
    const { viewer } = await staff(w);
    const id = await emergency(w);
    const res = await w.h.request(`/api/admin/requests/${id}/timeline`, { token: viewer });
    const text = await res.text();
    const { events } = adminTimelineResponse.parse(JSON.parse(text));
    expect(events.map((e) => e.kind)).toEqual(['created', 'status_changed', 'assigned']);
    expect(events[2]?.partnerName).toBe('Primary Fixers LLC');
    expect(text).not.toContain(EMAILS.tenant);
    expect((await w.h.request('/api/admin/requests/nope/timeline', { token: viewer })).status).toBe(404);
  });

  it('A1: a note "owner called" is kept encrypted, read by staff only, and audited without its text', async () => {
    const w = await world();
    const { admin, viewer } = await staff(w);
    const id = await routine(w);
    const text = 'Called Layla Haddad, approved by phone.';
    const res = await post(w, `/api/admin/requests/${id}/notes`, admin, { text, ownerCalled: true });
    expect(res.status).toBe(201);
    const { notes } = adminNotesResponse.parse(
      await (await w.h.request(`/api/admin/requests/${id}/notes`, { token: viewer })).json(),
    );
    expect(notes.map((n) => [n.kind, n.text])).toEqual([['owner_called', text]]);
    const stored = w.h.sqlite.prepare('SELECT body_enc FROM request_notes').get() as { body_enc: Uint8Array };
    expect(new TextDecoder('latin1').decode(stored.body_enc)).not.toContain('Layla');
    expect(
      JSON.stringify(rows(w, "SELECT detail FROM audit_log WHERE action = 'request_note_added'")),
    ).not.toContain('Layla');
    expect((await post(w, `/api/admin/requests/${id}/notes`, viewer, { text: 'x' })).status).toBe(403);
    expect((await w.h.request(`/api/admin/requests/${id}/notes`, { token: w.primaryToken })).status).toBe(
      403,
    );
  });
});

describe('moving, reclassifying and cancelling', () => {
  it('E6/S6: an emergency moved to another partner restarts its acknowledgement; both partners are told', async () => {
    const w = await world();
    const { admin } = await staff(w);
    const id = await emergency(w);
    const res = await post(w, `/api/admin/requests/${id}/reassign`, admin, {
      partnerId: 'p-backup',
      reason: 'Primary not answering the phone',
    });
    expect(res.status).toBe(200);
    expect(adminRequestActionResponse.parse(await res.json())).toEqual({
      id,
      status: 'assigned',
      partnerId: 'p-backup',
      emergency: true,
    });
    expect(
      rows(w, 'SELECT partner_id, next_due_kind, escalation, version FROM requests WHERE id = ?', id),
    ).toEqual([
      { partner_id: 'p-backup', next_due_kind: 'emergency_ack', escalation: 'moved_to_backup', version: 2 },
    ]);
    expect(inboxKinds(w, 't-backup')).toEqual(['job_new']);
    expect(inboxKinds(w, 't-primary')).toEqual(['job_new', 'job_moved_away']);
    expect(rows(w, 'SELECT kind FROM request_notes WHERE request_id = ?', id)).toEqual([
      { kind: 'reassigned' },
    ]);
    expect(rows(w, "SELECT target_id FROM audit_log WHERE action = 'request_reassigned_by_jad'")).toEqual([
      { target_id: id },
    ]);
    // Same partner again, or a suspended one: refused.
    const again = { partnerId: 'p-backup', reason: 'Again please' };
    expect((await post(w, `/api/admin/requests/${id}/reassign`, admin, again)).status).toBe(409);
    w.h.sqlite
      .prepare("UPDATE partners SET status = 'suspended', status_reason = 'x' WHERE id = 'p-primary'")
      .run();
    const back = { partnerId: 'p-primary', reason: 'Move it back' };
    expect((await post(w, `/api/admin/requests/${id}/reassign`, admin, back)).status).toBe(409);
  });

  it('E13: JAD+ Admin reclassifies an emergency as routine with the routine clock; a routine one cannot be', async () => {
    const w = await world();
    const { admin, viewer } = await staff(w);
    const id = await emergency(w);
    const body = { reason: 'Slow drip under the sink, not an emergency' };
    expect((await post(w, `/api/admin/requests/${id}/reclassify`, viewer, body)).status).toBe(403);
    const res = await post(w, `/api/admin/requests/${id}/reclassify`, admin, body);
    expect(res.status).toBe(200);
    expect(
      rows(
        w,
        'SELECT is_emergency, emergency_type, next_due_kind, escalation FROM requests WHERE id = ?',
        id,
      ),
    ).toEqual([
      { is_emergency: 0, emergency_type: null, next_due_kind: 'routine_response', escalation: 'none' },
    ]);
    expect(
      rows(w, "SELECT kind FROM request_events WHERE request_id = ? AND kind = 'reclassified'", id),
    ).toHaveLength(1);
    expect((await post(w, `/api/admin/requests/${id}/reclassify`, admin, body)).status).toBe(409);
  });

  it('JAD+ cancels: visits called off, the partner told; a cancelled request cannot be cancelled again', async () => {
    const w = await world();
    const { admin } = await staff(w);
    const id = await routine(w);
    w.h.sqlite
      .prepare(
        "INSERT INTO visits (id, request_id, window_start, window_end, status, created_at) VALUES ('v-1', ?, ?, ?, 'booked', ?)",
      )
      .run(id, NOW + 86_400_000, NOW + 90_000_000, NOW);
    const body = { reason: 'Duplicate of another request' };
    expect((await post(w, `/api/admin/requests/${id}/cancel`, admin, body)).status).toBe(200);
    expect(rows(w, 'SELECT status, close_reason FROM requests WHERE id = ?', id)).toEqual([
      { status: 'cancelled', close_reason: 'cancelled_by_jad' },
    ]);
    expect(rows(w, "SELECT status FROM visits WHERE id = 'v-1'")).toEqual([{ status: 'cancelled' }]);
    expect(inboxKinds(w, 't-primary')).toContain('job_cancelled');
    expect((await post(w, `/api/admin/requests/${id}/cancel`, admin, body)).status).toBe(409);
  });
});

describe('raising for an owner', () => {
  it('U8/V3: logged on the owner’s behalf, routed like the owner’s own request', async () => {
    const w = await world();
    const { admin, viewer } = await staff(w);
    const body = {
      ownerUserId: w.owner,
      sfUnitId: SF_UNIT,
      serviceCode: 'maintenance',
      description: 'Owner phoned: balcony door sticks.',
      preferredDate: DAY_ONE,
      preferredSlot: 'afternoon',
    };
    expect((await post(w, '/api/admin/requests', viewer, body)).status).toBe(403);
    const res = await post(w, '/api/admin/requests', admin, body);
    expect(res.status).toBe(201);
    const raised = adminRaiseResponse.parse(await res.json());
    expect(raised.sentTo).toBe('Primary Fixers LLC');
    expect(
      rows(
        w,
        'SELECT owner_user_id, raised_by_user_id, raised_by_role, status, tenancy_id FROM requests WHERE id = ?',
        raised.requestId,
      ),
    ).toEqual([
      {
        owner_user_id: w.owner,
        raised_by_user_id: w.owner,
        raised_by_role: 'jad_admin',
        status: 'assigned',
        tenancy_id: 'ten-1',
      },
    ]);
    expect(
      rows(
        w,
        "SELECT actor_role FROM request_events WHERE request_id = ? AND kind = 'created'",
        raised.requestId,
      ),
    ).toEqual([{ actor_role: 'jad_admin' }]);
    // C-AZ-2: only a unit of that owner.
    const other = await post(w, '/api/admin/requests', admin, { ...body, ownerUserId: w.tenant });
    expect(other.status).toBe(404);
    // The owner sees it among their requests.
    const mine = await (await w.h.request('/api/requests', { token: w.ownerToken })).text();
    expect(mine).toContain(raised.ref);
  });
});
