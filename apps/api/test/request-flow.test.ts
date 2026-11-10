/** The request journey (ADR 0018): R3, E4, E10, L4, A2, A3, A4, A5, S4, S5, C-AZ-2, C-VAL-1. */
import {
  DEFAULT_CALENDAR,
  dubaiDate,
  preferredDays,
  requestDetailResponse,
  requestRaisedResponse,
} from '@jadplus/shared';
import { describe, expect, it } from 'vitest';
import { encryptField, importKeys } from '../src/crypto.js';
import { runRequestClock } from '../src/jobs/request-clock.js';
import { createLogger } from '../src/logger.js';
import { NOW, SF_UNIT } from './db.js';
import { rows, world, type World } from './emergency-world.js';
import { TEST_DATA_KEY, TEST_INDEX_KEY } from './harness.js';

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
const visit = (w: World, id: string, token = w.primaryToken, technicianId = 't-primary') =>
  post(w, `/api/partner/jobs/${id}/visit`, token, {
    technicianId,
    windowStart: w.h.clock + HOUR,
    windowEnd: w.h.clock + 3 * HOUR,
  });
const quote = (w: World, id: string, amountAed = 450) =>
  post(w, `/api/partner/jobs/${id}/quote`, w.primaryToken, { amountAed, scope: 'Replace the cartridge.' });
const detail = async (w: World, id: string, token = w.ownerToken) =>
  requestDetailResponse.parse(await (await w.h.request(`/api/requests/${id}`, { token })).json());
const decide = (w: World, id: string, quoteId: string, decision: string, token = w.ownerToken) =>
  post(w, `/api/requests/${id}/quote-decision`, token, { quoteId, decision });
const status = (w: World, id: string) =>
  w.h.sqlite.prepare('SELECT status, close_reason FROM requests WHERE id = ?').get(id);
/** Gives the primary partner's technician a (fictional) name, as a real account has. */
async function nameTechnician(w: World): Promise<void> {
  const { user_id: userId } = w.h.sqlite
    .prepare("SELECT user_id FROM technicians WHERE id = 't-primary'")
    .get() as { user_id: string };
  const keys = await importKeys(TEST_INDEX_KEY, TEST_DATA_KEY);
  const name = await encryptField(keys, 'Sami Demo', `users.name:${userId}`);
  w.h.sqlite.prepare('UPDATE users SET name_enc = ? WHERE id = ?').run(name, userId);
}

const clock = (w: World) =>
  runRequestClock(
    w.h.env.DB,
    w.h.clock,
    createLogger({}, () => undefined),
  );

describe('partner steps', () => {
  it('E4/S4: booking the visit shows the technician and window to the owner and records the first response', async () => {
    const w = await world();
    await nameTechnician(w);
    const id = await routine(w);
    expect((await detail(w, id, w.primaryToken)).actions).toEqual(['book_visit', 'send_quote']);
    expect((await visit(w, id)).status).toBe(200);
    const d = await detail(w, id);
    expect(d.request.status).toBe('scheduled');
    expect(d.visit).toMatchObject({ start: NOW + HOUR, end: NOW + 3 * HOUR });
    expect(d.visit?.technician).toBe('Sami Demo');
    expect(rows(w, `SELECT metric, outcome FROM sla_outcomes WHERE request_id = '${id}'`)).toEqual([
      { metric: 'routine_response', outcome: 'met' },
    ]);
    // Moving the visit keeps one live booking.
    await visit(w, id);
    expect(rows(w, `SELECT status FROM visits WHERE request_id = '${id}' ORDER BY rowid`)).toEqual([
      { status: 'cancelled' },
      { status: 'booked' },
    ]);
  });

  it('C-AZ-2: another partner cannot touch the job; an unknown technician or a bad window is refused', async () => {
    const w = await world();
    const id = await routine(w);
    expect((await visit(w, id, w.backupToken, 't-backup')).status).toBe(404);
    expect((await visit(w, id, w.primaryToken, 't-backup')).status).toBe(400);
    const tooLong = await post(w, `/api/partner/jobs/${id}/visit`, w.primaryToken, {
      technicianId: 't-primary',
      windowStart: NOW + HOUR,
      windowEnd: NOW + 9 * HOUR,
    });
    expect(tooLong.status).toBe(400);
    expect((await post(w, `/api/partner/jobs/${id}/visit`, w.ownerToken, {})).status).toBe(403);
  });

  it('steps happen in order: work cannot be marked done before it starts', async () => {
    const w = await world();
    const id = await routine(w);
    expect((await post(w, `/api/partner/jobs/${id}/done`, w.primaryToken)).status).toBe(409);
    await visit(w, id);
    expect((await post(w, `/api/partner/jobs/${id}/start`, w.primaryToken)).status).toBe(200);
    const done = await post(w, `/api/partner/jobs/${id}/done`, w.primaryToken, {
      note: 'Cartridge replaced.',
    });
    expect(done.status).toBe(200);
    const d = await detail(w, id);
    expect(d.request.status).toBe('completed');
    expect(d.actions).toEqual(['confirm_done', 'not_done']);
    expect(d.messages.map((m) => m.body)).toEqual(['Cartridge replaced.']);
  });
});

describe('quotes (L4, A2, A3)', () => {
  it('L4: only the owner approves; approval books the work', async () => {
    const w = await world();
    const id = await routine(w);
    expect((await quote(w, id, 450.5)).status).toBe(201);
    const d = await detail(w, id);
    expect(d.quote).toMatchObject({
      amountAed: 450.5,
      revision: 1,
      status: 'pending',
      expiresAt: NOW + 14 * DAY,
    });
    expect(d.actions).toEqual(['approve_quote', 'decline_quote']);
    const quoteId = d.quote?.id ?? '';
    expect((await decide(w, id, quoteId, 'approve', w.tenantToken)).status).toBe(403);
    expect((await quote(w, id)).status).toBe(409); // no second quote while one waits
    expect((await decide(w, id, quoteId, 'approve')).status).toBe(200);
    expect(status(w, id)).toEqual({ status: 'scheduled', close_reason: null });
    expect(rows(w, 'SELECT status, decided_by_user_id FROM quotes')).toEqual([
      { status: 'approved', decided_by_user_id: w.owner },
    ]);
  });

  it('A3: a declined quote goes back to the partner for ONE revised quote; declining that closes', async () => {
    const w = await world();
    const id = await routine(w);
    await quote(w, id);
    await decide(w, id, (await detail(w, id)).quote?.id ?? '', 'decline');
    expect(status(w, id)).toEqual({ status: 'assigned', close_reason: null });
    expect((await quote(w, id, 380)).status).toBe(201);
    const revised = await detail(w, id);
    expect(revised.quote).toMatchObject({ revision: 2, amountAed: 380 });
    await decide(w, id, revised.quote?.id ?? '', 'decline');
    expect(status(w, id)).toEqual({ status: 'closed', close_reason: 'quote_declined' });
  });

  it('A2: a quote nobody decides expires after 14 days and the request closes', async () => {
    const w = await world();
    const id = await routine(w);
    await quote(w, id);
    w.h.clock = NOW + 14 * DAY - 1;
    expect((await clock(w)).expiredQuotes).toBe(0);
    w.h.clock = NOW + 14 * DAY;
    expect((await clock(w)).expiredQuotes).toBe(1);
    expect(status(w, id)).toEqual({ status: 'closed', close_reason: 'quote_expired' });
    expect(rows(w, 'SELECT status FROM quotes')).toEqual([{ status: 'expired' }]);
  });
});

describe('finishing (E10, A4, A5, S5)', () => {
  async function finished(w: World): Promise<string> {
    const id = await routine(w);
    await visit(w, id);
    await post(w, `/api/partner/jobs/${id}/start`, w.primaryToken);
    await post(w, `/api/partner/jobs/${id}/done`, w.primaryToken);
    return id;
  }

  it('E10/S5: the tenant confirms, the owner rates once, and the rating counts for the partner', async () => {
    const w = await world();
    const id = await finished(w);
    expect((await post(w, `/api/requests/${id}/confirm`, w.tenantToken, { done: true })).status).toBe(200);
    expect(status(w, id)).toEqual({ status: 'closed', close_reason: 'confirmed' });
    const rated = await post(w, `/api/requests/${id}/rating`, w.ownerToken, { stars: 5, comment: 'Quick.' });
    expect(rated.status).toBe(201);
    expect((await post(w, `/api/requests/${id}/rating`, w.ownerToken, { stars: 1 })).status).toBe(409);
    expect(rows(w, 'SELECT partner_id, stars FROM ratings')).toEqual([{ partner_id: 'p-primary', stars: 5 }]);
  });

  it('A5: "not done" reopens the job with the same partner, who books a repeat visit', async () => {
    const w = await world();
    const id = await finished(w);
    await post(w, `/api/requests/${id}/confirm`, w.ownerToken, { done: false });
    expect(status(w, id)).toEqual({ status: 'reopened', close_reason: null });
    await visit(w, id);
    expect(rows(w, `SELECT is_repeat FROM visits WHERE request_id = '${id}' AND status = 'booked'`)).toEqual([
      { is_repeat: 1 },
    ]);
  });

  it('A4: finished work nobody confirms closes by itself after 72 hours', async () => {
    const w = await world();
    const id = await finished(w);
    w.h.clock = NOW + 71 * HOUR;
    expect((await clock(w)).autoClosed).toBe(0);
    w.h.clock = NOW + 72 * HOUR;
    expect((await clock(w)).autoClosed).toBe(1);
    expect(status(w, id)).toEqual({ status: 'closed', close_reason: 'auto_closed' });
    expect(rows(w, "SELECT count(*) AS n FROM audit_log WHERE action = 'request_auto_closed'")).toEqual([
      { n: 1 },
    ]);
  });

  it('C-AUD-1: every step is in the audit log', async () => {
    const w = await world();
    const id = await finished(w);
    await post(w, `/api/requests/${id}/confirm`, w.ownerToken, { done: true });
    expect(rows(w, `SELECT action FROM audit_log WHERE target_id = '${id}' ORDER BY rowid`)).toEqual([
      { action: 'request_raised' },
      { action: 'visit_booked' },
      { action: 'work_started' },
      { action: 'work_completed' },
      { action: 'work_confirmed' },
    ]);
  });
});
