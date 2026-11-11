/** Public holidays kept by JAD+ Admin (E20, S4; ADR 0028): C-AZ-1, C-AUD-1, C-VAL-1. */
import {
  DEFAULT_HOLIDAY_LIST,
  adminHolidaysResponse,
  calendarResponse,
  holidayChangedResponse,
  platformSettingsResponse,
} from '@jadplus/shared';
import { describe, expect, it } from 'vitest';
import { NOW, SF_UNIT, migratedDb } from './db.js';
import { rows, world, type World } from './emergency-world.js';

// The test clock NOW is Monday 9-Nov-2026, 12:00 Dubai.
const TOMORROW = '2026-11-10';

async function staff(w: World): Promise<{ admin: string; viewer: string }> {
  await w.h.addUser({ email: 'demo@jadplus.ae', roles: ['jad_admin'] });
  await w.h.addUser({ email: 'viewer@jadplus.ae', roles: ['jad_viewer'] });
  return {
    admin: await w.h.signIn('demo@jadplus.ae', 'console'),
    viewer: await w.h.signIn('viewer@jadplus.ae', 'console'),
  };
}

const add = (w: World, token: string, json: object) =>
  w.h.request('/api/admin/holidays', { method: 'POST', token, json });
const remove = (w: World, token: string, date: string) =>
  w.h.request(`/api/admin/holidays/${date}`, { method: 'DELETE', token });
const list = async (w: World, token: string) =>
  adminHolidaysResponse.parse(await (await w.h.request('/api/admin/holidays', { token })).json());
const audits = (w: World, action: string) =>
  rows(
    w,
    'SELECT actor_role, target_type, target_id, detail FROM audit_log WHERE action = ? ORDER BY seq',
    action,
  );

describe('holidays table (migration 0025)', () => {
  it('E20: is seeded with the holidays JAD+ shipped with (no drift from DEFAULT_HOLIDAYS)', () => {
    const seeded = migratedDb().prepare('SELECT date, name, added_by FROM holidays ORDER BY date').all();
    expect(seeded).toEqual(DEFAULT_HOLIDAY_LIST.map((h) => ({ ...h, added_by: null })));
  });

  it('E20: refuses a malformed date, a short name and a duplicate day', () => {
    const db = migratedDb();
    const put = (date: string, name: string) => () =>
      db.prepare('INSERT INTO holidays (date, name, added_at) VALUES (?, ?, ?)').run(date, name, NOW);
    expect(put('2027-02-30', 'Bad day')).toThrow(/CHECK/);
    expect(put('2027-2-3', 'Bad day')).toThrow(/CHECK/);
    expect(put('2027-02-03', 'X')).toThrow(/CHECK/);
    expect(put('2026-12-02', 'Again')).toThrow(/UNIQUE|PRIMARY/);
    expect(put('2027-02-03', 'Test day')).not.toThrow();
  });
});

describe('JAD+ Admin keeps the public holidays (E20)', () => {
  it('E20: staff read the list with what can still change; residents and partners cannot', async () => {
    const w = await world();
    const { viewer } = await staff(w);
    const answer = await list(w, viewer);
    expect(answer.today).toBe('2026-11-09');
    expect(answer.holidays).toHaveLength(DEFAULT_HOLIDAY_LIST.length);
    expect(answer.holidays.find((h) => h.date === '2026-01-01')?.editable).toBe(false);
    expect(answer.holidays.find((h) => h.date === '2026-12-02')).toMatchObject({
      name: 'National Day',
      editable: true,
    });
    expect((await w.h.request('/api/admin/holidays', { token: w.ownerToken })).status).toBe(403);
    expect((await w.h.request('/api/admin/holidays', { token: w.primaryToken })).status).toBe(403);
  });

  it('E20: JAD+ Admin adds a future holiday, audited with its date and name; a viewer cannot', async () => {
    const w = await world();
    const { admin, viewer } = await staff(w);
    expect((await add(w, viewer, { date: TOMORROW, name: 'Test holiday' })).status).toBe(403);
    const res = await add(w, admin, { date: TOMORROW, name: ' Test holiday ' });
    expect(res.status).toBe(201);
    expect(holidayChangedResponse.parse(await res.json())).toEqual({
      date: TOMORROW,
      name: 'Test holiday',
      removed: false,
    });
    expect((await list(w, viewer)).holidays.find((h) => h.date === TOMORROW)).toMatchObject({
      name: 'Test holiday',
      editable: true,
      addedAt: NOW,
    });
    expect(rows(w, 'SELECT added_by FROM holidays WHERE date = ?', TOMORROW)).toEqual([
      { added_by: expect.any(String) as unknown },
    ]);
    expect(audits(w, 'holiday_added')).toEqual([
      {
        actor_role: 'jad_admin',
        target_type: 'holiday',
        target_id: TOMORROW,
        detail: JSON.stringify({ date: TOMORROW, name: 'Test holiday' }),
      },
    ]);
  });

  it('E20: today, the past and a day that is already a holiday are refused; bodies are strict', async () => {
    const w = await world();
    const { admin } = await staff(w);
    expect((await add(w, admin, { date: '2026-11-09', name: 'Today' })).status).toBe(422);
    expect((await add(w, admin, { date: '2026-11-02', name: 'Last week' })).status).toBe(422);
    const twice = await add(w, admin, { date: '2026-12-02', name: 'National Day' });
    expect(twice.status).toBe(409);
    expect(await twice.json()).toMatchObject({ code: 'already_holiday' });
    expect((await add(w, admin, { date: TOMORROW, name: 'Test', extra: true })).status).toBe(400);
    expect((await add(w, admin, { date: '2026-11-31', name: 'Test' })).status).toBe(400);
    expect((await add(w, admin, { date: TOMORROW, name: 'T' })).status).toBe(400);
    expect(audits(w, 'holiday_added')).toEqual([]);
  });

  it('E20: JAD+ Admin removes a future holiday (audited with its date and name); past ones stay', async () => {
    const w = await world();
    const { admin, viewer } = await staff(w);
    expect((await remove(w, viewer, '2026-12-01')).status).toBe(403);
    const res = await remove(w, admin, '2026-12-01');
    expect(res.status).toBe(200);
    expect(holidayChangedResponse.parse(await res.json())).toEqual({
      date: '2026-12-01',
      name: 'Commemoration Day',
      removed: true,
    });
    expect(rows(w, 'SELECT date FROM holidays WHERE date = ?', '2026-12-01')).toEqual([]);
    expect(audits(w, 'holiday_removed')).toEqual([
      {
        actor_role: 'jad_admin',
        target_type: 'holiday',
        target_id: '2026-12-01',
        detail: JSON.stringify({ date: '2026-12-01', name: 'Commemoration Day' }),
      },
    ]);
    expect((await remove(w, admin, '2026-12-01')).status).toBe(404);
    expect((await remove(w, admin, '2026-01-01')).status).toBe(422);
    expect((await remove(w, admin, 'yesterday')).status).toBe(404);
    expect(audits(w, 'holiday_removed')).toHaveLength(1);
  });

  it('E20: the settings page shows the holidays on file', async () => {
    const w = await world();
    const { admin } = await staff(w);
    await add(w, admin, { date: TOMORROW, name: 'Test holiday' });
    const res = await w.h.request('/api/admin/settings', { token: admin });
    const settings = platformSettingsResponse.parse(await res.json());
    expect(settings.calendar.holidays).toContainEqual({ date: TOMORROW, name: 'Test holiday' });
  });
});

describe('the apps and the clocks use the holidays on file (E20, S4)', () => {
  it('E20: every signed-in person reads today and the holidays from today on; nobody else', async () => {
    const w = await world();
    const { admin } = await staff(w);
    await add(w, admin, { date: TOMORROW, name: 'Test holiday' });
    for (const token of [w.ownerToken, w.tenantToken, w.primaryToken, admin]) {
      const res = await w.h.request('/api/calendar', { token });
      expect(res.status).toBe(200);
      const answer = calendarResponse.parse(await res.json());
      expect(answer.today).toBe('2026-11-09');
      expect(answer.holidays[0]).toEqual({ date: TOMORROW, name: 'Test holiday' });
      expect(answer.holidays.every((h) => h.date >= '2026-11-09')).toBe(true);
    }
    expect((await w.h.request('/api/calendar')).status).toBe(401);
  });

  it('E20/S4: a holiday added for tomorrow is no longer offered and the 4-working-hour clock skips it', async () => {
    const w = await world();
    const { admin } = await staff(w);
    await add(w, admin, { date: TOMORROW, name: 'Test holiday' });
    const tap = {
      sfUnitId: SF_UNIT,
      serviceCode: 'maintenance',
      description: 'Kitchen tap is dripping.',
      preferredDate: TOMORROW,
      preferredSlot: 'morning',
    };
    const raise = (json: object) =>
      w.h.request('/api/requests', { method: 'POST', token: w.ownerToken, json });
    expect((await raise(tap)).status).toBe(400);
    // Monday 17:00 Dubai: one working hour today, Tuesday is the holiday, three more on Wednesday until 12:00.
    w.h.clock = Date.UTC(2026, 10, 9, 13);
    expect((await raise({ ...tap, preferredDate: '2026-11-11' })).status).toBe(201);
    expect(rows(w, "SELECT next_due_at FROM requests WHERE next_due_kind = 'routine_response'")).toEqual([
      { next_due_at: Date.UTC(2026, 10, 11, 8) },
    ]);
  });
});
