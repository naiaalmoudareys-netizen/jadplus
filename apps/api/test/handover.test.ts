/**
 * Handover checklist (O2; ADR 0033): opened from the owner's handover request by the JAD Global team that has it
 * (or JAD+ Admin), ticked step by step, key collection booked; the owner follows it. C-AZ-1, C-AZ-2, C-PD-2,
 * C-AUD-1.
 */
import { HANDOVER_STEPS, ownerHandoversResponse, staffHandoversResponse } from '@jadplus/shared';
import { describe, expect, it } from 'vitest';
import { NOW, insert, requestRow } from './db.js';
import { rows, world, type World } from './emergency-world.js';
import { ownerRecord } from './harness.js';

type Setup = World & { admin: string; viewer: string; team: string; otherOffice: string; otherOwner: string };

async function setup(): Promise<Setup> {
  const w = await world();
  const db = w.h.sqlite;
  await w.h.addUser({ email: 'demo@jadplus.ae', roles: ['jad_admin'] });
  await w.h.addUser({ email: 'viewer@jadplus.ae', roles: ['jad_viewer'] });
  await w.h.addUser({ email: 'harbor.pm.demo@jadplus.ae', roles: [['partner_admin', 'p-harbor']] });
  await w.h.addUser({ email: 'other.office@example.com', roles: [['partner_admin', 'p-other']] });
  db.prepare(
    "UPDATE partners SET kind = 'jad_group', name = 'Harbor Property Management (demo)' WHERE id = 'p-harbor'",
  ).run();
  db.prepare(
    "INSERT INTO service_partners (id, service_code, partner_id, rank, started_at) VALUES ('sp-h', 'handover', 'p-harbor', 'primary', ?)",
  ).run(NOW);
  const email = 'other.owner@example.com';
  await w.h.addUser({ email, roles: ['owner'] });
  w.h.salesforce.set(`email:${email}`, ownerRecord(email, ['a0X000000000008AAA']));
  insert(
    db,
    'requests',
    requestRow({
      id: 'req-h',
      ref: 'JAD-H0001',
      service_code: 'handover',
      owner_user_id: w.owner,
      tenancy_id: null,
      raised_by_user_id: w.owner,
      raised_by_role: 'owner',
      description: 'Please guide me to key collection.',
      status: 'assigned',
      partner_id: 'p-harbor',
    }),
  );
  return {
    ...w,
    admin: await w.h.signIn('demo@jadplus.ae', 'console'),
    viewer: await w.h.signIn('viewer@jadplus.ae', 'console'),
    team: await w.h.signIn('harbor.pm.demo@jadplus.ae', 'console'),
    otherOffice: await w.h.signIn('other.office@example.com', 'console'),
    otherOwner: await w.h.signIn(email),
  };
}

const start = (w: World, token: string, base = 'partner', requestId = 'req-h') =>
  w.h.request(`/api/${base}/handovers`, { method: 'POST', token, json: { requestId } });

const tick = (w: World, token: string, id: string, step: string, done = true, note: string | null = null) =>
  w.h.request(`/api/partner/handovers/${id}/steps`, { method: 'POST', token, json: { step, done, note } });

const book = (w: World, token: string, id: string, date: string, base = 'partner') =>
  w.h.request(`/api/${base}/handovers/${id}/appointment`, {
    method: 'PUT',
    token,
    json: { date, slot: 'morning' },
  });

async function started(w: Setup): Promise<string> {
  const res = await start(w, w.team);
  expect(res.status).toBe(201);
  return (await res.json<{ id: string }>()).id;
}

const staffList = async (w: World, token: string, base = 'partner') =>
  staffHandoversResponse.parse(await (await w.h.request(`/api/${base}/handovers`, { token })).json());

describe('handover checklist: starting (O2)', () => {
  it('O2/C-AUD-1: the team that has the handover request opens the checklist; every step starts pending, in order', async () => {
    const w = await setup();
    expect((await staffList(w, w.team)).waiting.map((r) => r.requestRef)).toEqual(['JAD-H0001']);
    const id = await started(w);
    const list = await staffList(w, w.team);
    expect(list.waiting).toEqual([]);
    expect(list.handovers).toHaveLength(1);
    const [h] = list.handovers;
    expect(h?.steps.map((s) => s.step)).toEqual([...HANDOVER_STEPS]);
    expect(h?.steps.every((s) => s.doneAt === null)).toBe(true);
    expect(h).toMatchObject({ requestRef: 'JAD-H0001', unitName: 'JAD288-1100', project: 'JAD 288' });
    expect(rows(w, "SELECT target_id, detail FROM audit_log WHERE action = 'handover_started'")).toEqual([
      { target_id: id, detail: JSON.stringify({ requestId: 'req-h' }) },
    ]);
    // One checklist per unit.
    expect((await start(w, w.team)).status).toBe(409);
    expect((await start(w, w.admin, 'admin')).status).toBe(409);
  });

  it('O2/C-AZ-2: another office, a technician, owners, tenants and viewers cannot open one; only handover requests', async () => {
    const w = await setup();
    expect((await start(w, w.otherOffice)).status).toBe(404);
    expect((await start(w, w.primaryToken)).status).toBe(403);
    expect((await start(w, w.ownerToken)).status).toBe(403);
    expect((await start(w, w.tenantToken)).status).toBe(403);
    expect((await start(w, w.viewer, 'admin')).status).toBe(403);
    expect((await staffList(w, w.otherOffice)).waiting).toEqual([]);
    insert(
      w.h.sqlite,
      'requests',
      requestRow({
        id: 'req-m',
        ref: 'JAD-M0001',
        owner_user_id: w.owner,
        raised_by_user_id: w.tenant,
        partner_id: 'p-harbor',
        status: 'assigned',
      }),
    );
    expect((await start(w, w.team, 'partner', 'req-m')).status).toBe(422);
    expect(rows(w, 'SELECT id FROM handover_checklists')).toEqual([]);
    // JAD+ Admin may open it for any handover request.
    expect((await start(w, w.admin, 'admin')).status).toBe(201);
  });
});

describe('handover checklist: steps and key collection (O2)', () => {
  it('O2/C-PD-2: a step is ticked with a note for the owner; the note is stored encrypted and never audited', async () => {
    const w = await setup();
    const id = await started(w);
    const res = await tick(w, w.team, id, 'final_payment', true, 'Cleared on the bank statement, ref 4471.');
    expect(res.status).toBe(200);
    const stored = rows(w, "SELECT note_enc, done_by FROM handover_steps WHERE step = 'final_payment'") as {
      note_enc: Uint8Array;
      done_by: string;
    }[];
    expect(new TextDecoder('latin1').decode(stored[0]?.note_enc)).not.toContain('4471');
    const audits = rows(w, "SELECT detail FROM audit_log WHERE action = 'handover_step_changed'") as {
      detail: string;
    }[];
    expect(JSON.parse(audits[0]?.detail ?? '{}')).toEqual({ step: 'final_payment', done: true, note: true });
    expect(w.h.logs.join('\n')).not.toMatch(/4471/);
    const [h] = (await staffList(w, w.team)).handovers;
    expect(h?.steps[0]).toEqual({
      step: 'final_payment',
      doneAt: NOW,
      note: 'Cleared on the bank statement, ref 4471.',
    });
    // Put back to pending (a mistake), then again done.
    expect((await tick(w, w.team, id, 'final_payment', false)).status).toBe(200);
    expect((await tick(w, w.team, id, 'final_payment', false)).status).toBe(409);
    expect((await tick(w, w.team, id, 'final_payment', true)).status).toBe(200);
  });

  it('O2: key collection is booked on a working day after the final payment; that completes its step', async () => {
    const w = await setup();
    const id = await started(w);
    expect((await book(w, w.team, id, '2026-11-12')).status).toBe(422);
    expect((await tick(w, w.team, id, 'final_payment')).status).toBe(200);
    expect((await book(w, w.team, id, '2026-11-14')).status).toBe(422);
    expect((await book(w, w.team, id, '2026-11-01')).status).toBe(422);
    expect((await tick(w, w.team, id, 'key_appointment')).status).toBe(409);
    expect((await book(w, w.team, id, '2026-11-12')).status).toBe(200);
    expect((await book(w, w.admin, id, '2026-11-13', 'admin')).status).toBe(200);
    const [h] = (await staffList(w, w.admin, 'admin')).handovers;
    expect(h?.appointment).toEqual({ date: '2026-11-13', slot: 'morning' });
    expect(h?.steps.find((s) => s.step === 'key_appointment')?.doneAt).toBe(NOW);
    expect(
      rows(w, "SELECT detail FROM audit_log WHERE action = 'handover_appointment_set' ORDER BY seq"),
    ).toEqual([
      { detail: JSON.stringify({ date: '2026-11-12', slot: 'morning', moved: false }) },
      { detail: JSON.stringify({ date: '2026-11-13', slot: 'morning', moved: true }) },
    ]);
  });

  it('O2: keys are collected only when every other step is done; then the checklist is complete and locked', async () => {
    const w = await setup();
    const id = await started(w);
    expect((await tick(w, w.team, id, 'keys_collected')).status).toBe(409);
    for (const step of ['final_payment', 'documents', 'snagging', 'utilities', 'service_charges']) {
      expect((await tick(w, w.team, id, step)).status).toBe(200);
    }
    expect((await tick(w, w.team, id, 'keys_collected')).status).toBe(409);
    expect((await book(w, w.team, id, '2026-11-12')).status).toBe(200);
    const done = await tick(w, w.team, id, 'keys_collected');
    expect(done.status).toBe(200);
    expect((await done.json<{ completedAt: number }>()).completedAt).toBe(NOW);
    expect((await tick(w, w.team, id, 'documents', false)).status).toBe(409);
    expect((await book(w, w.team, id, '2026-11-13')).status).toBe(422);
  });

  it('O2/C-AZ-1/C-AZ-2: only the team that has the request, or JAD+ Admin, changes it', async () => {
    const w = await setup();
    const id = await started(w);
    expect((await tick(w, w.otherOffice, id, 'documents')).status).toBe(404);
    expect((await tick(w, w.primaryToken, id, 'documents')).status).toBe(403);
    expect((await tick(w, w.ownerToken, id, 'documents')).status).toBe(403);
    const asViewer = await w.h.request(`/api/admin/handovers/${id}/steps`, {
      method: 'POST',
      token: w.viewer,
      json: { step: 'documents', done: true, note: null },
    });
    expect(asViewer.status).toBe(403);
    const asAdmin = await w.h.request(`/api/admin/handovers/${id}/steps`, {
      method: 'POST',
      token: w.admin,
      json: { step: 'documents', done: true, note: null },
    });
    expect(asAdmin.status).toBe(200);
    expect((await tick(w, w.team, id, 'documents', true, '<b>x</b>')).status).toBe(400);
    expect((await staffList(w, w.otherOffice)).handovers).toEqual([]);
    // Reassigning the request moves the checklist with it.
    w.h.sqlite.prepare("UPDATE requests SET partner_id = 'p-other' WHERE id = 'req-h'").run();
    expect((await tick(w, w.team, id, 'utilities')).status).toBe(404);
    expect((await tick(w, w.otherOffice, id, 'utilities')).status).toBe(200);
  });
});

describe('handover checklist: the owner (O2)', () => {
  it('O2/C-AZ-2: the owner sees progress, notes and the appointment; another owner sees nothing; tenants never', async () => {
    const w = await setup();
    const id = await started(w);
    await tick(w, w.team, id, 'final_payment', true, 'All paid.');
    await book(w, w.team, id, '2026-11-12');
    const mine = ownerHandoversResponse.parse(
      await (await w.h.request('/api/me/handovers', { token: w.ownerToken })).json(),
    ).handovers;
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({
      id,
      requestId: 'req-h',
      unitName: 'JAD288-1100',
      appointment: { date: '2026-11-12', slot: 'morning' },
    });
    expect(mine[0]?.steps[0]).toEqual({ step: 'final_payment', doneAt: NOW, note: 'All paid.' });
    expect(mine[0]).not.toHaveProperty('partnerName');
    const other = ownerHandoversResponse.parse(
      await (await w.h.request('/api/me/handovers', { token: w.otherOwner })).json(),
    ).handovers;
    expect(other).toEqual([]);
    expect((await w.h.request('/api/me/handovers', { token: w.tenantToken })).status).toBe(403);
    expect((await w.h.request('/api/me/handovers', { token: w.team })).status).toBe(403);
  });
});
