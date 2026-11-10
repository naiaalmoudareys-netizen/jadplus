/** Raising an emergency: E1, E3, E12, E14, L3, S2, S3, S7, C-AZ-2. */
import { EMERGENCY_NUMBERS } from '@jadplus/shared';
import { describe, expect, it } from 'vitest';
import { SF_UNIT } from './db.js';
import { leak, raise, rows, world } from './emergency-world.js';

const JULY = Date.UTC(2026, 6, 15, 8, 0, 0);

describe('raising an emergency', () => {
  it('E1/L3: goes at once to the primary partner; the resident sees exactly the L3 text', async () => {
    const w = await world();
    const res = await raise(w, leak);
    expect(res.status).toBe(201);
    const body = await res.json<{ requestId: string; ref: string; confirmation: string }>();
    expect(body.confirmation).toBe(
      'Your emergency has been sent to Primary Fixers LLC. If anyone is in danger, call 999.',
    );
    expect(body.ref).toMatch(/^JAD-[2-9A-HJ-NP-Z]{6}$/);
    expect(rows(w, 'SELECT status, partner_id, next_due_kind FROM requests')).toEqual([
      { status: 'assigned', partner_id: 'p-primary', next_due_kind: 'emergency_ack' },
    ]);
  });

  it('E1: the partner gets a loud alert and the owner is told at the same moment', async () => {
    const w = await world();
    await raise(w, leak);
    expect(
      rows(
        w,
        'SELECT recipient_kind, recipient_partner_id, recipient_user_id, template, urgent FROM notifications ORDER BY template',
      ),
    ).toEqual([
      {
        recipient_kind: 'partner',
        recipient_partner_id: 'p-primary',
        recipient_user_id: null,
        template: 'emergency_new_job',
        urgent: 1,
      },
      {
        recipient_kind: 'user',
        recipient_partner_id: null,
        recipient_user_id: w.owner,
        template: 'emergency_owner_notice',
        urgent: 0,
      },
    ]);
  });

  it('C-AUD-1: the history and the audit log record who raised it and where it went', async () => {
    const w = await world();
    await raise(w, leak);
    expect(
      rows(
        w,
        'SELECT kind, actor_role, from_status, to_status, partner_id FROM request_events ORDER BY rowid',
      ),
    ).toEqual([
      { kind: 'created', actor_role: 'tenant', from_status: null, to_status: 'submitted', partner_id: null },
      {
        kind: 'status_changed',
        actor_role: 'system',
        from_status: 'submitted',
        to_status: 'assigned',
        partner_id: null,
      },
      { kind: 'assigned', actor_role: 'system', from_status: null, to_status: null, partner_id: 'p-primary' },
    ]);
    expect(rows(w, "SELECT actor_user_id FROM audit_log WHERE action = 'emergency_raised'")).toEqual([
      { actor_user_id: w.tenant },
    ]);
  });

  it('E3: fire, smoke, gas or injury shows only the emergency numbers; no technician is sent', async () => {
    const w = await world();
    const res = await raise(w, { ...leak, type: 'gas_smell' });
    expect(res.status).toBe(201);
    const body = await res.json<Record<string, unknown>>();
    expect(body).toMatchObject({ lifeSafety: true, numbers: EMERGENCY_NUMBERS });
    expect(body).not.toHaveProperty('confirmation');
    expect(rows(w, 'SELECT status, partner_id FROM requests')).toEqual([
      { status: 'submitted', partner_id: null },
    ]);
    expect(
      rows(
        w,
        "SELECT recipient_kind, template FROM notifications WHERE recipient_kind <> 'user' ORDER BY recipient_kind",
      ),
    ).toEqual([
      { recipient_kind: 'building_fm', template: 'emergency_life_safety' },
      { recipient_kind: 'on_call', template: 'emergency_life_safety' },
    ]);
  });

  it('E14: AC failure is an emergency from May to October only', async () => {
    const w = await world();
    const november = await raise(w, { ...leak, type: 'ac_failure' });
    expect(november.status).toBe(422);
    expect(await november.json()).toMatchObject({ code: 'not_emergency' });
    w.h.clock = JULY;
    expect(
      (await raise(w, { ...leak, type: 'ac_failure' }, await w.h.signIn('omar.tenant@example.com'))).status,
    ).toBe(201);
  });

  it('E12: water from shared parts goes to the partner AND building FM; fire systems to building FM only', async () => {
    const w = await world();
    await raise(w, { ...leak, faultSource: 'building' });
    expect(rows(w, "SELECT count(*) AS n FROM notifications WHERE recipient_kind = 'building_fm'")).toEqual([
      { n: 1 },
    ]);
    const sprinkler = await raise(w, { ...leak, faultSource: 'fire_system' });
    expect((await sprinkler.json<{ confirmation: string }>()).confirmation).toBe(
      'Your emergency has been sent to the building management team. If anyone is in danger, call 999.',
    );
    expect(rows(w, "SELECT partner_id FROM requests WHERE fault_source = 'fire_system'")).toEqual([
      { partner_id: null },
    ]);
  });

  it('S7: a suspended primary is skipped; the backup gets the job', async () => {
    const w = await world({ primaryStatus: 'suspended' });
    const body = await (await raise(w, leak)).json<{ confirmation: string }>();
    expect(body.confirmation).toContain('Backup Fixers LLC');
  });

  it('S2: with no partner able to work, on-call is alerted at once', async () => {
    const w = await world({ withPartners: false });
    const body = await (await raise(w, leak)).json<{ confirmation: string }>();
    expect(body.confirmation).toContain('the JAD+ on-call team');
    expect(rows(w, 'SELECT status, escalation FROM requests')).toEqual([
      { status: 'submitted', escalation: 'on_call' },
    ]);
    expect(rows(w, "SELECT template FROM notifications WHERE recipient_kind = 'on_call'")).toEqual([
      { template: 'emergency_on_call' },
    ]);
  });

  it('U6: an owner raises by unit; the current tenancy is linked; the owner gets no notice about themselves', async () => {
    const w = await world();
    const res = await raise(
      w,
      { sfUnitId: SF_UNIT, type: 'lockout', description: 'Locked out.' },
      w.ownerToken,
    );
    expect(res.status).toBe(201);
    expect(rows(w, 'SELECT raised_by_role, tenancy_id FROM requests')).toEqual([
      { raised_by_role: 'owner', tenancy_id: 'ten-1' },
    ]);
    expect(rows(w, "SELECT count(*) AS n FROM notifications WHERE recipient_kind = 'user'")).toEqual([
      { n: 0 },
    ]);
  });

  it('C-AZ-2: nobody can raise on a unit or tenancy that is not theirs, or after the tenancy ended', async () => {
    const w = await world();
    const notMine = await raise(
      w,
      { sfUnitId: 'a0X000000000999AAA', type: 'lockout', description: 'x' },
      w.ownerToken,
    );
    expect(notMine.status).toBe(404);
    expect((await raise(w, { ...leak, tenancyId: 'ten-unknown' })).status).toBe(404);
    expect((await raise(w, leak, w.ownerToken)).status).toBe(404); // owners raise by unit, not someone's tenancy
    expect((await raise(w, leak, w.primaryToken)).status).toBe(403);
    w.h.sqlite.prepare("UPDATE tenancies SET ends_on = '2026-11-08'").run();
    expect((await raise(w, leak)).status).toBe(404);
  });

  it('C-VAL-1: exactly one of tenancy or unit; unknown types refused', async () => {
    const w = await world();
    expect((await raise(w, { ...leak, sfUnitId: SF_UNIT })).status).toBe(400);
    expect((await raise(w, { ...leak, type: 'noise' })).status).toBe(400);
    expect((await raise(w, { type: 'lockout', description: 'x' })).status).toBe(400);
  });
});
