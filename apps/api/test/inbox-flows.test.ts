/**
 * Notifications for consultations, reports and snags (ADR 0035): O3, O5, P5, A4, C-AZ-1, C-AZ-2. Each item is
 * written once, in the same batch as the change, to the right people only; the facts are codes, never words.
 */
import {
  CONSULTATION_CONSENT_VERSION,
  DEFAULT_CALENDAR,
  dubaiDate,
  inboxResponse,
  preferredDays,
} from '@jadplus/shared';
import { describe, expect, it } from 'vitest';
import { runRequestClock } from '../src/jobs/request-clock.js';
import { runReminders } from '../src/jobs/reminders.js';
import { createLogger } from '../src/logger.js';
import { NOW, SF_UNIT } from './db.js';
import { jpegWithLocation } from './fixtures.js';
import { rows, world, type World } from './emergency-world.js';
import { inspect, pdf, post, raiseReport, reportWorld, upload, type ReportWorld } from './reports-world.js';

const HOUR = 3_600_000;
const items = async (w: World, token: string) =>
  inboxResponse.parse(await (await w.h.request('/api/me/inbox', { token })).json()).items;
const kinds = async (w: World, token: string) => (await items(w, token)).map((i) => i.kind);

interface Consult extends World {
  readonly harbor: string;
}

async function consultWorld(): Promise<Consult> {
  const w = await world();
  const db = w.h.sqlite;
  db.prepare(
    "INSERT INTO partners (id, name, kind, created_at, updated_at) VALUES ('harbor', 'Harbor (demo)', 'jad_group', ?, ?)",
  ).run(NOW, NOW);
  db.prepare(
    "INSERT INTO service_partners (id, service_code, partner_id, rank, started_at) VALUES ('sp-l', 'leasing', 'harbor', 'primary', ?)",
  ).run(NOW);
  await w.h.addUser({ email: 'harbor.office@example.com', roles: [['partner_admin', 'harbor']] });
  return { ...w, harbor: await w.h.signIn('harbor.office@example.com', 'console') };
}

async function leasing(w: Consult): Promise<string> {
  const res = await post(w, '/api/consultations', w.ownerToken, {
    sfUnitId: SF_UNIT,
    serviceCode: 'leasing',
    answers: { furnished: 'unfurnished', available_from: '2026-12-15' },
    bestDate: preferredDays(dubaiDate(NOW), DEFAULT_CALENDAR)[0] ?? '',
    bestSlot: 'morning',
    providerId: 'harbor',
    consent: true,
    consentVersion: CONSULTATION_CONSENT_VERSION,
  });
  expect(res.status).toBe(201);
  return (await res.json<{ requestId: string }>()).requestId;
}

const step = (w: Consult, id: string, what: string, json: object = {}) =>
  post(w, `/api/partner/jobs/${id}/consultation/${what}`, w.harbor, json);

describe('consultations (O5, P5)', () => {
  it('O5/P5: contact made, a stage with a note and the end each tell the owner once; nobody else', async () => {
    const w = await consultWorld();
    const id = await leasing(w);
    expect((await step(w, id, 'contact-made')).status).toBe(200);
    expect((await step(w, id, 'stage', { stage: 'listed', note: 'Live on two portals.' })).status).toBe(200);
    expect(
      (await step(w, id, 'close', { outcome: 'did_not_proceed', note: 'Owner chose to sell.' })).status,
    ).toBe(200);
    const owner = await items(w, w.ownerToken);
    expect(owner.map((i) => [i.kind, i.requestId, i.data])).toEqual([
      ['consultation_closed', id, { service: 'leasing', outcome: 'did_not_proceed', hasNote: true }],
      ['stage_reached', id, { service: 'leasing', stage: 'listed', hasNote: true }],
      ['consultation_contact_made', id, { service: 'leasing', hasNote: false }],
    ]);
    // C-PD-1: the notes stay on the request, never in the notification.
    expect(JSON.stringify(rows(w, 'SELECT data FROM inbox'))).not.toContain('portals');
    // R2: the tenant of the unit is told nothing; the office gets only its own items.
    expect(await kinds(w, w.tenantToken)).toEqual([]);
    expect(await kinds(w, w.harbor)).not.toContain('stage_reached');
  });

  it('A4: the reminders and the auto-close carry the consultation flow (the app asks to close the request)', async () => {
    const w = await consultWorld();
    const id = await leasing(w);
    await step(w, id, 'contact-made');
    await step(w, id, 'close', { outcome: 'done' });
    await runReminders(w.h.env.DB, NOW + 25 * HOUR);
    await runRequestClock(
      w.h.env.DB,
      NOW + 73 * HOUR,
      createLogger({}, () => undefined),
    );
    const owner = await items(w, w.ownerToken);
    expect(owner.filter((i) => i.kind === 'confirm_reminder').map((i) => i.data)).toEqual([
      { hours: 24, flow: 'consultation' },
    ]);
    expect(owner.find((i) => i.kind === 'auto_closed')?.data).toEqual({ flow: 'consultation' });
  });
});

const jpeg = () => jpegWithLocation() as Uint8Array<ArrayBuffer>;
const addSnag = async (w: ReportWorld, id: string, title: string) =>
  (
    await (
      await post(w, `/api/requests/${id}/snags`, w.inspectorOffice, { title, room: 'Kitchen' })
    ).json<{ id: string }>()
  ).id;
const fix = (w: ReportWorld, id: string, snag: string, token: string) =>
  upload(w, `/api/requests/${id}/snags/${snag}/fix`, token, jpeg(), 'image/jpeg');
const decide = (w: ReportWorld, id: string, snag: string, confirm: boolean) =>
  post(w, `/api/requests/${id}/snags/${snag}/decision`, w.ownerToken, { confirm });

async function reported(w: ReportWorld): Promise<{ id: string; a: string; b: string }> {
  const id = await raiseReport(w, 'snagging');
  await inspect(w, id, w.inspectorOffice, 't-inspector');
  const a = await addSnag(w, id, 'Cracked tile');
  const b = await addSnag(w, id, 'Door does not close');
  expect(
    (await upload(w, `/api/requests/${id}/report`, w.inspectorOffice, pdf(), 'application/pdf')).status,
  ).toBe(201);
  return { id, a, b };
}

const only = async (w: ReportWorld, token: string, kind: string) =>
  (await items(w, token)).filter((i) => i.kind === kind);

describe('reports and snags (O3)', () => {
  it('O3: a snagging report tells the owner; with open snags the handover team gets "snags to fix", not the inspector', async () => {
    const w = await reportWorld();
    const { id } = await reported(w);
    expect((await only(w, w.ownerToken, 'report_ready')).map((i) => i.data)).toEqual([
      { reportKind: 'snagging' },
    ]);
    expect((await only(w, w.handoverOffice, 'snags_to_fix')).map((i) => [i.requestId, i.data])).toEqual([
      [id, { count: 2 }],
    ]);
    // The handover team sees nothing else of the request (ADR 0032), and the inspector no "snags to fix".
    expect(await kinds(w, w.handoverOffice)).toEqual(['snags_to_fix']);
    expect(await only(w, w.inspectorOffice, 'snags_to_fix')).toEqual([]);
    expect(await kinds(w, w.tenantToken)).toEqual([]);
  });

  it('L2: a valuation report tells the owner; no snag item for anyone', async () => {
    const w = await reportWorld();
    const id = await raiseReport(w, 'valuation');
    expect(
      (await upload(w, `/api/requests/${id}/report`, w.valuerOffice, pdf(), 'application/pdf')).status,
    ).toBe(201);
    expect((await only(w, w.ownerToken, 'report_ready')).map((i) => i.data)).toEqual([
      { reportKind: 'valuation' },
    ]);
    expect(rows(w, "SELECT count(*) AS n FROM inbox WHERE kind = 'snags_to_fix'")).toEqual([{ n: 0 }]);
  });

  it('O3: fixed asks the owner to check; reopened tells the inspector and the team; the last confirmation tells the inspector once', async () => {
    const w = await reportWorld();
    const { id, a, b } = await reported(w);
    expect((await fix(w, id, a, w.handoverOffice)).status).toBe(200);
    expect((await fix(w, id, b, w.inspectorOffice)).status).toBe(200);
    expect(await only(w, w.ownerToken, 'snag_fixed')).toHaveLength(2);
    expect((await decide(w, id, a, false)).status).toBe(200);
    expect((await only(w, w.inspectorOffice, 'snag_reopened')).map((i) => i.requestId)).toEqual([id]);
    expect((await only(w, w.inspectorTech, 'snag_reopened')).map((i) => i.requestId)).toEqual([id]);
    expect((await only(w, w.handoverOffice, 'snags_to_fix')).map((i) => i.data)).toEqual([
      { count: 1, reopened: true },
      { count: 2 },
    ]);
    await fix(w, id, a, w.handoverOffice);
    expect((await decide(w, id, b, true)).status).toBe(200);
    expect(await only(w, w.inspectorOffice, 'snags_all_confirmed')).toEqual([]);
    expect((await decide(w, id, a, true)).status).toBe(200);
    expect(await only(w, w.inspectorOffice, 'snags_all_confirmed')).toHaveLength(1);
    // C-AZ-2: owners never see provider items.
    expect(
      (await kinds(w, w.ownerToken)).filter((k) => k.startsWith('snags_') || k === 'snag_reopened'),
    ).toEqual([]);
  });

  it('O3: the free re-inspection tells the provider to book it', async () => {
    const w = await reportWorld();
    const { id, a, b } = await reported(w);
    for (const s of [a, b]) {
      await fix(w, id, s, w.inspectorOffice);
      await decide(w, id, s, true);
    }
    expect((await post(w, `/api/requests/${id}/reinspection`, w.ownerToken)).status).toBe(200);
    expect((await only(w, w.inspectorOffice, 'reinspection_requested')).map((i) => i.requestId)).toEqual([
      id,
    ]);
    expect(await only(w, w.ownerToken, 'reinspection_requested')).toEqual([]);
  });

  it('C-AZ-2: the team stops seeing "snags to fix" once it no longer has the handover service or the request closes', async () => {
    const w = await reportWorld();
    const { id } = await reported(w);
    expect(await kinds(w, w.handoverOffice)).toEqual(['snags_to_fix']);
    w.h.sqlite.prepare("UPDATE service_partners SET ended_at = ? WHERE id = 'sp-handover'").run(NOW);
    expect(await kinds(w, w.handoverOffice)).toEqual([]);
    w.h.sqlite.prepare("UPDATE service_partners SET ended_at = NULL WHERE id = 'sp-handover'").run();
    w.h.sqlite
      .prepare("UPDATE requests SET status = 'closed', close_reason = 'confirmed' WHERE id = ?")
      .run(id);
    expect(await kinds(w, w.handoverOffice)).toEqual([]);
  });

  it('soft snagging: the handover team is the provider, so it gets no duplicate "snags to fix"', async () => {
    const w = await reportWorld();
    const id = await raiseReport(w, 'snagging', 'soft');
    expect(rows(w, 'SELECT partner_id FROM requests WHERE id = ?', id)).toEqual([
      { partner_id: 'p-handover' },
    ]);
    w.h.sqlite.prepare("UPDATE requests SET status = 'in_progress' WHERE id = ?").run(id);
    const snag = await post(w, `/api/requests/${id}/snags`, w.handoverOffice, {
      title: 'Loose handle',
      room: 'Bedroom',
    });
    expect(snag.status).toBe(201);
    expect(
      (await upload(w, `/api/requests/${id}/report`, w.handoverOffice, pdf(), 'application/pdf')).status,
    ).toBe(201);
    expect(await only(w, w.handoverOffice, 'snags_to_fix')).toEqual([]);
    expect(rows(w, 'SELECT status FROM requests WHERE id = ?', id)).toEqual([{ status: 'in_progress' }]);
  });
});
