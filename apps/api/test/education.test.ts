/**
 * Investor education (O5, S4; ADR 0033): JAD+ Admin or the education team schedules sessions; owners reserve one
 * seat each, give it back until the start, and ask for the book; staff see bookings, mark attendance and mark the
 * book sent. C-AZ-1, C-AZ-2, C-AUD-1.
 */
import {
  ownerEducationResponse,
  staffBookingsResponse,
  staffBookRequestsResponse,
  staffSessionsResponse,
} from '@jadplus/shared';
import { describe, expect, it } from 'vitest';
import { NOW } from './db.js';
import { rows, world, type World } from './emergency-world.js';
import { ownerRecord } from './harness.js';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

type Setup = World & { admin: string; viewer: string; team: string; otherOffice: string; otherOwner: string };

async function setup(): Promise<Setup> {
  const w = await world();
  const db = w.h.sqlite;
  await w.h.addUser({ email: 'demo@jadplus.ae', roles: ['jad_admin'] });
  await w.h.addUser({ email: 'viewer@jadplus.ae', roles: ['jad_viewer'] });
  await w.h.addUser({ email: 'harbor.re.demo@jadplus.ae', roles: [['partner_admin', 'p-harbor']] });
  await w.h.addUser({ email: 'other.office@example.com', roles: [['partner_admin', 'p-other']] });
  db.prepare("UPDATE partners SET kind = 'jad_group' WHERE id IN ('p-harbor', 'p-other')").run();
  db.prepare(
    "INSERT INTO service_partners (id, service_code, partner_id, rank, started_at) VALUES ('sp-e', 'education', 'p-harbor', 'primary', ?)",
  ).run(NOW);
  const email = 'other.owner@example.com';
  await w.h.addUser({ email, roles: ['owner'] });
  w.h.salesforce.set(`email:${email}`, ownerRecord(email, ['a0X000000000008AAA']));
  return {
    ...w,
    admin: await w.h.signIn('demo@jadplus.ae', 'console'),
    viewer: await w.h.signIn('viewer@jadplus.ae', 'console'),
    team: await w.h.signIn('harbor.re.demo@jadplus.ae', 'console'),
    otherOffice: await w.h.signIn('other.office@example.com', 'console'),
    otherOwner: await w.h.signIn(email),
  };
}

const session = (overrides: Record<string, unknown> = {}) => ({
  title: 'Investing in Dubai off-plan',
  description: 'How payment plans, handover and resale work.',
  startsAt: NOW + 3 * DAY,
  endsAt: NOW + 3 * DAY + 2 * HOUR,
  mode: 'in_person',
  place: 'JAD Global office, Business Bay',
  seats: 20,
  ...overrides,
});

async function create(w: World, token: string, body: object, base = 'admin'): Promise<Response> {
  return w.h.request(`/api/${base}/education/sessions`, { method: 'POST', token, json: body });
}

async function created(w: Setup, body: object = session()): Promise<string> {
  const res = await create(w, w.admin, body);
  expect(res.status).toBe(201);
  return (await res.json<{ id: string }>()).id;
}

const seat = (w: World, token: string, id: string) =>
  w.h.request(`/api/education/sessions/${id}/seat`, { method: 'POST', token });
const giveBack = (w: World, token: string, id: string) =>
  w.h.request(`/api/education/sessions/${id}/seat/cancel`, { method: 'POST', token });
const ownerView = async (w: World, token: string) =>
  ownerEducationResponse.parse(await (await w.h.request('/api/education', { token })).json());

describe('investor education: sessions (O5)', () => {
  it('O5/C-AUD-1: JAD+ Admin and the education team schedule sessions; viewers read; other offices see nothing', async () => {
    const w = await setup();
    const id = await created(w);
    expect(
      (
        await create(
          w,
          w.team,
          session({ startsAt: NOW + 10 * DAY, endsAt: NOW + 10 * DAY + HOUR }),
          'partner',
        )
      ).status,
    ).toBe(201);
    expect((await create(w, w.viewer, session())).status).toBe(403);
    expect((await create(w, w.otherOffice, session(), 'partner')).status).toBe(403);
    expect((await create(w, w.ownerToken, session())).status).toBe(403);
    expect((await create(w, w.primaryToken, session(), 'partner')).status).toBe(403);

    const asViewer = staffSessionsResponse.parse(
      await (await w.h.request('/api/admin/education/sessions', { token: w.viewer })).json(),
    );
    expect(asViewer.canManage).toBe(false);
    expect(asViewer.sessions.map((s) => s.id)).toContain(id);
    const asTeam = staffSessionsResponse.parse(
      await (await w.h.request('/api/partner/education/sessions', { token: w.team })).json(),
    );
    expect(asTeam).toMatchObject({ canManage: true });
    expect(asTeam.sessions).toHaveLength(2);
    expect(
      staffSessionsResponse.parse(
        await (await w.h.request('/api/partner/education/sessions', { token: w.otherOffice })).json(),
      ),
    ).toEqual({ canManage: false, sessions: [] });
    expect(
      (await w.h.request(`/api/partner/education/sessions/${id}/bookings`, { token: w.otherOffice })).status,
    ).toBe(403);
    expect(
      rows(w, "SELECT actor_role FROM audit_log WHERE action = 'education_session_created' ORDER BY seq"),
    ).toEqual([{ actor_role: 'jad_admin' }, { actor_role: 'partner_admin' }]);
  });

  it('O5/C-VAL-1: a session starts in the future, ends after it starts, and an online one needs an https link', async () => {
    const w = await setup();
    expect((await create(w, w.admin, session({ startsAt: NOW - HOUR, endsAt: NOW + HOUR }))).status).toBe(
      422,
    );
    expect((await create(w, w.admin, session({ endsAt: NOW + 3 * DAY - HOUR }))).status).toBe(400);
    expect((await create(w, w.admin, session({ mode: 'online', place: 'Zoom' }))).status).toBe(400);
    expect((await create(w, w.admin, session({ seats: 0 }))).status).toBe(400);
    expect((await create(w, w.admin, { ...session(), extra: 1 })).status).toBe(400);
    expect(
      (await create(w, w.admin, session({ mode: 'online', place: 'https://meet.example.com/jad' }))).status,
    ).toBe(201);
  });
});

describe('investor education: seats (O5)', () => {
  it('O5: owners see the next date ("to be announced" when none) and reserve one seat each; tenants never', async () => {
    const w = await setup();
    expect((await ownerView(w, w.ownerToken)).nextStartsAt).toBeNull();
    const id = await created(w, session({ seats: 1 }));
    const before = await ownerView(w, w.ownerToken);
    expect(before.nextStartsAt).toBe(NOW + 3 * DAY);
    expect(before.sessions[0]).toMatchObject({
      id,
      seatsLeft: 1,
      mySeat: false,
      place: 'JAD Global office, Business Bay',
    });

    expect((await seat(w, w.ownerToken, id)).status).toBe(201);
    expect((await seat(w, w.ownerToken, id)).status).toBe(409);
    const full = await seat(w, w.otherOwner, id);
    expect(full.status).toBe(409);
    expect(await full.json()).toMatchObject({ code: 'full' });
    expect((await ownerView(w, w.ownerToken)).sessions[0]).toMatchObject({
      seatsLeft: 0,
      mySeat: true,
      canCancel: true,
    });
    expect((await seat(w, w.tenantToken, id)).status).toBe(403);
    expect((await w.h.request('/api/education', { token: w.tenantToken })).status).toBe(403);
    expect(rows(w, "SELECT COUNT(*) AS n FROM audit_log WHERE action = 'education_seat_booked'")).toEqual([
      { n: 1 },
    ]);

    // Given back before the start: the seat is free again, and the owner may book again.
    expect((await giveBack(w, w.ownerToken, id)).status).toBe(200);
    expect((await giveBack(w, w.ownerToken, id)).status).toBe(404);
    expect((await seat(w, w.otherOwner, id)).status).toBe(201);
  });

  it('O5: a seat cannot be given back or taken once the session has started; the full-session guard holds in SQL', async () => {
    const w = await setup();
    const id = await created(w, session({ seats: 1 }));
    expect((await seat(w, w.ownerToken, id)).status).toBe(201);
    // Two owners at once: even past the first check, the insert refuses a seat beyond the limit.
    expect(() =>
      w.h.sqlite
        .prepare(
          `INSERT INTO education_bookings (id, session_id, user_id, booked_at)
           SELECT 'b-race', s.id, 'x', CASE WHEN (SELECT COUNT(*) FROM education_bookings b
             WHERE b.session_id = s.id AND b.cancelled_at IS NULL) < s.seats THEN 1 ELSE 0 END
           FROM education_sessions s WHERE s.id = ?`,
        )
        .run(id),
    ).toThrow(/CHECK|FOREIGN KEY/);
    w.h.clock = NOW + 3 * DAY + 1;
    expect((await giveBack(w, w.ownerToken, id)).status).toBe(409);
    expect((await seat(w, w.otherOwner, id)).status).toBe(409);
  });

  it('O5: an online link is shown only to owners holding a seat; a cancelled session only to them', async () => {
    const w = await setup();
    const id = await created(w, session({ mode: 'online', place: 'https://meet.example.com/jad' }));
    expect((await ownerView(w, w.otherOwner)).sessions[0]?.place).toBeNull();
    expect((await seat(w, w.ownerToken, id)).status).toBe(201);
    expect((await ownerView(w, w.ownerToken)).sessions[0]?.place).toBe('https://meet.example.com/jad');
    expect(
      (await w.h.request(`/api/admin/education/sessions/${id}/cancel`, { method: 'POST', token: w.admin }))
        .status,
    ).toBe(200);
    expect((await ownerView(w, w.ownerToken)).sessions[0]).toMatchObject({
      cancelled: true,
      canCancel: false,
    });
    expect((await ownerView(w, w.ownerToken)).nextStartsAt).toBeNull();
    expect((await ownerView(w, w.otherOwner)).sessions).toEqual([]);
  });
});

describe('investor education: staff follow-up (O5)', () => {
  it('O5/C-AUD-1: bookings with names (audited), attendance once started, seats never below bookings', async () => {
    const w = await setup();
    const id = await created(w);
    await seat(w, w.ownerToken, id);
    const list = staffBookingsResponse.parse(
      await (await w.h.request(`/api/partner/education/sessions/${id}/bookings`, { token: w.team })).json(),
    ).bookings;
    expect(list).toHaveLength(1);
    expect(list[0]?.owner.name).toBe('Layla Haddad');
    expect(rows(w, "SELECT detail FROM audit_log WHERE action = 'education_bookings_viewed'")).toEqual([
      { detail: JSON.stringify({ count: 1 }) },
    ]);
    const bookingId = list[0]?.id ?? '';
    const mark = (token: string, attended: boolean, base = 'admin') =>
      w.h.request(`/api/${base}/education/bookings/${bookingId}/attendance`, {
        method: 'POST',
        token,
        json: { attended },
      });
    expect((await mark(w.admin, true)).status).toBe(409);
    const change = (seats: number) =>
      w.h.request(`/api/admin/education/sessions/${id}`, {
        method: 'PUT',
        token: w.admin,
        json: session({ seats }),
      });
    expect((await change(0)).status).toBe(400);
    expect((await change(1)).status).toBe(200);
    // The session has started (moved in the database: console sessions end after 30 idle minutes).
    w.h.sqlite
      .prepare('UPDATE education_sessions SET starts_at = ?, ends_at = ? WHERE id = ?')
      .run(NOW - HOUR, NOW + HOUR, id);
    expect((await change(5)).status).toBe(409);
    expect((await mark(w.viewer, true)).status).toBe(403);
    expect((await mark(w.otherOffice, true, 'partner')).status).toBe(403);
    expect((await mark(w.team, true, 'partner')).status).toBe(200);
    const sessions = staffSessionsResponse.parse(
      await (await w.h.request('/api/admin/education/sessions', { token: w.admin })).json(),
    ).sessions;
    expect(sessions[0]).toMatchObject({ booked: 1, attended: 1 });
  });

  it('O5: "Send me the book" is recorded once per owner; staff mark it sent', async () => {
    const w = await setup();
    const ask = (token: string) => w.h.request('/api/education/book', { method: 'POST', token });
    expect((await ask(w.ownerToken)).status).toBe(201);
    expect((await ask(w.ownerToken)).status).toBe(409);
    expect((await ask(w.tenantToken)).status).toBe(403);
    expect((await ownerView(w, w.ownerToken)).book).toEqual({
      status: 'requested',
      requestedAt: NOW,
      sentAt: null,
    });
    const books = staffBookRequestsResponse.parse(
      await (await w.h.request('/api/admin/education/books', { token: w.viewer })).json(),
    ).requests;
    expect(books).toHaveLength(1);
    const sent = (token: string) =>
      w.h.request(`/api/admin/education/books/${books[0]?.id ?? ''}/sent`, { method: 'POST', token });
    expect((await sent(w.viewer)).status).toBe(403);
    expect((await sent(w.admin)).status).toBe(200);
    expect((await sent(w.admin)).status).toBe(409);
    expect((await ownerView(w, w.ownerToken)).book).toMatchObject({ status: 'sent', sentAt: NOW });
    expect(rows(w, "SELECT action FROM audit_log WHERE action LIKE 'education_book%' ORDER BY seq")).toEqual([
      { action: 'education_book_requested' },
      { action: 'education_book_requests_viewed' },
      { action: 'education_book_sent' },
    ]);
  });
});
