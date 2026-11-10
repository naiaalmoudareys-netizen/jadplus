/** Partner office tools (ADR 0025): overview, dispatch, messages, quotes, after-hours. R3, E4, E6, A2, S6, C-AZ-1/2. */
import {
  afterHoursResponse,
  dispatchResponse,
  partnerMessagesResponse,
  partnerOverviewResponse,
  partnerQuotesResponse,
  technicianSkillsResponse,
  technicianUnavailableResponse,
} from '@jadplus/shared';
import { describe, expect, it } from 'vitest';
import { NOW } from './db.js';
import { leak, raise, rows, world, type World } from './emergency-world.js';

const DAY = 86_400_000;
const TODAY = '2026-11-09';
const MONDAY = '2026-11-09';

async function office(w: World, partner = 'p-primary', email = 'office@example.com'): Promise<string> {
  await w.h.addUser({ email, roles: [['partner_admin', partner]] });
  return w.h.signIn(email, 'console');
}

const get = async (w: World, path: string, token: string) => w.h.request(path, { token });
const send = (w: World, method: string, path: string, token: string, json: object) =>
  w.h.request(path, { method, token, json });

async function emergency(w: World): Promise<string> {
  const res = await raise(w, leak);
  return (await res.json<{ requestId: string }>()).requestId;
}

describe('partner office: overview', () => {
  it('R3/E4: today shows the unacknowledged emergency with minutes left, and it is unassigned', async () => {
    const w = await world();
    const token = await office(w);
    await emergency(w);
    w.h.clock = NOW + 5 * 60_000;
    const body = partnerOverviewResponse.parse(await (await get(w, '/api/partner/overview', token)).json());
    expect(body.today.emergencies).toHaveLength(1);
    expect(body.today.emergencies[0]?.minutesLeft).toBe(10);
    expect(body.today.unassigned).toBe(1);
    expect(body.thisMonth.month).toBe('2026-11');
    expect(body.lastMonth.month).toBe('2026-10');
    expect(body.targets.averageRating).toBe(4);
  });

  it('S7: missing licence and insurance are flagged; S6: a missed emergency warns', async () => {
    const w = await world();
    const token = await office(w);
    w.h.sqlite
      .prepare(
        `INSERT INTO requests (id, ref, service_code, sf_unit_id, owner_user_id, raised_by_user_id, raised_by_role,
           description, is_emergency, emergency_type, status, partner_id, created_at, updated_at, status_changed_at)
         VALUES ('r-old', 'JAD-OLD1', 'maintenance', 'a0X000000000001AAA', ?, ?, 'owner', 'Leak.', 1, 'water_leak',
           'completed', 'p-primary', ?, ?, ?)`,
      )
      .run(w.owner, w.owner, NOW - 10 * DAY, NOW - 10 * DAY, NOW - 10 * DAY);
    w.h.sqlite
      .prepare(
        `INSERT INTO sla_outcomes (id, request_id, partner_id, metric, due_at, outcome, recorded_at)
         VALUES ('o-1', 'r-old', 'p-primary', 'emergency_ack', ?, 'missed', ?)`,
      )
      .run(NOW - 10 * DAY, NOW - 10 * DAY);
    const { alerts } = partnerOverviewResponse.parse(
      await (await get(w, '/api/partner/overview', token)).json(),
    );
    expect(alerts.map((a) => [a.kind, a.level])).toEqual([
      ['document', 'flagged'],
      ['document', 'flagged'],
      ['missed_emergencies', 'warning'],
    ]);
  });

  it('C-AZ-1: technicians, residents and JAD+ staff cannot open the office overview', async () => {
    const w = await world();
    expect((await get(w, '/api/partner/overview', w.primaryToken)).status).toBe(403);
    expect((await get(w, '/api/partner/overview', w.ownerToken)).status).toBe(403);
  });

  it('C-AZ-2: another company never sees this company’s emergency', async () => {
    const w = await world();
    const other = await office(w, 'p-backup', 'office.two@example.com');
    await emergency(w);
    const body = partnerOverviewResponse.parse(await (await get(w, '/api/partner/overview', other)).json());
    expect(body.today.emergencies).toEqual([]);
  });
});

describe('partner office: dispatch', () => {
  it('R3: skills and a day away decide the suggestion for an unassigned emergency', async () => {
    const w = await world();
    const token = await office(w);
    await emergency(w);
    const put = await send(w, 'PUT', '/api/partner/technicians/t-primary/skills', token, {
      skills: ['plumbing', 'ac'],
    });
    expect(technicianSkillsResponse.parse(await put.json()).skills).toEqual(['ac', 'plumbing']);
    const plan = async () =>
      dispatchResponse.parse(await (await get(w, `/api/partner/dispatch?date=${TODAY}`, token)).json());
    let day = await plan();
    expect(day.technicians.map((t) => [t.id, t.available])).toEqual([['t-primary', true]]);
    expect(day.unassigned[0]?.skill).toBe('plumbing');
    expect(day.unassigned[0]?.suggested).toEqual(['t-primary']);

    const added = await send(w, 'POST', '/api/partner/technicians/t-primary/unavailable', token, {
      from: TODAY,
      to: '2026-11-11',
      reason: 'sick',
    });
    expect(added.status).toBe(201);
    const { id: entryId } = await added.json<{ id: string }>();
    day = await plan();
    expect(day.technicians[0]?.unavailableReason).toBe('sick');
    expect(day.unassigned[0]?.suggested).toEqual([]);
    const overview = partnerOverviewResponse.parse(
      await (await get(w, '/api/partner/overview', token)).json(),
    );
    expect(overview.unavailableToday).toEqual([
      { technicianId: 't-primary', name: 'Team member', reason: 'sick', until: '2026-11-11' },
    ]);

    // The technician can read their own days away, not change them.
    const own = await get(w, '/api/partner/technicians/t-primary/unavailable', w.primaryToken);
    expect(technicianUnavailableResponse.parse(await own.json()).entries).toHaveLength(1);
    expect(
      (await send(w, 'PUT', '/api/partner/technicians/t-primary/skills', w.primaryToken, { skills: [] }))
        .status,
    ).toBe(403);

    const removed = await w.h.request(`/api/partner/technicians/t-primary/unavailable/${entryId}`, {
      method: 'DELETE',
      token,
    });
    expect(technicianUnavailableResponse.parse(await removed.json()).entries).toEqual([]);
    expect((await plan()).unassigned[0]?.suggested).toEqual(['t-primary']);
    const actions = rows(w, "SELECT action FROM audit_log WHERE action LIKE 'technician_%' ORDER BY seq");
    expect(actions).toEqual([
      { action: 'technician_skills_set' },
      { action: 'technician_unavailable_added' },
      { action: 'technician_unavailable_removed' },
    ]);
  });

  it('C-AZ-2: another company’s technician is not found; dates are validated', async () => {
    const w = await world();
    const token = await office(w);
    expect((await get(w, '/api/partner/technicians/t-backup/skills', token)).status).toBe(404);
    expect((await get(w, '/api/partner/technicians/t-backup/skills', w.primaryToken)).status).toBe(404);
    const bad = await send(w, 'POST', '/api/partner/technicians/t-primary/unavailable', token, {
      from: '2026-11-12',
      to: TODAY,
      reason: 'leave',
    });
    expect(bad.status).toBe(400);
    const past = await send(w, 'POST', '/api/partner/technicians/t-primary/unavailable', token, {
      from: '2026-09-01',
      to: '2026-09-02',
      reason: 'leave',
    });
    expect(past.status).toBe(400);
    expect((await get(w, '/api/partner/dispatch?date=2026-13-01', token)).status).toBe(400);
  });
});

describe('partner office: messages and quotes', () => {
  it('ADR 0009: a job where the resident spoke last is awaiting reply', async () => {
    const w = await world();
    const token = await office(w);
    const id = await emergency(w);
    await send(w, 'POST', `/api/requests/${id}/messages`, w.tenantToken, {
      body: 'The water is still coming.',
    });
    const { threads } = partnerMessagesResponse.parse(
      await (await get(w, '/api/partner/messages', token)).json(),
    );
    expect(threads).toHaveLength(1);
    expect(threads[0]).toMatchObject({
      requestId: id,
      lastFrom: 'resident',
      awaitingReply: true,
      messages: 1,
    });
  });

  it('A2: quotes show days left before expiry, and this month’s conversion', async () => {
    const w = await world();
    const id = await emergency(w);
    const quote = w.h.sqlite.prepare(
      `INSERT INTO quotes (id, request_id, partner_id, revision, amount_fils, scope, is_make_safe, status, sent_at,
         expires_at, decided_at, decided_by_user_id) VALUES (?, ?, 'p-primary', ?, ?, 'Replace pipe.', 0, ?, ?, ?, ?, ?)`,
    );
    quote.run('q-1', id, 1, 50_000, 'declined', NOW, NOW + 14 * DAY, NOW, w.owner);
    quote.run('q-2', id, 2, 40_000, 'pending', NOW, NOW + 14 * DAY, null, null);
    w.h.clock = NOW + 4 * DAY;
    const token = await office(w);
    const body = partnerQuotesResponse.parse(await (await get(w, '/api/partner/quotes', token)).json());
    expect(body.quotes.map((q) => [q.id, q.daysLeft])).toEqual([
      ['q-2', 10],
      ['q-1', null],
    ]);
    expect(body.thisMonth).toMatchObject({ sent: 2, approved: 0, quotedFils: 90_000, conversionPercent: 0 });
    const pending = partnerQuotesResponse.parse(
      await (await get(w, '/api/partner/quotes?status=pending', token)).json(),
    );
    expect(pending.quotes.map((q) => q.id)).toEqual(['q-2']);
    expect((await get(w, '/api/partner/quotes?status=lost', token)).status).toBe(400);
  });
});

describe('partner office: after-hours contact (E5-E7)', () => {
  it('E6: the office names this week’s contact; technicians can see it; past weeks are fixed', async () => {
    const w = await world();
    const token = await office(w);
    const put = await send(w, 'PUT', '/api/partner/after-hours', token, {
      weekStarting: MONDAY,
      technicianId: 't-primary',
    });
    expect(afterHoursResponse.parse(await put.json()).weeks[0]).toEqual({
      weekStarting: MONDAY,
      technicianId: 't-primary',
      name: 'Team member',
    });
    const seen = afterHoursResponse.parse(
      await (await get(w, '/api/partner/after-hours', w.primaryToken)).json(),
    );
    expect(seen.weeks).toHaveLength(8);
    expect(seen.weeks[0]?.technicianId).toBe('t-primary');
    expect(
      (
        await send(w, 'PUT', '/api/partner/after-hours', token, {
          weekStarting: '2026-11-02',
          technicianId: null,
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await send(w, 'PUT', '/api/partner/after-hours', token, {
          weekStarting: MONDAY,
          technicianId: 't-backup',
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await send(w, 'PUT', '/api/partner/after-hours', w.primaryToken, {
          weekStarting: MONDAY,
          technicianId: null,
        })
      ).status,
    ).toBe(403);
    const cleared = await send(w, 'PUT', '/api/partner/after-hours', token, {
      weekStarting: MONDAY,
      technicianId: null,
    });
    expect(afterHoursResponse.parse(await cleared.json()).weeks[0]?.technicianId).toBeNull();
    expect(rows(w, "SELECT count(*) AS n FROM audit_log WHERE action = 'after_hours_contact_set'")).toEqual([
      { n: 2 },
    ]);
  });
});
