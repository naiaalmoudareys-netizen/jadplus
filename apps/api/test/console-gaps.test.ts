/**
 * Console gaps (ADR 0025): per-technician numbers (S5, S6), the clock on the request page (S4, E4), finished-work
 * photos from the partner office (E10, C-UPL-1), offer titles (N2) and the audit log by person (C-AUD-1, ADR 0003).
 */
import {
  DEFAULT_CALENDAR,
  adminAuditResponse,
  dubaiDate,
  offerInterestsResponse,
  preferredDays,
  requestDetailResponse,
  requestRaisedResponse,
  technicianStatsResponse,
} from '@jadplus/shared';
import { describe, expect, it } from 'vitest';
import { NOW, SF_UNIT } from './db.js';
import { EMAILS, leak, raise, rows, world, type World } from './emergency-world.js';
import { jpegWithLocation } from './fixtures.js';

const HOUR = 3_600_000;
const post = (w: World, path: string, token: string, json: object = {}) =>
  w.h.request(path, { method: 'POST', token, json });

async function office(w: World, partner = 'p-primary', email = 'office@example.com'): Promise<string> {
  await w.h.addUser({ email, roles: [['partner_admin', partner]] });
  return w.h.signIn(email, 'console');
}

async function staff(w: World, role: 'jad_admin' | 'jad_viewer' = 'jad_admin'): Promise<string> {
  const email = role === 'jad_admin' ? 'demo@jadplus.ae' : 'viewer@jadplus.ae';
  await w.h.addUser({ email, roles: [role] });
  return w.h.signIn(email, 'console');
}

/** A routine job done by t-primary, confirmed by the owner and rated 4 stars. */
async function finishedAndRated(w: World): Promise<string> {
  const res = await post(w, '/api/requests', w.ownerToken, {
    sfUnitId: SF_UNIT,
    serviceCode: 'maintenance',
    description: 'Kitchen tap is dripping.',
    preferredDate: preferredDays(dubaiDate(NOW), DEFAULT_CALENDAR)[0],
    preferredSlot: 'morning',
  });
  const { requestId: id } = requestRaisedResponse.parse(await res.json());
  await post(w, `/api/partner/jobs/${id}/visit`, w.primaryToken, {
    technicianId: 't-primary',
    windowStart: NOW + HOUR,
    windowEnd: NOW + 3 * HOUR,
  });
  await post(w, `/api/partner/jobs/${id}/start`, w.primaryToken);
  await post(w, `/api/partner/jobs/${id}/done`, w.primaryToken);
  await post(w, `/api/requests/${id}/confirm`, w.ownerToken, { done: true });
  await post(w, `/api/requests/${id}/rating`, w.ownerToken, { stars: 4 });
  return id;
}

async function emergency(w: World): Promise<string> {
  return (await (await raise(w, leak)).json<{ requestId: string }>()).requestId;
}

describe('per-technician numbers (S5, S6)', () => {
  it('S5: the office sees each technician for the last 30 days or a month; nobody else does', async () => {
    const w = await world();
    const token = await office(w);
    await finishedAndRated(w);
    const stats = async (query = '', t = token) =>
      technicianStatsResponse.parse(
        await (await w.h.request(`/api/partner/technician-stats${query}`, { token: t })).json(),
      );
    const recent = await stats();
    expect([recent.month, recent.days, recent.targets.onTimePercent]).toEqual([null, 30, 95]);
    expect(recent.technicians).toEqual([
      {
        technicianId: 't-primary',
        name: 'Team member',
        jobsDone: 1,
        onTime: { met: 1, total: 1 },
        onTimePercent: 100,
        rating: { average: 4, count: 1 },
        repeatVisits: 0,
        repeatVisitPercent: 0,
        openJobs: 0,
        meets: { onTime: true, rating: true, repeatVisits: true },
      },
    ]);
    expect((await stats('?month=2026-11')).technicians[0]?.jobsDone).toBe(1);
    expect((await stats('?month=2026-10')).technicians[0]).toMatchObject({
      jobsDone: 0,
      onTimePercent: null,
    });

    // C-AZ-2: another company's office sees only its own technician, with nothing done.
    const other = await stats('', await office(w, 'p-backup', 'office.two@example.com'));
    expect(other.technicians.map((t) => [t.technicianId, t.jobsDone])).toEqual([['t-backup', 0]]);
    // C-AZ-1 / C-VAL-1: technicians and residents cannot; unknown keys are refused.
    const status = async (path: string, t: string) => (await w.h.request(path, { token: t })).status;
    expect(await status('/api/partner/technician-stats', w.primaryToken)).toBe(403);
    expect(await status('/api/partner/technician-stats', w.ownerToken)).toBe(403);
    expect(await status('/api/partner/technician-stats?days=30', token)).toBe(400);
  });

  it('S5: open jobs count for the technician they are assigned to', async () => {
    const w = await world();
    const token = await office(w);
    const id = await emergency(w);
    await post(w, `/api/partner/jobs/${id}/acknowledge`, w.primaryToken, {
      technicianId: 't-primary',
      arrivalWindowStart: NOW + 30 * 60_000,
      arrivalWindowEnd: NOW + HOUR,
    });
    const res = await w.h.request('/api/partner/technician-stats', { token });
    expect(technicianStatsResponse.parse(await res.json()).technicians[0]?.openJobs).toBe(1);
  });
});

describe('the clock on the request page (S4, E4, S8)', () => {
  it('E4: the office and JAD+ see "not acknowledged" with time left; residents never see the clock', async () => {
    const w = await world();
    const token = await office(w);
    const viewer = await staff(w, 'jad_viewer');
    const id = await emergency(w);
    w.h.clock = NOW + 5 * 60_000;
    const detail = async (t: string) =>
      requestDetailResponse.parse(await (await w.h.request(`/api/requests/${id}`, { token: t })).json());
    expect((await detail(token)).clock).toEqual({
      acknowledged: false,
      acknowledgedAt: null,
      nextDueAt: NOW + 15 * 60_000,
      nextDueKind: 'emergency_ack',
      minutesLeft: 10,
      paused: false,
    });
    expect((await detail(viewer)).clock?.minutesLeft).toBe(10);
    expect((await detail(w.ownerToken)).clock).toBeNull();
    expect((await detail(w.tenantToken)).clock).toBeNull();

    await post(w, `/api/partner/jobs/${id}/acknowledge`, token, {
      technicianId: 't-primary',
      arrivalWindowStart: w.h.clock + 30 * 60_000,
      arrivalWindowEnd: w.h.clock + HOUR,
    });
    const after = (await detail(token)).clock;
    expect([after?.acknowledged, after?.acknowledgedAt, after?.nextDueKind]).toEqual([
      true,
      NOW + 5 * 60_000,
      'emergency_on_site',
    ]);
  });
});

describe('finished-work photos from the partner office (E10, C-UPL-1, C-AZ-2)', () => {
  const upload = (w: World, id: string, token: string, body: Uint8Array, type = 'image/jpeg') =>
    w.h.request(`/api/requests/${id}/photos`, {
      method: 'POST',
      token,
      headers: { 'content-type': type },
      body,
    });

  it('E10: the office of the assigned partner adds them once the work has started, without metadata', async () => {
    const w = await world();
    const token = await office(w);
    const otherOffice = await office(w, 'p-backup', 'office.two@example.com');
    const id = await emergency(w);
    // Before the visit: refused (in "scheduled" a partner photo is the no-access evidence, A7).
    expect((await upload(w, id, token, jpegWithLocation())).status).toBe(409);
    await post(w, `/api/partner/jobs/${id}/acknowledge`, token, {
      technicianId: 't-primary',
      arrivalWindowStart: NOW + 30 * 60_000,
      arrivalWindowEnd: NOW + HOUR,
    });
    expect((await post(w, `/api/partner/jobs/${id}/start`, token)).status).toBe(200);
    expect((await upload(w, id, otherOffice, jpegWithLocation())).status).toBe(404);
    // The type comes from the bytes, not the browser's claim.
    expect((await upload(w, id, token, jpegWithLocation(), 'image/png')).status).toBe(415);
    const res = await upload(w, id, token, jpegWithLocation());
    expect(res.status).toBe(201);
    const { id: photoId } = await res.json<{ id: string }>();
    expect(rows(w, 'SELECT purpose FROM attachments WHERE id = ?', photoId)).toEqual([
      { purpose: 'completion_photo' },
    ]);
    const stored = await w.h.request(`/api/requests/${id}/photos/${photoId}`, { token });
    const text = String.fromCharCode(...new Uint8Array(await stored.arrayBuffer()));
    expect(text).not.toContain('GPS');
    expect(text).not.toContain('Exif');
    const detail = requestDetailResponse.parse(
      await (await w.h.request(`/api/requests/${id}`, { token: w.ownerToken })).json(),
    );
    expect(detail.completionPhotos).toEqual([{ id: photoId }]);
  });
});

describe('offer titles (N2)', () => {
  it('N2: sales see the title the owner saw; older interests fall back to the demo posts outside production', async () => {
    const w = await world();
    const admin = await staff(w);
    const tapped = await w.h.request('/api/owner/offers/demo-p1/interest', {
      method: 'POST',
      token: w.ownerToken,
    });
    expect(tapped.status).toBe(201);
    const insert = w.h.sqlite.prepare(
      'INSERT INTO offer_interests (id, post_id, user_id, at) VALUES (?, ?, ?, ?)',
    );
    insert.run('oi-demo', 'demo-p3', w.tenant, NOW - HOUR);
    insert.run('oi-gone', 'post-gone', w.tenant, NOW - 2 * HOUR);
    const { interests } = offerInterestsResponse.parse(
      await (await w.h.request('/api/admin/offer-interests', { token: admin })).json(),
    );
    expect(interests.map((i) => [i.postId, i.title])).toEqual([
      ['demo-p1', 'An owners-only residence at J188'],
      ['demo-p3', 'Construction progress at JAD 288'],
      ['post-gone', null],
    ]);
  });
});

describe('audit log by person (C-AUD-1, ADR 0003)', () => {
  it('C-AUD-1: an exact email finds what the person did and what was done to them; the lookup is audited', async () => {
    const w = await world();
    const admin = await staff(w);
    const viewer = await staff(w, 'jad_viewer');
    w.h.sqlite
      .prepare(
        "INSERT INTO audit_log (at, actor_user_id, actor_role, action, target_type, target_id) VALUES (?, NULL, 'system', 'tenancy_expired', 'user', ?)",
      )
      .run(NOW, w.owner);
    const search = async (person: string, t = admin) =>
      w.h.request(`/api/admin/audit?person=${encodeURIComponent(person)}`, { token: t });
    const found = adminAuditResponse.parse(await (await search(EMAILS.owner.toUpperCase())).json());
    expect(found.person?.userId).toBe(w.owner);
    expect(found.entries.length).toBeGreaterThan(1);
    expect(found.entries.every((e) => e.actorUserId === w.owner || e.targetId === w.owner)).toBe(true);
    expect(found.entries.map((e) => e.action)).toEqual(
      expect.arrayContaining(['sign_in', 'tenancy_expired']),
    );

    const lookups = rows(w, "SELECT detail FROM audit_log WHERE action = 'audit_log_viewed'") as {
      detail: string;
    }[];
    expect(JSON.parse(lookups[0]?.detail ?? '{}')).toMatchObject({ person: w.owner, personSearched: true });
    // The address itself is never written to the log (C-PD-1); seeing the person is.
    expect(JSON.stringify(rows(w, 'SELECT detail FROM audit_log'))).not.toContain(EMAILS.owner);
    expect(rows(w, "SELECT target_id FROM audit_log WHERE action = 'person_viewed'")).toEqual([
      { target_id: w.owner },
    ]);

    const nobody = adminAuditResponse.parse(await (await search('nobody@example.com')).json());
    expect([nobody.entries, nobody.person]).toEqual([[], null]);
    expect((await search('Layla Haddad')).status).toBe(400);
    expect((await search(EMAILS.owner, viewer)).status).toBe(403);
  });
});
