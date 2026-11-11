/** Flow C "consultation" (ADR 0031): O5, O6, P5, S4, C-AZ-1, C-AZ-2, C-AUD-1, C-VAL-1. */
import {
  CONSULTATION_CONSENT_VERSION,
  CONSULTATION_SERVICE_CODES,
  CONSULTATION_STEP_IDS,
  DEFAULT_CALENDAR,
  addWorkingMinutes,
  adminAttentionResponse,
  consultationContactResponse,
  consultationProviderResponse,
  consultationRaisedResponse,
  consultationResponse,
  dubaiDate,
  preferredDays,
  requestRaisedResponse,
} from '@jadplus/shared';
import { describe, expect, it } from 'vitest';
import { NOW, SF_UNIT } from './db.js';
import { rows, world, type World } from './emergency-world.js';

const DAY = preferredDays(dubaiDate(NOW), DEFAULT_CALENDAR)[0] ?? '';
const WORKING_DAY = 9 * 60;

const leasing = {
  sfUnitId: SF_UNIT,
  serviceCode: 'leasing',
  answers: { furnished: 'unfurnished', available_from: '2026-12-15' },
  note: 'Looking for a yearly tenant.',
  bestDate: DAY,
  bestSlot: 'morning',
  providerId: 'harbor',
  consent: true,
  consentVersion: CONSULTATION_CONSENT_VERSION,
};

const post = (w: World, path: string, token: string, json: object = {}) =>
  w.h.request(path, { method: 'POST', token, json });

interface Offices {
  readonly w: World;
  /** The fictional JAD Global team's office (leasing, resale, property management). */
  readonly harbor: string;
  readonly harborMember: string;
  /** The outside partner's office (mortgage, Golden Visa). */
  readonly primary: string;
}

async function offices(): Promise<Offices> {
  const w = await world();
  const db = w.h.sqlite;
  db.prepare(
    "INSERT INTO partners (id, name, kind, created_at, updated_at) VALUES ('harbor', 'Harbor (demo)', 'jad_group', ?, ?)",
  ).run(NOW, NOW);
  const sp = db.prepare(
    "INSERT INTO service_partners (id, service_code, partner_id, rank, started_at) VALUES (?, ?, ?, 'primary', ?)",
  );
  for (const code of ['leasing', 'resale', 'property-management']) sp.run(`sp-${code}`, code, 'harbor', NOW);
  for (const code of ['mortgage', 'golden-visa']) sp.run(`sp-${code}`, code, 'p-primary', NOW);
  await w.h.addUser({ email: 'harbor.office@example.com', roles: [['partner_admin', 'harbor']] });
  await w.h.addUser({ email: 'harbor.member@example.com', roles: [['partner', 'harbor']] });
  await w.h.addUser({ email: 'primary.office@example.com', roles: [['partner_admin', 'p-primary']] });
  await w.h.addUser({ email: 'demo@jadplus.ae', roles: ['jad_admin'] });
  return {
    w,
    harbor: await w.h.signIn('harbor.office@example.com', 'console'),
    harborMember: await w.h.signIn('harbor.member@example.com'),
    primary: await w.h.signIn('primary.office@example.com', 'console'),
  };
}

async function raised(o: Offices, body: object = leasing): Promise<string> {
  const res = await post(o.w, '/api/consultations', o.w.ownerToken, body);
  expect(res.status).toBe(201);
  return consultationRaisedResponse.parse(await res.json()).requestId;
}

const view = async (o: Offices, id: string, token: string) =>
  consultationResponse.parse(
    await (await o.w.h.request(`/api/requests/${id}/consultation`, { token })).json(),
  ).consultation;

const step = (o: Offices, id: string, what: string, json: object = {}, token = o.harbor) =>
  post(o.w, `/api/partner/jobs/${id}/consultation/${what}`, token, json);

describe('asking for a consultation (O5)', () => {
  it('O5/S4: with consent and answers it goes to the provider with the first-contact clock; tenant not linked', async () => {
    const o = await offices();
    const res = await post(o.w, '/api/consultations', o.w.ownerToken, leasing);
    expect(res.status).toBe(201);
    const sent = consultationRaisedResponse.parse(await res.json());
    expect(sent.sentTo).toBe('Harbor (demo)');
    expect(
      rows(
        o.w,
        'SELECT status, partner_id, tenancy_id, next_due_at, next_due_kind, preferred_date FROM requests',
      ),
    ).toEqual([
      {
        status: 'assigned',
        partner_id: 'harbor',
        tenancy_id: null,
        next_due_at: addWorkingMinutes(NOW, WORKING_DAY, DEFAULT_CALENDAR),
        next_due_kind: 'first_contact',
        preferred_date: DAY,
      },
    ]);
    expect(rows(o.w, 'SELECT consent_partner_id, consent_version, consented_at FROM consultations')).toEqual([
      { consent_partner_id: 'harbor', consent_version: CONSULTATION_CONSENT_VERSION, consented_at: NOW },
    ]);
    expect(
      rows(
        o.w,
        "SELECT detail FROM audit_log WHERE action = 'consultation_consent_given' AND target_id = ?",
        sent.requestId,
      ),
    ).toEqual([{ detail: JSON.stringify({ partner: 'harbor', version: CONSULTATION_CONSENT_VERSION }) }]);
    // The tenant of the unit cannot see the owner's consultation.
    expect(
      (await o.w.h.request(`/api/requests/${sent.requestId}/consultation`, { token: o.w.tenantToken }))
        .status,
    ).toBe(404);
  });

  it('O5/C-VAL-1: refused without consent, with wrong answers, on a non-working day, or for someone else', async () => {
    const o = await offices();
    const send = (json: object, token = o.w.ownerToken) => post(o.w, '/api/consultations', token, json);
    expect((await send({ ...leasing, consent: false })).status).toBe(400);
    expect((await send({ ...leasing, consentVersion: 'v0' })).status).toBe(400);
    expect((await send({ ...leasing, answers: { furnished: 'unfurnished' } })).status).toBe(400);
    expect((await send({ ...leasing, bestDate: '2026-11-14' })).status).toBe(400); // a Saturday
    expect((await send({ ...leasing, sfUnitId: 'a0X000000000999AAA' })).status).toBe(404);
    expect((await send(leasing, o.w.tenantToken)).status).toBe(403);
    expect((await send(leasing, o.harbor)).status).toBe(403);
    expect(rows(o.w, 'SELECT count(*) AS n FROM consultations')).toEqual([{ n: 0 }]);
  });

  it('O5: the consent names the provider shown; if the service moved to another one, the owner is asked again', async () => {
    const o = await offices();
    const res = await o.w.h.request('/api/consultations/provider/mortgage', { token: o.w.ownerToken });
    expect(consultationProviderResponse.parse(await res.json()).provider).toEqual({
      id: 'p-primary',
      name: 'Primary Fixers LLC',
    });
    expect(
      (await o.w.h.request('/api/consultations/provider/maintenance', { token: o.w.ownerToken })).status,
    ).toBe(404);
    expect((await o.w.h.request('/api/consultations/provider/mortgage', { token: o.harbor })).status).toBe(
      403,
    );
    const moved = await post(o.w, '/api/consultations', o.w.ownerToken, {
      ...leasing,
      providerId: 'p-primary',
    });
    expect(moved.status).toBe(409);
    expect(await moved.json()).toMatchObject({ code: 'provider_changed' });
  });

  it('O5: the visit form cannot be used for a consultation (the consent would be skipped)', async () => {
    const o = await offices();
    const res = await post(o.w, '/api/requests', o.w.ownerToken, {
      sfUnitId: SF_UNIT,
      serviceCode: 'leasing',
      description: 'Lease it please.',
      preferredDate: DAY,
      preferredSlot: 'morning',
    });
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ code: 'consultation' });
  });

  it('S2: "coming soon" without a provider', async () => {
    const o = await offices();
    o.w.h.sqlite.prepare("DELETE FROM service_partners WHERE service_code = 'resale'").run();
    const res = await post(o.w, '/api/consultations', o.w.ownerToken, {
      ...leasing,
      serviceCode: 'resale',
      answers: { timeframe: 'asap' },
    });
    expect(res.status).toBe(422);
  });
});

describe("the owner's contact details (ADR 0031)", () => {
  it('C-AZ-2/C-AUD-1: the consented office sees them, and every view is audited', async () => {
    const o = await offices();
    const id = await raised(o);
    expect((await view(o, id, o.harbor))?.contactShared).toBe(true);
    expect((await view(o, id, o.w.ownerToken))?.contactShared).toBe(false);
    const res = await o.w.h.request(`/api/partner/jobs/${id}/consultation/contact`, { token: o.harbor });
    expect(res.status).toBe(200);
    expect(consultationContactResponse.parse(await res.json())).toEqual({
      name: 'Layla Haddad',
      email: 'layla.haddad@example.com',
      phone: null,
    });
    expect(
      rows(o.w, "SELECT actor_role, target_id FROM audit_log WHERE action = 'consultation_contact_viewed'"),
    ).toEqual([{ actor_role: 'partner_admin', target_id: id }]);
  });

  it('C-AZ-1/C-AZ-2: never for technicians, other offices, or once the request is over', async () => {
    const o = await offices();
    const id = await raised(o);
    const contact = (token: string) =>
      o.w.h.request(`/api/partner/jobs/${id}/consultation/contact`, { token });
    expect((await contact(o.harborMember)).status).toBe(403);
    expect((await contact(o.primary)).status).toBe(404);
    expect((await contact(o.w.ownerToken)).status).toBe(403);
    expect((await post(o.w, `/api/requests/${id}/close`, o.w.ownerToken, { reason: 'cancel' })).status).toBe(
      200,
    );
    expect((await contact(o.harbor)).status).toBe(403);
    expect(
      rows(o.w, "SELECT count(*) AS n FROM audit_log WHERE action = 'consultation_contact_viewed'"),
    ).toEqual([{ n: 0 }]);
  });

  it('a request that is not a consultation has no consultation and no contact route', async () => {
    const o = await offices();
    const res = await post(o.w, '/api/requests', o.w.ownerToken, {
      sfUnitId: SF_UNIT,
      serviceCode: 'maintenance',
      description: 'Tap drips.',
      preferredDate: DAY,
      preferredSlot: 'morning',
    });
    const { requestId } = requestRaisedResponse.parse(await res.json());
    expect(await view(o, requestId, o.w.ownerToken)).toBeNull();
  });
});

describe("the provider's steps (O5, P5, S4)", () => {
  it('S4/P5: contact made meets the first deadline; the listing is due in 3 working days; "Listed" meets it', async () => {
    const o = await offices();
    const id = await raised(o);
    o.w.h.clock = NOW + 10 * 60_000;
    expect((await step(o, id, 'contact-made', { note: 'Call me back on +971 50 000 0000.' })).status).toBe(
      200,
    );
    expect(rows(o.w, 'SELECT status, next_due_at, next_due_kind FROM requests')).toEqual([
      {
        status: 'in_progress',
        next_due_at: addWorkingMinutes(NOW + 10 * 60_000, 3 * WORKING_DAY, DEFAULT_CALENDAR),
        next_due_kind: 'listing',
      },
    ]);
    expect(rows(o.w, 'SELECT partner_id, metric, outcome FROM sla_outcomes')).toEqual([
      { partner_id: 'harbor', metric: 'service_milestone', outcome: 'met' },
    ]);
    expect((await step(o, id, 'contact-made')).status).toBe(409);
    expect((await step(o, id, 'stage', { stage: 'pre_approval' })).status).toBe(400); // not a leasing stage
    expect((await step(o, id, 'stage', { stage: 'listed', note: 'On the portals.' })).status).toBe(200);
    expect(rows(o.w, 'SELECT next_due_at, next_due_kind FROM requests')).toEqual([
      { next_due_at: null, next_due_kind: null },
    ]);
    expect((await step(o, id, 'stage', { stage: 'listed' })).status).toBe(400); // forward only
    const seen = await view(o, id, o.w.ownerToken);
    expect(seen?.steps.map((s) => s.step)).toEqual(['contact_made', 'listed']);
    // ADR 0009: contact details in a note are masked; the owner sees the rest.
    expect(seen?.steps[0]?.note).not.toContain('000 0000');
    expect(seen?.steps[1]?.note).toBe('On the portals.');
    expect(seen?.actions).toEqual([]);
    expect((await view(o, id, o.harbor))?.actions).toEqual(['move_stage', 'close']);
  });

  it('C-AZ-1/C-AZ-2: another office gets 404; technicians and owners cannot take provider steps', async () => {
    const o = await offices();
    const id = await raised(o);
    expect((await step(o, id, 'contact-made', {}, o.primary)).status).toBe(404);
    expect((await step(o, id, 'contact-made', {}, o.harborMember)).status).toBe(403);
    expect((await step(o, id, 'contact-made', {}, o.w.ownerToken)).status).toBe(403);
    // The visit journey's steps do not apply to a consultation.
    expect((await post(o.w, `/api/partner/jobs/${id}/start`, o.harborMember)).status).toBe(409);
  });

  it('P5: Done → the owner closes it and rates; the scorecard gets the rating', async () => {
    const o = await offices();
    const id = await raised(o);
    await step(o, id, 'contact-made');
    expect((await step(o, id, 'close', { outcome: 'done', note: 'Tenant moved in.' })).status).toBe(200);
    expect(rows(o.w, 'SELECT status FROM requests')).toEqual([{ status: 'completed' }]);
    expect((await view(o, id, o.harbor))?.actions).toEqual([]);
    expect((await post(o.w, `/api/requests/${id}/confirm`, o.w.ownerToken, { done: false })).status).toBe(
      409,
    );
    expect((await post(o.w, `/api/requests/${id}/confirm`, o.w.ownerToken, { done: true })).status).toBe(200);
    expect((await post(o.w, `/api/requests/${id}/rating`, o.w.ownerToken, { stars: 5 })).status).toBe(201);
    expect(rows(o.w, 'SELECT partner_id, stars FROM ratings')).toEqual([{ partner_id: 'harbor', stars: 5 }]);
  });

  it('P5: Did not proceed needs a reason the owner sees, and is not rated', async () => {
    const o = await offices();
    const id = await raised(o, {
      ...leasing,
      serviceCode: 'mortgage',
      answers: { purpose: 'buying', amount: '1m_3m' },
      providerId: 'p-primary',
    });
    await step(o, id, 'contact-made', {}, o.primary);
    expect((await step(o, id, 'close', { outcome: 'did_not_proceed' }, o.primary)).status).toBe(400);
    expect(
      (await step(o, id, 'close', { outcome: 'did_not_proceed', note: 'The bank declined.' }, o.primary))
        .status,
    ).toBe(200);
    expect((await view(o, id, o.w.ownerToken))?.steps.at(-1)).toMatchObject({
      step: 'did_not_proceed',
      note: 'The bank declined.',
    });
    await post(o.w, `/api/requests/${id}/confirm`, o.w.ownerToken, { done: true });
    expect((await post(o.w, `/api/requests/${id}/rating`, o.w.ownerToken, { stars: 1 })).status).toBe(409);
  });

  it('O5: the owner can say "No longer needed" while it is in progress', async () => {
    const o = await offices();
    const id = await raised(o);
    await step(o, id, 'contact-made');
    expect((await post(o.w, `/api/requests/${id}/close`, o.w.ownerToken, { reason: 'cancel' })).status).toBe(
      200,
    );
    expect(rows(o.w, 'SELECT status, close_reason FROM requests')).toEqual([
      { status: 'cancelled', close_reason: 'cancelled_by_requester' },
    ]);
    expect((await step(o, id, 'stage', { stage: 'listed' })).status).toBe(409);
  });

  it('S4/R4: an overdue consultation shows in JAD+ Admin "Needs action"', async () => {
    const o = await offices();
    const id = await raised(o);
    o.w.h.clock = NOW + 7 * 86_400_000;
    // Signed in again: the console session from the start has long expired.
    const admin = await o.w.h.signIn('demo@jadplus.ae', 'console');
    const res = await o.w.h.request('/api/admin/attention', { token: admin });
    const items = adminAttentionResponse.parse(await res.json()).items;
    expect(items.filter((i) => i.kind === 'overdue').map((i) => i.requestId)).toEqual([id]);
  });
});

describe('migration 0028 mirrors consultation.ts (no drift)', () => {
  it('every consultation service and step id is accepted, and nothing else; both tables are append-only', async () => {
    const o = await offices();
    const id = await raised(o);
    const db = o.w.h.sqlite;
    const table = rows(o.w, "SELECT sql FROM sqlite_master WHERE name = 'consultations'")[0] as {
      sql: string;
    };
    const listed = /service_code IN \(([^)]*)\)/.exec(table.sql)?.[1] ?? '';
    expect([...listed.matchAll(/'([^']+)'/g)].map((m) => m[1]).sort()).toEqual(
      [...CONSULTATION_SERVICE_CODES].sort(),
    );
    const cons = db.prepare(
      "INSERT INTO consultations (request_id, service_code, answers, consent_partner_id, consent_version, consented_at) VALUES (?, ?, '{}', 'harbor', 'v', 1)",
    );
    expect(() => cons.run(id, 'maintenance')).toThrow(/CHECK/);
    const insert = db.prepare(
      'INSERT INTO consultation_steps (id, request_id, step, note, partner_id, actor_user_id, at) VALUES (?, ?, ?, ?, ?, ?, 1)',
    );
    const actor = (rows(o.w, 'SELECT id FROM users LIMIT 1')[0] as { id: string }).id;
    for (const s of CONSULTATION_STEP_IDS) {
      expect(() => insert.run(`s-${s}`, id, s, 'n', 'harbor', actor)).not.toThrow();
    }
    expect(() => insert.run('s-x', id, 'teleported', null, 'harbor', actor)).toThrow(/CHECK/);
    expect(() => db.prepare('DELETE FROM consultation_steps').run()).toThrow(/append-only/);
    expect(() => db.prepare("UPDATE consultations SET consent_version = 'x'").run()).toThrow(/append-only/);
  });
});
