/**
 * Notifications for the handover checklist, investor education and the helpers kept for the next flows
 * (ADR 0035): O2, O5, S4, C-AZ-2; and migration 0031 (the inbox rebuilt with session items and items that point
 * at nothing, every row kept, the CHECK lists mirroring packages/shared).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  DEFAULT_CALENDAR,
  INBOX_KINDS,
  SESSION_KINDS,
  UNTARGETED_KINDS,
  dubaiDate,
  inboxResponse,
  preferredDays,
} from '@jadplus/shared';
import { describe, expect, it } from 'vitest';
import { runReminders } from '../src/jobs/reminders.js';
import {
  deliveryScheduledStatement,
  stageReachedStatement,
  statementReadyStatement,
} from '../src/requests/inbox-flows.js';
import { NOW, addUser, insert, migratedDb, migrationFiles, requestRow, seedWorld } from './db.js';
import { rows, world, type World } from './emergency-world.js';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const items = async (w: World, token: string) =>
  inboxResponse.parse(await (await w.h.request('/api/me/inbox', { token })).json()).items;
const send = (w: World, method: string, path: string, token: string, json?: object) =>
  w.h.request(path, { method, token, ...(json === undefined ? {} : { json }) });

/** The demo owner's handover request, with the JAD Global team that has it. */
async function handoverWorld(): Promise<World & { team: string }> {
  const w = await world();
  const db = w.h.sqlite;
  await w.h.addUser({ email: 'harbor.pm.demo@jadplus.ae', roles: [['partner_admin', 'p-harbor']] });
  db.prepare("UPDATE partners SET kind = 'jad_group' WHERE id = 'p-harbor'").run();
  db.prepare(
    "INSERT INTO service_partners (id, service_code, partner_id, rank, started_at) VALUES ('sp-h', 'handover', 'p-harbor', 'primary', ?)",
  ).run(NOW);
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
      status: 'assigned',
      partner_id: 'p-harbor',
    }),
  );
  return { ...w, team: await w.h.signIn('harbor.pm.demo@jadplus.ae', 'console') };
}

describe('handover checklist (O2)', () => {
  it('O2: steps done, the key collection booked and moved, and keys collected each tell the owner; put back says nothing', async () => {
    const w = await handoverWorld();
    const res = await send(w, 'POST', '/api/partner/handovers', w.team, { requestId: 'req-h' });
    const id = (await res.json<{ id: string }>()).id;
    const tick = (step: string, done = true, note: string | null = null) =>
      send(w, 'POST', `/api/partner/handovers/${id}/steps`, w.team, { step, done, note });
    expect((await tick('final_payment', true, 'Cleared, ref 4471.')).status).toBe(200);
    expect((await tick('final_payment', false)).status).toBe(200);
    expect((await tick('final_payment')).status).toBe(200);
    const [day1, day2] = preferredDays(dubaiDate(NOW), DEFAULT_CALENDAR);
    const book = (date: string | undefined) =>
      send(w, 'PUT', `/api/partner/handovers/${id}/appointment`, w.team, { date, slot: 'morning' });
    expect((await book(day1)).status).toBe(200);
    expect((await book(day2)).status).toBe(200);
    for (const step of ['documents', 'snagging', 'utilities', 'service_charges', 'keys_collected']) {
      expect((await tick(step)).status).toBe(200);
    }
    const owner = (await items(w, w.ownerToken)).reverse();
    expect(owner.map((i) => [i.kind, i.requestId, i.data])).toEqual([
      ['handover_step_done', 'req-h', { step: 'final_payment', hasNote: true }],
      ['handover_step_done', 'req-h', { step: 'final_payment', hasNote: false }],
      ['key_collection_booked', 'req-h', { date: day1, slot: 'morning', moved: false }],
      ['key_collection_booked', 'req-h', { date: day2, slot: 'morning', moved: true }],
      ['handover_step_done', 'req-h', { step: 'documents', hasNote: false }],
      ['handover_step_done', 'req-h', { step: 'snagging', hasNote: false }],
      ['handover_step_done', 'req-h', { step: 'utilities', hasNote: false }],
      ['handover_step_done', 'req-h', { step: 'service_charges', hasNote: false }],
      ['handover_complete', 'req-h', {}],
    ]);
    expect(JSON.stringify(rows(w, 'SELECT data FROM inbox'))).not.toContain('4471');
    expect(await items(w, w.tenantToken)).toEqual([]);
  });
});

interface Edu extends World {
  readonly admin: string;
  readonly other: string;
}

async function educationWorld(): Promise<Edu> {
  const w = await world();
  await w.h.addUser({ email: 'demo@jadplus.ae', roles: ['jad_admin'] });
  await w.h.addUser({ email: 'other.owner@example.com', roles: ['owner'] });
  return {
    ...w,
    admin: await w.h.signIn('demo@jadplus.ae', 'console'),
    other: await w.h.signIn('other.owner@example.com'),
  };
}

const session = (startsAt: number, extra: object = {}) => ({
  title: 'Investing in Dubai off-plan',
  description: 'How payment plans, handover and resale work.',
  startsAt,
  endsAt: startsAt + 2 * HOUR,
  mode: 'in_person',
  place: 'JAD Global office, Business Bay',
  seats: 20,
  ...extra,
});

async function scheduled(w: Edu, startsAt: number): Promise<string> {
  const res = await send(w, 'POST', '/api/admin/education/sessions', w.admin, session(startsAt));
  expect(res.status).toBe(201);
  return (await res.json<{ id: string }>()).id;
}

describe('investor education (O5, S4)', () => {
  it('O5: seat holders are told of a new time or a cancellation; a new title alone, or a seat given back, says nothing', async () => {
    const w = await educationWorld();
    const id = await scheduled(w, NOW + 3 * DAY);
    expect((await send(w, 'POST', `/api/education/sessions/${id}/seat`, w.ownerToken)).status).toBe(201);
    await send(w, 'POST', `/api/education/sessions/${id}/seat`, w.other);
    await send(w, 'POST', `/api/education/sessions/${id}/seat/cancel`, w.other);
    const put = (body: object) => send(w, 'PUT', `/api/admin/education/sessions/${id}`, w.admin, body);
    expect((await put(session(NOW + 3 * DAY, { title: 'Off-plan investing' }))).status).toBe(200);
    expect(await items(w, w.ownerToken)).toEqual([]);
    expect((await put(session(NOW + 4 * DAY))).status).toBe(200);
    expect(
      (await put(session(NOW + 4 * DAY, { mode: 'online', place: 'https://meet.example.com/x' }))).status,
    ).toBe(200);
    expect((await send(w, 'POST', `/api/admin/education/sessions/${id}/cancel`, w.admin)).status).toBe(200);
    const owner = (await items(w, w.ownerToken)).reverse();
    expect(owner.map((i) => [i.kind, i.requestId, i.data])).toEqual([
      ['session_changed', null, { startsAt: NOW + 4 * DAY, moved: true }],
      ['session_changed', null, { startsAt: NOW + 4 * DAY, moved: false }],
      ['session_cancelled', null, { startsAt: NOW + 4 * DAY }],
    ]);
    expect(rows(w, 'SELECT DISTINCT session_id FROM inbox')).toEqual([{ session_id: id }]);
    expect(await items(w, w.other)).toEqual([]);
  });

  it('S4: the day-before reminder comes once per start time, again after a move; never for a seat taken in the last 2 hours', async () => {
    const w = await educationWorld();
    const id = await scheduled(w, NOW + 3 * DAY);
    await send(w, 'POST', `/api/education/sessions/${id}/seat`, w.ownerToken);
    expect((await runReminders(w.h.env.DB, NOW + 2 * DAY - HOUR)).sessions).toBe(0);
    expect((await runReminders(w.h.env.DB, NOW + 2 * DAY + HOUR)).sessions).toBe(1);
    expect((await runReminders(w.h.env.DB, NOW + 2 * DAY + 2 * HOUR)).sessions).toBe(0);
    await send(w, 'PUT', `/api/admin/education/sessions/${id}`, w.admin, session(NOW + 5 * DAY));
    await runReminders(w.h.env.DB, NOW + 4 * DAY + HOUR);
    const reminders = (await items(w, w.ownerToken)).filter((i) => i.kind === 'session_reminder');
    expect(reminders.map((i) => i.data)).toEqual([{ startsAt: NOW + 5 * DAY }, { startsAt: NOW + 3 * DAY }]);

    const soon = await scheduled(w, NOW + HOUR);
    await send(w, 'POST', `/api/education/sessions/${soon}/seat`, w.other);
    expect((await runReminders(w.h.env.DB, NOW + 10 * 60_000)).sessions).toBe(0);
    expect(await items(w, w.other)).toEqual([]);
  });

  it('O5: "book sent" reaches the owner who asked, pointing at nothing', async () => {
    const w = await educationWorld();
    await send(w, 'POST', '/api/education/book', w.ownerToken);
    const [request] = rows(w, 'SELECT id FROM education_book_requests') as { id: string }[];
    expect(
      (await send(w, 'POST', `/api/admin/education/books/${request?.id ?? ''}/sent`, w.admin)).status,
    ).toBe(200);
    expect((await items(w, w.ownerToken)).map((i) => [i.kind, i.requestId, i.tenancyId])).toEqual([
      ['book_sent', null, null],
    ]);
    expect(await items(w, w.other)).toEqual([]);
  });
});

describe('helpers for the next flows (wave 3)', () => {
  it('stage, delivery and statement items go to the request owner only; a statement once per period', async () => {
    const w = await world();
    const db = w.h.env.DB;
    insert(
      w.h.sqlite,
      'requests',
      requestRow({
        id: 'req-f',
        ref: 'JAD-F0001',
        service_code: 'furnishing',
        owner_user_id: w.owner,
        raised_by_user_id: w.tenant,
      }),
    );
    await db.batch([
      stageReachedStatement(db, {
        requestId: 'req-f',
        service: 'interior-design',
        stage: 'concept',
        hasNote: false,
        at: NOW,
      }),
      deliveryScheduledStatement(db, {
        requestId: 'req-f',
        date: '2026-12-01',
        slot: 'midday',
        moved: false,
        at: NOW + 1,
      }),
      statementReadyStatement(db, { requestId: 'req-f', period: '2026-11', at: NOW + 2 }),
      statementReadyStatement(db, { requestId: 'req-f', period: '2026-11', at: NOW + 3 }),
      statementReadyStatement(db, { userId: w.owner, period: '2026-10', at: NOW + 4 }),
    ]);
    const owner = await items(w, w.ownerToken);
    expect(owner.map((i) => [i.kind, i.requestId, i.data])).toEqual([
      ['statement_ready', null, { period: '2026-10' }],
      ['statement_ready', 'req-f', { period: '2026-11' }],
      ['delivery_scheduled', 'req-f', { date: '2026-12-01', moved: false, slot: 'midday' }],
      ['stage_reached', 'req-f', { service: 'interior-design', stage: 'concept', hasNote: false }],
    ]);
    // The tenant of the unit, who can see this request, still sees none of the owner's items (R2).
    expect(await items(w, w.tenantToken)).toEqual([]);
  });
});

const MIGRATIONS = join(import.meta.dirname, '..', 'migrations');

describe('migration 0031: the inbox rebuilt', () => {
  it('keeps every existing row (request, tenancy and notice items) with its read time and dedupe key', () => {
    const db = new DatabaseSync(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    const files = migrationFiles();
    const at = files.indexOf('0031_inbox_service_flows.sql');
    for (const f of files.slice(0, at)) db.exec(readFileSync(join(MIGRATIONS, f), 'utf8'));
    seedWorld(db);
    insert(db, 'requests', requestRow());
    insert(db, 'inbox', {
      id: 'i1',
      user_id: 'u-owner',
      request_id: 'req-1',
      kind: 'work_done',
      at: NOW,
      read_at: NOW + 1,
      dedupe_key: 'k1',
    });
    insert(db, 'inbox', {
      id: 'i2',
      user_id: 'u-tenant',
      tenancy_id: 'ten-1',
      kind: 'tenancy_invited',
      data: '{"days":3}',
      at: NOW,
    });
    const before = db.prepare('SELECT * FROM inbox ORDER BY id').all();
    db.exec(readFileSync(join(MIGRATIONS, files[at] ?? ''), 'utf8'));
    expect(
      db
        .prepare(
          'SELECT id, user_id, request_id, tenancy_id, notice_id, kind, data, at, read_at, dedupe_key FROM inbox ORDER BY id',
        )
        .all(),
    ).toEqual(before);
    expect(
      db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'inbox' AND sql IS NOT NULL",
        )
        .all(),
    ).toEqual([{ name: 'inbox_user' }]);
  });

  it('allows a target for each kind as packages/shared says, and nothing else', () => {
    const db = migratedDb();
    seedWorld(db);
    addUser(db, 'u-staff');
    insert(db, 'requests', requestRow());
    insert(db, 'education_sessions', {
      id: 's-1',
      title: 'Session',
      description: 'About.',
      starts_at: NOW + DAY,
      ends_at: NOW + DAY + HOUR,
      mode: 'in_person',
      place: 'Office',
      seats: 5,
      created_at: NOW,
      created_by: 'u-staff',
      updated_at: NOW,
    });
    let n = 0;
    const put = (kind: string, target: Record<string, string>) => () => {
      n += 1;
      insert(db, 'inbox', { id: `x${String(n)}`, user_id: 'u-owner', kind, at: NOW, ...target });
    };
    expect(put('session_reminder', { session_id: 's-1' })).not.toThrow();
    expect(put('session_reminder', { request_id: 'req-1' })).toThrow(/CHECK/);
    expect(put('report_ready', { session_id: 's-1' })).toThrow(/CHECK/);
    expect(put('book_sent', {})).not.toThrow();
    expect(put('book_sent', { request_id: 'req-1' })).toThrow(/CHECK/);
    expect(put('statement_ready', {})).not.toThrow();
    expect(put('statement_ready', { request_id: 'req-1' })).not.toThrow();
    expect(put('report_ready', {})).toThrow(/CHECK/);
    expect(put('snags_to_fix', { request_id: 'req-1' })).not.toThrow();
  });

  it('mirrors the shared lists: every kind, the session kinds, the kinds that may point at nothing', () => {
    const sql = (
      migratedDb().prepare("SELECT sql FROM sqlite_master WHERE name = 'inbox'").get() as { sql: string }
    ).sql;
    const list = (re: RegExp) => (re.exec(sql)?.[1] ?? '').match(/'[a-z_]+'/g)?.map((k) => k.slice(1, -1));
    expect(list(/kind IN \(([^)]*)\)/)).toEqual([...INBOX_KINDS]);
    expect(list(/OR \(\s*kind IN \(([^)]*)\)/)).toEqual([...UNTARGETED_KINDS]);
    expect(INBOX_KINDS.filter((k) => k.startsWith('session_'))).toEqual([...SESSION_KINDS]);
  });
});
