/** The technician's "Done" list and own numbers (ADR 0023): R3, S5, S8, C-AZ-2. */
import {
  DEFAULT_CALENDAR,
  dubaiDate,
  partnerJobsResponse,
  partnerStatsResponse,
  preferredDays,
  requestRaisedResponse,
} from '@jadplus/shared';
import { describe, expect, it } from 'vitest';
import { NOW, SF_UNIT } from './db.js';
import { world, type World } from './emergency-world.js';

const HOUR = 3_600_000;
const post = (w: World, path: string, token: string, json: object = {}) =>
  w.h.request(path, { method: 'POST', token, json });

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

describe('partner "Done" and numbers', () => {
  it('R3: finished jobs show under view=done, not in the open queue', async () => {
    const w = await world();
    const id = await finishedAndRated(w);
    const list = async (view: string) =>
      partnerJobsResponse
        .parse(await (await w.h.request(`/api/partner/jobs?view=${view}`, { token: w.primaryToken })).json())
        .jobs.map((j) => j.id);
    expect(await list('done')).toEqual([id]);
    expect(await list('open')).toEqual([]);
    expect((await w.h.request('/api/partner/jobs?view=all', { token: w.primaryToken })).status).toBe(400);
  });

  it('S5: the technician sees their own jobs done, on-time and average rating; others see nothing of it', async () => {
    const w = await world();
    await finishedAndRated(w);
    const stats = async (token: string) =>
      partnerStatsResponse.parse(await (await w.h.request('/api/partner/stats?days=30', { token })).json());
    expect(await stats(w.primaryToken)).toEqual({
      days: 30,
      scope: 'technician',
      jobsDone: 1,
      onTime: { met: 1, total: 1 },
      rating: { average: 4, count: 1 },
      repeatVisits: 0,
    });
    expect((await stats(w.backupToken)).jobsDone).toBe(0);
    expect((await w.h.request('/api/partner/stats', { token: w.ownerToken })).status).toBe(403);
  });
});
