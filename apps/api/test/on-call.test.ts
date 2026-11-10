/** Weekly on-call rota (section 11, E6, E7): C-AZ-1, C-VAL-1, C-AUD-1. NOW is Monday 9-Nov-2026. */
import { describe, expect, it } from 'vitest';
import { harness } from './harness.js';

async function staff() {
  const h = harness();
  const admin = await h.addUser({ email: 'demo@jadplus.ae', roles: ['jad_admin'] });
  const viewer = await h.addUser({ email: 'viewer@example.com', roles: ['jad_viewer'] });
  const owner = await h.addUser({ email: 'layla.haddad@example.com', roles: ['owner'] });
  return {
    h,
    admin,
    viewer,
    owner,
    adminToken: await h.signIn('demo@jadplus.ae', 'console'),
    viewerToken: await h.signIn('viewer@example.com', 'console'),
  };
}

describe('on-call rota', () => {
  it('section 11: an admin sets a week (admin + second person); staff read it with gaps shown', async () => {
    const { h, admin, viewer, adminToken, viewerToken } = await staff();
    const put = await h.request('/api/admin/on-call/2026-11-16', {
      method: 'PUT',
      token: adminToken,
      json: { first: admin, second: viewer },
    });
    expect(put.status).toBe(200);
    const res = await h.request('/api/admin/on-call', { token: viewerToken });
    const { weeks } = await res.json<{ weeks: { weekStarting: string; first: string | null }[] }>();
    expect(weeks).toHaveLength(12);
    expect(weeks.slice(0, 2)).toEqual([
      { weekStarting: '2026-11-09', first: null, second: null },
      { weekStarting: '2026-11-16', first: admin, second: viewer },
    ]);
    expect(
      h.sqlite.prepare("SELECT target_id FROM audit_log WHERE action = 'on_call_rota_set'").all(),
    ).toEqual([{ target_id: '2026-11-16' }]);
  });

  it('section 11: the first person must be a JAD+ Admin; owners are never on call; two different people', async () => {
    const { h, admin, viewer, owner, adminToken } = await staff();
    const set = (json: object) =>
      h.request('/api/admin/on-call/2026-11-16', { method: 'PUT', token: adminToken, json });
    expect((await set({ first: viewer, second: admin })).status).toBe(422);
    expect((await set({ first: admin, second: owner })).status).toBe(422);
    expect((await set({ first: admin, second: admin })).status).toBe(400);
  });

  it('C-VAL-1: weeks start on a Monday; past weeks cannot be changed; only admins change the rota', async () => {
    const { h, admin, viewer, adminToken, viewerToken } = await staff();
    const json = { first: admin, second: viewer };
    expect(
      (await h.request('/api/admin/on-call/2026-11-17', { method: 'PUT', token: adminToken, json })).status,
    ).toBe(404);
    expect(
      (await h.request('/api/admin/on-call/2026-11-02', { method: 'PUT', token: adminToken, json })).status,
    ).toBe(422);
    expect(
      (await h.request('/api/admin/on-call/2026-11-16', { method: 'PUT', token: viewerToken, json })).status,
    ).toBe(403);
    expect((await h.request('/api/admin/on-call?from=2026-11-17', { token: viewerToken })).status).toBe(400);
  });
});
