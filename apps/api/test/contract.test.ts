/**
 * The API's answers match the shared response schemas the apps validate against (C-VAL-1), and the partner
 * team list used to name who attends (E4, E17).
 */
import { meResponse, partnerJobsResponse, partnerTeamResponse, sessionResponse } from '@jadplus/shared';
import { describe, expect, it } from 'vitest';
import { EMAILS, leak, raise, world } from './emergency-world.js';

describe('API answers match the app contract (C-VAL-1)', () => {
  it('sign-in and "who am I" answers parse with the shared schemas', async () => {
    const w = await world();
    await w.h.request('/api/auth/code', { method: 'POST', json: { email: EMAILS.owner } });
    const verify = await w.h.request('/api/auth/verify', {
      method: 'POST',
      json: { email: EMAILS.owner, code: w.h.outbox.at(-1)?.code ?? '', client: 'mobile' },
    });
    const session = sessionResponse.parse(await verify.json());
    const me = await w.h.request('/api/auth/me', { token: session.token });
    expect(meResponse.safeParse(await me.json()).success).toBe(true);
  });

  it('R3: the partner job queue parses with the shared schema', async () => {
    const w = await world();
    await raise(w, leak);
    const res = await w.h.request('/api/partner/jobs', { token: w.primaryToken });
    const { jobs } = partnerJobsResponse.parse(await res.json());
    expect(jobs).toHaveLength(1);
  });
});

describe('partner team (E4, E17)', () => {
  it('E17: lists only this partner’s active technicians, marking the signed-in one', async () => {
    const w = await world();
    w.h.sqlite
      .prepare(
        "UPDATE users SET name_enc = NULL WHERE id = (SELECT user_id FROM technicians WHERE id = 't-primary')",
      )
      .run();
    const res = await w.h.request('/api/partner/team', { token: w.primaryToken });
    const team = partnerTeamResponse.parse(await res.json());
    expect(team.partner).toMatchObject({ id: 'p-primary', name: 'Primary Fixers LLC' });
    expect(team.technicians).toEqual([{ id: 't-primary', name: 'Team member', self: true }]);

    w.h.sqlite
      .prepare(
        "UPDATE technicians SET status = 'removed', removed_reason = 'Misconduct', removed_at = ? WHERE id = 't-primary'",
      )
      .run(w.h.clock);
    const after = partnerTeamResponse.parse(
      await (await w.h.request('/api/partner/team', { token: w.primaryToken })).json(),
    );
    expect(after.technicians).toEqual([]);
  });

  it('C-AZ-1: owners and tenants cannot see a partner team', async () => {
    const w = await world();
    expect((await w.h.request('/api/partner/team', { token: w.ownerToken })).status).toBe(403);
  });
});
