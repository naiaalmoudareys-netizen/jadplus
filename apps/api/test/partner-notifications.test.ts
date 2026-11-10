/** Notifications for partners and new messages (ADR 0024): E1, E5, E6, L4, A5, E10, S5, C-AZ-2. */
import { DEFAULT_CALENDAR, dubaiDate, inboxResponse, preferredDays } from '@jadplus/shared';
import { describe, expect, it } from 'vitest';
import { runEscalationSweep } from '../src/jobs/escalation.js';
import { createLogger } from '../src/logger.js';
import { NOW, SF_UNIT } from './db.js';
import { leak, raise, world, type World } from './emergency-world.js';

const MIN = 60_000;
const HOUR = 60 * MIN;

const post = (w: World, path: string, token: string, json: object = {}) =>
  w.h.request(path, { method: 'POST', token, json });
const items = async (w: World, token: string) =>
  inboxResponse.parse(await (await w.h.request('/api/me/inbox', { token })).json()).items;
const kinds = async (w: World, token: string) => (await items(w, token)).map((i) => i.kind);
const sweep = (w: World) =>
  runEscalationSweep(
    w.h.env.DB,
    w.h.clock,
    createLogger({}, () => undefined),
  );

async function routine(w: World): Promise<string> {
  const res = await post(w, '/api/requests', w.ownerToken, {
    sfUnitId: SF_UNIT,
    serviceCode: 'maintenance',
    description: 'Kitchen tap is dripping.',
    preferredDate: preferredDays(dubaiDate(NOW), DEFAULT_CALENDAR)[0],
    preferredSlot: 'morning',
  });
  return (await res.json<{ requestId: string }>()).requestId;
}

describe('partner notifications (ADR 0024)', () => {
  it('E1/R3: a new job reaches the partner’s technicians and office; an emergency is marked urgent', async () => {
    const w = await world();
    await w.h.addUser({ email: 'office@example.com', roles: [['partner_admin', 'p-primary']] });
    const office = await w.h.signIn('office@example.com', 'console');
    await raise(w, leak);
    const [item] = await items(w, w.primaryToken);
    expect(item).toMatchObject({ kind: 'job_new', data: { urgent: true } });
    expect(await kinds(w, office)).toEqual(['job_new']);
    expect(await kinds(w, w.backupToken)).toEqual([]);
  });

  it('E5/E6: the reminder at 15 minutes, then the backup gets the job and the first partner is told', async () => {
    const w = await world();
    await raise(w, leak);
    w.h.clock = NOW + 15 * MIN;
    await sweep(w);
    w.h.clock = NOW + 30 * MIN;
    await sweep(w);
    // The job is no longer theirs: only the notice that it moved stays visible (C-AZ-2).
    expect(await kinds(w, w.primaryToken)).toEqual(['job_moved_away']);
    expect(w.h.sqlite.prepare("SELECT count(*) AS n FROM inbox WHERE kind = 'job_reminder'").get()).toEqual({
      n: 1,
    });
    expect(await kinds(w, w.backupToken)).toEqual(['job_new']);
  });

  it('L4/E10/S5: quote decided, work confirmed and rating reach the technician who has the job', async () => {
    const w = await world();
    const id = await routine(w);
    await post(w, `/api/partner/jobs/${id}/quote`, w.primaryToken, { amountAed: 300, scope: 'Valve.' });
    const quoteId = (
      await (
        await w.h.request(`/api/requests/${id}`, { token: w.ownerToken })
      ).json<{ quote: { id: string } }>()
    ).quote.id;
    await post(w, `/api/requests/${id}/quote-decision`, w.ownerToken, { quoteId, decision: 'approve' });
    await post(w, `/api/partner/jobs/${id}/visit`, w.primaryToken, {
      technicianId: 't-primary',
      windowStart: NOW + HOUR,
      windowEnd: NOW + 3 * HOUR,
    });
    await post(w, `/api/partner/jobs/${id}/start`, w.primaryToken);
    await post(w, `/api/partner/jobs/${id}/done`, w.primaryToken);
    await post(w, `/api/requests/${id}/confirm`, w.ownerToken, { done: true });
    await post(w, `/api/requests/${id}/rating`, w.ownerToken, { stars: 5 });
    expect(await kinds(w, w.primaryToken)).toEqual([
      'job_rated',
      'work_confirmed',
      'quote_approved',
      'job_new',
    ]);
    expect((await items(w, w.primaryToken))[0]?.data).toEqual({ stars: 5 });
  });

  it('a message tells everyone else on the request, never the writer', async () => {
    const w = await world();
    const id = await routine(w);
    await post(w, `/api/requests/${id}/messages`, w.ownerToken, { body: 'The tap is in the kitchen.' });
    expect(await kinds(w, w.primaryToken)).toEqual(['message_received', 'job_new']);
    expect(await kinds(w, w.ownerToken)).not.toContain('message_received');
    await post(w, `/api/requests/${id}/messages`, w.primaryToken, { body: 'Thanks, see you tomorrow.' });
    expect(await kinds(w, w.ownerToken)).toContain('message_received');
  });

  it('cancelling tells the partner; the resident’s own items stay out of the partner’s view', async () => {
    const w = await world();
    const id = await routine(w);
    await post(w, `/api/requests/${id}/close`, w.ownerToken, { reason: 'cancel' });
    expect(await kinds(w, w.primaryToken)).toEqual(['job_cancelled', 'job_new']);
    expect(await kinds(w, w.ownerToken)).toEqual([]);
  });
});
