/**
 * Visit-day steps, make-safe, closing, and in-app notifications (ADR 0019):
 * A2, A4, A7, A8, E8, E19, C-AZ-2, C-VAL-1, C-AUD-1.
 */
import {
  DEFAULT_CALENDAR,
  INBOX_KINDS,
  MAKE_SAFE_VERSION,
  dubaiDate,
  inboxResponse,
  myRequestsResponse,
  preferredDays,
  requestDetailResponse,
  requestRaisedResponse,
} from '@jadplus/shared';
import { describe, expect, it } from 'vitest';
import { runRequestClock } from '../src/jobs/request-clock.js';
import { createLogger } from '../src/logger.js';
import { NOW, SF_UNIT, migratedDb } from './db.js';
import { leak, raise, rows, world, type World } from './emergency-world.js';
import { jpegWithLocation } from './fixtures.js';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

async function routine(w: World): Promise<string> {
  const res = await w.h.request('/api/requests', {
    method: 'POST',
    token: w.ownerToken,
    json: {
      sfUnitId: SF_UNIT,
      serviceCode: 'maintenance',
      description: 'Kitchen tap is dripping.',
      preferredDate: preferredDays(dubaiDate(NOW), DEFAULT_CALENDAR)[0],
      preferredSlot: 'morning',
    },
  });
  return requestRaisedResponse.parse(await res.json()).requestId;
}

const post = (w: World, path: string, token: string, json: object = {}) =>
  w.h.request(path, { method: 'POST', token, json });
const book = (w: World, id: string, startIn = 30 * HOUR) =>
  post(w, `/api/partner/jobs/${id}/visit`, w.primaryToken, {
    technicianId: 't-primary',
    windowStart: w.h.clock + startIn,
    windowEnd: w.h.clock + startIn + 3 * HOUR,
  });
const inbox = async (w: World, token = w.ownerToken) =>
  inboxResponse.parse(await (await w.h.request('/api/me/inbox', { token })).json());
const kinds = async (w: World, token = w.ownerToken) => (await inbox(w, token)).items.map((i) => i.kind);
const detail = async (w: World, id: string, token = w.ownerToken) =>
  requestDetailResponse.parse(await (await w.h.request(`/api/requests/${id}`, { token })).json());
const clock = (w: World) =>
  runRequestClock(
    w.h.env.DB,
    w.h.clock,
    createLogger({}, () => undefined),
  );
const photo = (w: World, id: string) =>
  w.h.request(`/api/requests/${id}/photos`, {
    method: 'POST',
    token: w.primaryToken,
    headers: { 'content-type': 'image/jpeg' },
    body: jpegWithLocation(),
  });

describe('visit day (A7, A8)', () => {
  it('A8: "on my way" tells the owner and shows on the visit', async () => {
    const w = await world();
    const id = await routine(w);
    await book(w, id);
    // A booked visit is not "on the way" until the technician says so (the request list carries the fact).
    expect((await detail(w, id)).request.visitStatus).toBe('booked');
    expect((await post(w, `/api/partner/jobs/${id}/on-my-way`, w.primaryToken)).status).toBe(200);
    expect((await detail(w, id)).visit?.status).toBe('on_the_way');
    const list = myRequestsResponse.parse(
      await (await w.h.request('/api/requests', { token: w.ownerToken })).json(),
    );
    expect(list.requests.find((r) => r.id === id)?.visitStatus).toBe('on_the_way');
    expect(await kinds(w)).toEqual(['on_the_way', 'visit_booked']);
    expect((await post(w, `/api/partner/jobs/${id}/on-my-way`, w.primaryToken)).status).toBe(409);
  });

  it('A7: "no access" needs a photo taken there; the job waits for a new visit within 24 hours', async () => {
    const w = await world();
    const id = await routine(w);
    await book(w, id);
    expect(
      (await post(w, `/api/partner/jobs/${id}/no-access`, w.primaryToken, { photoId: 'nope' })).status,
    ).toBe(400);
    const { id: photoId } = await (await photo(w, id)).json<{ id: string }>();
    expect((await post(w, `/api/partner/jobs/${id}/no-access`, w.primaryToken, { photoId })).status).toBe(
      200,
    );
    expect(rows(w, `SELECT status, no_access_attachment_id FROM visits WHERE request_id = '${id}'`)).toEqual([
      { status: 'no_access', no_access_attachment_id: photoId },
    ]);
    expect(rows(w, `SELECT next_due_kind, next_due_at FROM requests WHERE id = '${id}'`)).toEqual([
      { next_due_kind: 'rebook_after_no_access', next_due_at: NOW + DAY },
    ]);
    const d = await detail(w, id, w.primaryToken);
    expect(d.visit).toBeNull();
    expect(d.actions).toContain('book_visit');
    expect((await inbox(w)).items[0]).toMatchObject({ kind: 'no_access', data: { hours: 24 } });
  });
});

describe('make-safe (E8)', () => {
  async function acknowledged(w: World): Promise<string> {
    const id = (await (await raise(w, leak)).json<{ requestId: string }>()).requestId;
    await post(w, `/api/partner/jobs/${id}/acknowledge`, w.primaryToken, {
      technicianId: 't-primary',
      arrivalWindowStart: w.h.clock + HOUR / 2,
      arrivalWindowEnd: w.h.clock + HOUR,
    });
    return id;
  }
  const makeSafe = (w: World, id: string, amountAed: number) =>
    post(w, `/api/partner/jobs/${id}/make-safe`, w.primaryToken, { amountAed, scope: 'Isolated the valve.' });
  const setCap = (w: World, capAed: number | null, token = w.ownerToken) =>
    post(w, '/api/me/consents', token, {
      kind: 'make_safe_cap',
      version: MAKE_SAFE_VERSION,
      accepted: capAed !== null,
      capAed,
    });

  it('E8: only within the limit the owner agreed in advance; otherwise the partner must quote', async () => {
    const w = await world();
    const id = await acknowledged(w);
    expect((await makeSafe(w, id, 200)).status).toBe(409); // no limit agreed
    expect((await setCap(w, 500)).status).toBe(201);
    expect((await makeSafe(w, id, 650)).status).toBe(409);
    expect((await makeSafe(w, id, 480)).status).toBe(201);
    expect((await detail(w, id)).makeSafe).toMatchObject({ amountAed: 480, scope: 'Isolated the valve.' });
    expect((await inbox(w)).items[0]).toMatchObject({ kind: 'make_safe_done', data: { amountAed: 480 } });
    expect((await makeSafe(w, id, 10)).status).toBe(409); // once
    expect(() => w.h.sqlite.prepare('DELETE FROM make_safe_works').run()).toThrow(/append-only/);
  });

  it('E8: only the owner sets the limit; removing it stops make-safe work', async () => {
    const w = await world();
    expect((await setCap(w, 500, w.tenantToken)).status).toBe(403);
    await setCap(w, 1000);
    expect(rows(w, "SELECT make_safe_cap_fils FROM consents WHERE kind = 'make_safe_cap'")).toEqual([
      { make_safe_cap_fils: 100_000 },
    ]);
    await setCap(w, null);
    const id = await acknowledged(w);
    expect((await makeSafe(w, id, 100)).status).toBe(409);
  });
});

describe('closing (E19)', () => {
  it('the owner cancels before work starts; a booked visit is called off', async () => {
    const w = await world();
    const id = await routine(w);
    await book(w, id);
    expect((await post(w, `/api/requests/${id}/close`, w.ownerToken, { reason: 'cancel' })).status).toBe(200);
    expect(rows(w, `SELECT status, close_reason FROM requests WHERE id = '${id}'`)).toEqual([
      { status: 'cancelled', close_reason: 'cancelled_by_requester' },
    ]);
    expect(rows(w, `SELECT status FROM visits WHERE request_id = '${id}'`)).toEqual([
      { status: 'cancelled' },
    ]);
  });

  it('E19: "I arranged it myself" closes as owner-arranged; not once the work has started', async () => {
    const w = await world();
    const id = await routine(w);
    const res = await post(w, `/api/requests/${id}/close`, w.ownerToken, { reason: 'arranged_myself' });
    expect(res.status).toBe(200);
    expect(rows(w, `SELECT close_reason FROM requests WHERE id = '${id}'`)).toEqual([
      { close_reason: 'owner_arranged' },
    ]);
    const started = await routine(w);
    await book(w, started);
    await post(w, `/api/partner/jobs/${started}/start`, w.primaryToken);
    expect((await post(w, `/api/requests/${started}/close`, w.ownerToken, { reason: 'cancel' })).status).toBe(
      409,
    );
  });
});

describe('notifications (ADR 0019)', () => {
  it('reminders: visit the day before and an hour before, each once', async () => {
    const w = await world();
    const id = await routine(w);
    await book(w, id, 30 * HOUR);
    w.h.clock = NOW + 6 * HOUR + 1;
    await clock(w);
    await clock(w);
    expect(await kinds(w)).toEqual(['visit_tomorrow', 'visit_booked']);
    w.h.clock = NOW + 29 * HOUR;
    await clock(w);
    expect(await kinds(w)).toEqual(['visit_soon', 'visit_tomorrow', 'visit_booked']);
  });

  it('A2/A4: the quote reminder on day 10; confirmation reminders at 24 h and 48 h, then auto-close', async () => {
    const w = await world();
    const quoted = await routine(w);
    await post(w, `/api/partner/jobs/${quoted}/quote`, w.primaryToken, {
      amountAed: 300,
      scope: 'New valve.',
    });
    w.h.clock = NOW + 10 * DAY;
    await clock(w);
    expect((await inbox(w)).items[0]).toMatchObject({ kind: 'quote_reminder', data: { amountAed: 300 } });
    expect(rows(w, `SELECT count(*) AS n FROM inbox WHERE kind = 'quote_reminder'`)).toEqual([{ n: 1 }]);

    w.h.clock = NOW;
    const done = await routine(w);
    await book(w, done, 2 * HOUR);
    await post(w, `/api/partner/jobs/${done}/start`, w.primaryToken);
    await post(w, `/api/partner/jobs/${done}/done`, w.primaryToken);
    for (const h of [24, 25, 48, 72]) {
      w.h.clock = NOW + h * HOUR;
      await clock(w);
    }
    expect(
      rows(
        w,
        `SELECT kind, data FROM inbox WHERE request_id = '${done}' AND kind IN ('confirm_reminder', 'auto_closed') ORDER BY at`,
      ),
    ).toEqual([
      { kind: 'confirm_reminder', data: '{"hours":24}' },
      { kind: 'confirm_reminder', data: '{"hours":48}' },
      { kind: 'auto_closed', data: null },
    ]);
  });

  it('C-AZ-2: quotes go to the owner only; everyone sees only their own items; read marks stick', async () => {
    const w = await world();
    const id = (await (await raise(w, { ...leak })).json<{ requestId: string }>()).requestId;
    await post(w, `/api/partner/jobs/${id}/acknowledge`, w.primaryToken, {
      technicianId: 't-primary',
      arrivalWindowStart: w.h.clock + HOUR / 2,
      arrivalWindowEnd: w.h.clock + HOUR,
    });
    await post(w, `/api/partner/jobs/${id}/quote`, w.primaryToken, {
      amountAed: 900,
      scope: 'Replace pipe.',
    });
    expect(await kinds(w)).toEqual(['quote_received']);
    expect(await kinds(w, w.tenantToken)).toEqual([]);
    expect(await kinds(w, w.primaryToken)).toEqual(['job_new']); // the partner's own item (ADR 0024)
    const before = await inbox(w);
    expect(before.unread).toBe(1);
    expect(
      (await post(w, '/api/me/inbox/read', w.tenantToken, { ids: [before.items[0]?.id ?? ''] })).status,
    ).toBe(204);
    expect((await inbox(w)).unread).toBe(1); // the tenant cannot mark the owner's item
    await post(w, '/api/me/inbox/read', w.ownerToken, { all: true });
    expect((await inbox(w)).unread).toBe(0);
    expect((await post(w, '/api/me/inbox/read', w.ownerToken, { ids: [] })).status).toBe(400);
  });

  it('the database allows exactly the shared kinds (no drift)', () => {
    const db = migratedDb();
    const check = db.prepare("SELECT sql FROM sqlite_master WHERE name = 'inbox'").get() as { sql: string };
    // The list inside "kind IN (...)", not the other CHECKs that name one kind (e.g. 'building_notice').
    const list = /kind IN \(([^)]*)\)/.exec(check.sql)?.[1] ?? '';
    expect(list.match(/'[a-z_]+'/g)?.map((k) => k.slice(1, -1))).toEqual([...INBOX_KINDS]);
  });
});
